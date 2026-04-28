/**
 * GET  /api/momentum/portfolio  — fetch current portfolio state + live prices
 * POST /api/momentum/portfolio  — save/upsert portfolio state
 * DELETE /api/momentum/portfolio — reset (wipe) portfolio
 */

import { auth } from "@/auth";
import sql from "@/lib/db";
import { portfolioValue, stopPrice } from "@/lib/momentum";
import type { MomentumPortfolioState, MomentumPositionLive } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchCurrentPrice(ticker: string): Promise<number> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TechnicalAI/1.0)" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return 0;
    const json = await res.json();
    const closes: (number | null)[] = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const valid = closes.filter((c): c is number => c != null && c > 0);
    return valid[valid.length - 1] ?? 0;
  } catch {
    return 0;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  let rows: { state: MomentumPortfolioState }[];
  try {
    rows = await sql<{ state: MomentumPortfolioState }[]>`
      SELECT state FROM momentum_portfolio WHERE user_id = ${userId} LIMIT 1
    `;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return Response.json({ portfolio: null, dbSetupRequired: true });
    }
    throw err;
  }

  if (rows.length === 0) {
    return Response.json({ portfolio: null });
  }

  const state = rows[0].state;
  const tickers = Object.keys(state.positions);

  // Fetch current prices for all positions in parallel (+ SPY for benchmark)
  const allTickers = [...tickers, "SPY"];
  const priceResults = await Promise.allSettled(allTickers.map(fetchCurrentPrice));
  const currentPrices: Record<string, number> = {};
  allTickers.forEach((t, i) => {
    const r = priceResults[i];
    currentPrices[t] = r.status === "fulfilled" ? r.value : 0;
  });

  const totalValue = portfolioValue(state, currentPrices);

  // Build enriched positions
  const livePositions: MomentumPositionLive[] = tickers.map((ticker) => {
    const pos = state.positions[ticker];
    const cp = currentPrices[ticker] || pos.entry_price;
    const marketValue = Math.round(pos.shares * cp * 100) / 100;
    const pnl = Math.round((marketValue - pos.cost_basis) * 100) / 100;
    const pnl_pct = Math.round(((cp - pos.entry_price) / pos.entry_price) * 10000) / 100;
    const sp = stopPrice(pos.entry_price);
    return {
      ...pos,
      ticker,
      name: pos.name ?? ticker,
      current_price: cp,
      market_value: marketValue,
      pnl,
      pnl_pct,
      weight_pct: Math.round((marketValue / totalValue) * 10000) / 100,
      stop_price: sp,
      stop_triggered: cp < sp,
    };
  });

  // SPY benchmark return
  const spyNow = currentPrices["SPY"] || 0;
  const spyReturn = state.spy_price_at_start > 0
    ? Math.round(((spyNow - state.spy_price_at_start) / state.spy_price_at_start) * 10000) / 100
    : 0;

  const totalReturn = Math.round(((totalValue - state.initial_capital) / state.initial_capital) * 10000) / 100;

  return Response.json({
    portfolio: state,
    livePositions,
    totalValue,
    totalReturn,
    spyReturn,
    spyNow,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { state } = await req.json() as { state: MomentumPortfolioState };
  if (!state) return Response.json({ error: "Missing state" }, { status: 400 });

  await sql`
    INSERT INTO momentum_portfolio (user_id, state, updated_at)
    VALUES (${userId}, ${sql.json(state as object)}, now())
    ON CONFLICT (user_id)
    DO UPDATE SET state = EXCLUDED.state, updated_at = now()
  `;

  return Response.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  await sql`DELETE FROM momentum_portfolio WHERE user_id = ${userId}`;
  await sql`DELETE FROM momentum_trades WHERE user_id = ${userId}`;

  return Response.json({ ok: true });
}
