// POST /api/setups/monitor — fetch current prices and update setup statuses
// Can be triggered manually (Refresh Prices button) or by a cron job.

import sql from "@/lib/db";
import { auth } from "@/auth";
import { fetchStockData } from "@/lib/yahoo-finance";
import type { SetupStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pattern-aware expiry (calendar days). Shorter patterns resolve faster.
const PATTERN_EXPIRE_DAYS: Record<string, number> = {
  bull_flag:                  21,  // flags resolve in 1–3 weeks
  bear_flag:                  21,
  consolidation_breakout:     21,
  sma_bounce:                 21,
  momentum_continuation:      28,
  double_bottom:              35,
  falling_wedge:              42,
  rising_wedge:               42,
  inverse_head_and_shoulders: 56,
  cup_and_handle:             60,
};
const DEFAULT_EXPIRE_DAYS = 42;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  try {
    const rows = await sql`
      SELECT id, ticker, pattern, entry_price, stop_price, target_price, status, created_at
      FROM setups
      WHERE user_id = ${userId} AND status IN ('PENDING', 'ACTIVE')
    ` as {
      id: string;
      ticker: string;
      pattern: string;
      entry_price: number;
      stop_price: number;
      target_price: number;
      status: string;
      created_at: string;
    }[];

    if (rows.length === 0) {
      return Response.json({ updated: 0, statuses: {} });
    }

    // Fetch current price for each unique ticker
    const uniqueTickers = [...new Set(rows.map((r) => r.ticker))];
    const priceMap = new Map<string, number>();

    await Promise.allSettled(
      uniqueTickers.map(async (ticker) => {
        try {
          const data = await fetchStockData({ ticker, timeframe: "1d", bars: 5 });
          const last = data.bars[data.bars.length - 1];
          if (last) priceMap.set(ticker, last.close);
        } catch {
          // Skip — price unavailable
        }
      })
    );

    const now = new Date();

    let updated = 0;
    const statuses: Record<string, SetupStatus> = {};

    for (const row of rows) {
      const currentPrice = priceMap.get(row.ticker);
      const createdAt = new Date(row.created_at);

      // Pattern-aware expiry cutoff
      const expireDays = PATTERN_EXPIRE_DAYS[row.pattern] ?? DEFAULT_EXPIRE_DAYS;
      const expireCutoff = new Date(now.getTime() - expireDays * 24 * 60 * 60 * 1000);

      let newStatus: SetupStatus | null = null;
      let result: "WIN" | "LOSS" | null = null;
      let returnPercent: number | null = null;
      let closedAt: string | null = null;
      let entryTriggeredAt: string | null = null;

      // Check expiration first
      if (createdAt < expireCutoff) {
        newStatus = "EXPIRED";
        closedAt = now.toISOString();
      } else if (currentPrice != null) {
        const entry  = Number(row.entry_price);
        const stop   = Number(row.stop_price);
        const target = Number(row.target_price);

        if (row.status === "PENDING") {
          if (currentPrice >= entry) {
            newStatus = "ACTIVE";
            entryTriggeredAt = now.toISOString();
          }
        }

        // If already ACTIVE (or just became ACTIVE), check target/stop
        const effectiveStatus = newStatus ?? row.status;
        if (effectiveStatus === "ACTIVE") {
          if (currentPrice >= target) {
            newStatus = "TARGET_HIT";
            result = "WIN";
            returnPercent = +((currentPrice - entry) / entry * 100).toFixed(2);
            closedAt = now.toISOString();
          } else if (currentPrice <= stop) {
            newStatus = "STOP_HIT";
            result = "LOSS";
            returnPercent = +((currentPrice - entry) / entry * 100).toFixed(2);
            closedAt = now.toISOString();
          }
        }
      }

      if (newStatus && newStatus !== row.status) {
        await sql`
          UPDATE setups SET
            status             = ${newStatus},
            result             = ${result},
            return_percent     = ${returnPercent},
            closed_at          = ${closedAt},
            entry_triggered_at = COALESCE(entry_triggered_at, ${entryTriggeredAt})
          WHERE id = ${row.id}
        `;
        updated++;
        statuses[row.ticker] = newStatus;
      } else {
        statuses[row.ticker] = row.status as SetupStatus;
      }
    }

    return Response.json({ updated, statuses });
  } catch (err) {
    console.error("[setups/monitor] POST failed:", err);
    return Response.json({ error: "Monitor failed" }, { status: 500 });
  }
}
