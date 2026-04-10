// GET /api/cron/monitor
// Called by Vercel Cron every 30 min during US market hours (Mon–Fri).
// Protected by CRON_SECRET — Vercel automatically sends:
//   Authorization: Bearer <CRON_SECRET>

import sql from "@/lib/db";
import { fetchStockData } from "@/lib/yahoo-finance";
import type { SetupStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXPIRE_DAYS = 42;

export async function GET(request: Request) {
  const isDev = process.env.NODE_ENV === "development";
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!isDev && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await sql`
      SELECT id, ticker, entry_price, stop_price, target_price, status, created_at
      FROM setups
      WHERE status IN ('PENDING', 'ACTIVE')
    ` as {
      id: string;
      ticker: string;
      entry_price: number;
      stop_price: number;
      target_price: number;
      status: string;
      created_at: string;
    }[];

    if (rows.length === 0) {
      console.log("[cron/monitor] No active setups to check.");
      return Response.json({ updated: 0, checked: 0 });
    }

    // Batch-fetch recent bars for each unique ticker
    const uniqueTickers = [...new Set(rows.map((r) => r.ticker))];

    interface BarSummary { high: number; low: number; close: number; time: number; }
    const barsMap = new Map<string, BarSummary[]>();

    await Promise.allSettled(
      uniqueTickers.map(async (ticker) => {
        try {
          const data = await fetchStockData({ ticker, timeframe: "1d", bars: 10 });
          barsMap.set(ticker, data.bars.map((b) => ({ high: b.high, low: b.low, close: b.close, time: b.time })));
        } catch {
          // Skip — price unavailable for this ticker
        }
      })
    );

    const now = new Date();
    const expireCutoff = new Date(now.getTime() - EXPIRE_DAYS * 24 * 60 * 60 * 1000);

    let updated = 0;
    const statusChanges: Record<string, { from: string; to: string }> = {};

    for (const row of rows) {
      const allBars = barsMap.get(row.ticker) ?? [];
      const createdAt = new Date(row.created_at);
      const createdTs = createdAt.getTime() / 1000; // bars use unix seconds

      // Only consider bars on or after the setup was created
      const recentBars = allBars.filter((b) => b.time >= createdTs);
      const lastBar = recentBars[recentBars.length - 1];

      let newStatus: SetupStatus | null = null;
      let result: "WIN" | "LOSS" | null = null;
      let returnPercent: number | null = null;
      let closedAt: string | null = null;
      let entryTriggeredAt: string | null = null;

      if (createdAt < expireCutoff) {
        newStatus = "EXPIRED";
        closedAt = now.toISOString();
      } else if (lastBar != null) {
        const entry  = Number(row.entry_price);
        const stop   = Number(row.stop_price);
        const target = Number(row.target_price);

        // Use bar highs to catch intraday touches of the entry price
        if (row.status === "PENDING" && recentBars.some((b) => b.high >= entry)) {
          newStatus = "ACTIVE";
          entryTriggeredAt = now.toISOString();
        }

        const effectiveStatus = newStatus ?? row.status;
        if (effectiveStatus === "ACTIVE") {
          if (lastBar.high >= target) {
            newStatus = "TARGET_HIT";
            result = "WIN";
            returnPercent = +(Math.abs((target - entry) / entry) * 100).toFixed(2);
            closedAt = now.toISOString();
          } else if (lastBar.low <= stop) {
            newStatus = "STOP_HIT";
            result = "LOSS";
            returnPercent = +(Math.abs((stop - entry) / entry) * 100).toFixed(2);
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
        statusChanges[row.ticker] = { from: row.status, to: newStatus };
      }
    }

    console.log(`[cron/monitor] Checked ${rows.length} setups (${uniqueTickers.length} tickers). Updated: ${updated}.`, statusChanges);
    return Response.json({ updated, checked: rows.length, statusChanges });
  } catch (err) {
    console.error("[cron/monitor] Failed:", err);
    return Response.json({ error: "Monitor failed" }, { status: 500 });
  }
}
