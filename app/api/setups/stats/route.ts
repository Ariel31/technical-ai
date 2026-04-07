// GET /api/setups/stats — aggregate win/loss statistics across all tracked setups

import sql from "@/lib/db";
import { auth } from "@/auth";
import type { TrackRecordStats } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    const empty: TrackRecordStats = {
      totalSetups: 0, wins: 0, losses: 0, winRate: 0,
      avgReturn: 0, avgWin: 0, avgLoss: 0,
      bestTrade: 0, worstTrade: 0, activeCount: 0,
    };
    return Response.json(empty, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const rows = await sql`
      SELECT s.status, s.result, s.return_percent
      FROM setups s
      INNER JOIN watchlist w ON w.user_id = s.user_id AND w.ticker = s.ticker
      WHERE s.user_id = ${userId} AND s.scan_source = 'watchlist'
    ` as { status: string; result: string | null; return_percent: number | null }[];

    const closed = rows.filter((r) => r.result === "WIN" || r.result === "LOSS");
    const wins   = closed.filter((r) => r.result === "WIN");
    const losses = closed.filter((r) => r.result === "LOSS");
    const activeCount = rows.filter((r) => r.status === "PENDING" || r.status === "ACTIVE").length;

    const returns     = closed.map((r) => Number(r.return_percent ?? 0));
    const winReturns  = wins.map((r) => Number(r.return_percent ?? 0));
    const lossReturns = losses.map((r) => Number(r.return_percent ?? 0));

    const avg = (arr: number[]) =>
      arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

    const stats: TrackRecordStats = {
      totalSetups:  rows.length,
      wins:         wins.length,
      losses:       losses.length,
      winRate:      closed.length === 0 ? 0 : Math.round((wins.length / closed.length) * 100),
      avgReturn:    +avg(returns).toFixed(1),
      avgWin:       +avg(winReturns).toFixed(1),
      avgLoss:      +avg(lossReturns).toFixed(1),
      bestTrade:    returns.length === 0 ? 0 : +Math.max(...returns).toFixed(1),
      worstTrade:   returns.length === 0 ? 0 : +Math.min(...returns).toFixed(1),
      activeCount,
    };

    return Response.json(stats);
  } catch (err) {
    console.error("[setups/stats] GET failed:", err);
    const empty: TrackRecordStats = {
      totalSetups: 0, wins: 0, losses: 0, winRate: 0,
      avgReturn: 0, avgWin: 0, avgLoss: 0,
      bestTrade: 0, worstTrade: 0, activeCount: 0,
    };
    return Response.json(empty);
  }
}
