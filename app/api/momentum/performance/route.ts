/**
 * GET /api/momentum/performance
 * Returns all rebalance-cycle snapshots with period returns vs SPY.
 * Each snapshot = portfolio value at the start of that rebalance cycle
 * (i.e. pre-rebalance = end of previous holding period).
 */

import { auth } from "@/auth";
import sql from "@/lib/db";

interface Snapshot {
  snapshot_date: string;
  portfolio_value: number;
  spy_price: number;
  period_label: string;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  let rows: Snapshot[];
  try {
    rows = await sql<Snapshot[]>`
      SELECT
        snapshot_date::text,
        portfolio_value::float,
        spy_price::float,
        COALESCE(period_label, snapshot_date::text) AS period_label
      FROM momentum_snapshots
      WHERE user_id = ${userId}
      ORDER BY snapshot_date ASC
    `;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) return Response.json({ periods: [], latestSnapshot: null });
    throw err;
  }

  if (rows.length === 0) return Response.json({ periods: [], latestSnapshot: null });

  const baseValue = rows[0].portfolio_value;
  const baseSpy = rows[0].spy_price;

  // Build period-return rows (skip baseline row at index 0)
  const periods = rows.slice(1).map((row, i) => {
    const prev = rows[i]; // rows[0] for i=0 (the baseline)
    const period_strategy = prev.portfolio_value > 0
      ? Math.round((row.portfolio_value / prev.portfolio_value - 1) * 10000) / 100
      : null;
    const period_spy = prev.spy_price > 0
      ? Math.round((row.spy_price / prev.spy_price - 1) * 10000) / 100
      : null;
    const alpha = period_strategy != null && period_spy != null
      ? Math.round((period_strategy - period_spy) * 100) / 100
      : null;
    const cumulative_strategy = Math.round((row.portfolio_value / baseValue - 1) * 10000) / 100;
    const cumulative_spy = baseSpy > 0
      ? Math.round((row.spy_price / baseSpy - 1) * 10000) / 100
      : 0;

    return {
      period_label: row.period_label,
      snapshot_date: row.snapshot_date,
      portfolio_value: row.portfolio_value,
      spy_price: row.spy_price,
      period_strategy,
      period_spy,
      alpha,
      cumulative_strategy,
      cumulative_spy,
    };
  });

  // Return newest first; also expose latest snapshot for "current period" computation
  const latestSnapshot = rows[rows.length - 1];

  return Response.json({
    periods: periods.reverse(),
    latestSnapshot: {
      portfolio_value: latestSnapshot.portfolio_value,
      spy_price: latestSnapshot.spy_price,
      snapshot_date: latestSnapshot.snapshot_date,
    },
  });
}
