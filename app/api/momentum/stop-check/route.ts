/**
 * POST /api/momentum/stop-check
 * Checks all open positions for -20% stop-loss trigger.
 * Fires sells for any triggered positions and logs trades.
 * Capital stays in cash until next rebalance.
 */

import { auth } from "@/auth";
import sql from "@/lib/db";
import { stopPrice } from "@/lib/momentum";
import type { MomentumPortfolioState, MomentumTrade } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fetchCurrentPrice(ticker: string): Promise<number> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TechnicalAI/1.0)" },
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

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const rows = await sql<{ state: MomentumPortfolioState }[]>`
    SELECT state FROM momentum_portfolio WHERE user_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) return Response.json({ error: "No portfolio" }, { status: 404 });

  const state = rows[0].state;
  const tickers = Object.keys(state.positions);
  if (tickers.length === 0) return Response.json({ triggered: [], checked: 0 });

  // Fetch current prices in parallel
  const priceResults = await Promise.allSettled(tickers.map(fetchCurrentPrice));
  const prices: Record<string, number> = {};
  tickers.forEach((t, i) => {
    const r = priceResults[i];
    prices[t] = r.status === "fulfilled" ? r.value : 0;
  });

  const today = new Date().toISOString().slice(0, 10);
  const triggered: string[] = [];
  const trades: Omit<MomentumTrade, "id">[] = [];

  for (const ticker of tickers) {
    const pos = state.positions[ticker];
    const cp = prices[ticker];
    if (!cp || cp <= 0) continue;

    const sp = stopPrice(pos.entry_price);
    if (cp < sp) {
      // Stop-loss triggered
      triggered.push(ticker);
      const proceeds = Math.round(cp * pos.shares * 100) / 100;
      const pnl = Math.round((proceeds - pos.cost_basis) * 100) / 100;
      const pnl_pct = Math.round(((cp - pos.entry_price) / pos.entry_price) * 10000) / 100;

      state.cash += proceeds;
      state.cash = Math.round(state.cash * 100) / 100;
      delete state.positions[ticker];

      trades.push({
        date: today,
        ticker,
        action: "SELL",
        price: cp,
        shares: pos.shares,
        cost_basis: pos.cost_basis,
        proceeds,
        pnl,
        pnl_pct,
        entry_date: pos.entry_date,
        exit_reason: "stop_loss",
      });
    }
  }

  if (triggered.length > 0) {
    await sql`
      UPDATE momentum_portfolio
      SET state = ${sql.json(state as object)}, updated_at = now()
      WHERE user_id = ${userId}
    `;

    await sql`
      INSERT INTO momentum_trades ${sql(
        trades.map((t) => ({
          user_id: userId,
          date: t.date,
          ticker: t.ticker,
          action: t.action,
          price: t.price,
          shares: t.shares,
          cost_basis: t.cost_basis,
          proceeds: t.proceeds ?? null,
          pnl: t.pnl ?? null,
          pnl_pct: t.pnl_pct ?? null,
          entry_date: t.entry_date ?? null,
          exit_reason: t.exit_reason ?? null,
        }))
      )}
    `;
  }

  // Return all position statuses (not just triggered)
  const statuses = tickers.map((ticker) => {
    const pos = state.positions[ticker]; // may be undefined if triggered
    const cp = prices[ticker] ?? 0;
    const isTriggered = triggered.includes(ticker);
    return {
      ticker,
      currentPrice: cp,
      stopPrice: isTriggered ? undefined : (pos ? stopPrice(pos.entry_price) : 0),
      triggered: isTriggered,
    };
  });

  return Response.json({
    triggered,
    statuses,
    checked: tickers.length,
    cash: state.cash,
  });
}
