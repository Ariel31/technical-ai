/**
 * GET /api/momentum/history  — fetch trade history for the current user
 */

import { auth } from "@/auth";
import sql from "@/lib/db";
import type { MomentumTrade } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const rows = await sql<MomentumTrade[]>`
    SELECT
      id,
      date::text,
      ticker,
      action,
      price::float,
      shares,
      cost_basis::float,
      proceeds::float,
      pnl::float,
      pnl_pct::float,
      entry_date::text,
      exit_reason
    FROM momentum_trades
    WHERE user_id = ${userId}
    ORDER BY date DESC, created_at DESC
    LIMIT 500
  `;

  return Response.json({ trades: rows });
}
