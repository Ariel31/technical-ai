/**
 * POST /api/momentum/rebalance
 * Applies a rebalance:
 *  - Sells positions not in new top-N
 *  - Buys new positions equal-weighted from available cash
 *  - Logs all trades to momentum_trades
 *  - Saves updated portfolio state
 *
 * Body: { picks: MomentumPick[], initialCapital?: number }
 *   picks = top-20 from compute route
 *   initialCapital = only used when initializing a new portfolio
 */

import { auth } from "@/auth";
import sql from "@/lib/db";
import { stopPrice, sharesForSlot, computeRebalanceDiff } from "@/lib/momentum";
import type { MomentumPortfolioState, MomentumPick, MomentumTrade } from "@/lib/types";

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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json() as {
    picks: MomentumPick[];
    initialCapital?: number;
  };

  if (!body.picks?.length) return Response.json({ error: "Missing picks" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);

  // Load existing portfolio (if any)
  let rows: { state: MomentumPortfolioState }[];
  try {
    rows = await sql<{ state: MomentumPortfolioState }[]>`
      SELECT state FROM momentum_portfolio WHERE user_id = ${userId} LIMIT 1
    `;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return Response.json({ error: "DB tables not set up. Run the SQL migration first.", code: "TABLE_MISSING" }, { status: 503 });
    }
    throw err;
  }

  const isInit = rows.length === 0;
  const initialCapital = body.initialCapital ?? 100_000;

  let state: MomentumPortfolioState = isInit
    ? {
        started: today,
        initial_capital: initialCapital,
        last_rebalance: today,
        cash: initialCapital,
        spy_price_at_start: 0,
        positions: {},
      }
    : rows[0].state;

  // Fetch SPY price if initializing
  if (isInit) {
    try {
      const spyPrice = await fetchCurrentPrice("SPY");
      state.spy_price_at_start = spyPrice;
    } catch { /* non-fatal */ }
  }

  // Compute diff
  const currentHoldings = Object.keys(state.positions);
  const newTopN = body.picks.map((p) => p.ticker);
  const diff = computeRebalanceDiff(currentHoldings, newTopN);

  // Fetch prices for ALL current holdings + new buys + SPY (for snapshot)
  const priceTickers = [...new Set([...currentHoldings, ...diff.to_buy, "SPY"])];
  const priceResults = await Promise.allSettled(priceTickers.map(fetchCurrentPrice));
  const prices: Record<string, number> = {};
  priceTickers.forEach((t, i) => {
    const r = priceResults[i];
    prices[t] = r.status === "fulfilled" ? r.value : 0;
  });

  // Snapshot: portfolio value BEFORE this rebalance (= end of previous holding period)
  const preRebalanceValue = Math.round(
    (state.cash + currentHoldings.reduce((sum, t) => {
      const pos = state.positions[t];
      return sum + pos.shares * (prices[t] || pos.entry_price);
    }, 0)) * 100
  ) / 100;
  const spySnapshotPrice = prices["SPY"] || 0;
  const snapshotValue = isInit ? initialCapital : preRebalanceValue;
  const snapshotSpyPrice = isInit ? (spySnapshotPrice || 0) : spySnapshotPrice;
  const snapshotLabel = new Date(today).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  // Use the pick's currentPrice as fallback
  const pickPriceMap = new Map(body.picks.map((p) => [p.ticker, p.currentPrice]));

  const trades: Omit<MomentumTrade, "id">[] = [];
  const soldDetails: Array<{ ticker: string; name: string; pnl: number; pnl_pct: number; price: number; entryDate: string }> = [];

  // ── SELL positions not in new top-N ────────────────────────────────────────
  for (const ticker of diff.to_sell) {
    const pos = state.positions[ticker];
    if (!pos) continue;

    const sellPrice = prices[ticker] || pickPriceMap.get(ticker) || pos.entry_price;
    const proceeds = Math.round(sellPrice * pos.shares * 100) / 100;
    const pnl = Math.round((proceeds - pos.cost_basis) * 100) / 100;
    const pnl_pct = Math.round(((sellPrice - pos.entry_price) / pos.entry_price) * 10000) / 100;

    soldDetails.push({ ticker, name: pos.name ?? ticker, pnl, pnl_pct, price: sellPrice, entryDate: pos.entry_date });

    state.cash += proceeds;
    delete state.positions[ticker];

    trades.push({
      date: today,
      ticker,
      action: "SELL",
      price: sellPrice,
      shares: pos.shares,
      cost_basis: pos.cost_basis,
      proceeds,
      pnl,
      pnl_pct,
      entry_date: pos.entry_date,
      exit_reason: "rebalance",
    });
  }

  // ── BUY new positions (equal-weighted) ────────────────────────────────────
  const toBuyCount = diff.to_buy.length;
  if (toBuyCount > 0) {
    const slot = state.cash / toBuyCount;

    for (const ticker of diff.to_buy) {
      const buyPrice = prices[ticker] || pickPriceMap.get(ticker) || 0;
      if (!buyPrice || buyPrice <= 0) continue;

      const shares = sharesForSlot(slot, buyPrice);
      if (shares <= 0) continue;

      const cost = Math.round(shares * buyPrice * 100) / 100;
      state.cash -= cost;
      state.cash = Math.round(state.cash * 100) / 100;

      const pickName = body.picks.find((p) => p.ticker === ticker)?.name ?? ticker;

      state.positions[ticker] = {
        entry_date: today,
        entry_price: buyPrice,
        shares,
        cost_basis: cost,
        name: pickName,
      };

      trades.push({
        date: today,
        ticker,
        action: "BUY",
        price: buyPrice,
        shares,
        cost_basis: cost,
        entry_date: today,
      });
    }
  }

  state.last_rebalance = today;

  // ── Persist ────────────────────────────────────────────────────────────────
  await sql`
    INSERT INTO momentum_portfolio (user_id, state, updated_at)
    VALUES (${userId}, ${sql.json(state as object)}, now())
    ON CONFLICT (user_id)
    DO UPDATE SET state = EXCLUDED.state, updated_at = now()
  `;

  if (trades.length > 0) {
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

  // Insert performance snapshot (non-fatal)
  if (snapshotSpyPrice > 0) {
    sql`
      INSERT INTO momentum_snapshots (user_id, snapshot_date, portfolio_value, spy_price, period_label)
      VALUES (${userId}, ${today}, ${snapshotValue}, ${snapshotSpyPrice}, ${snapshotLabel})
    `.catch(() => { /* non-fatal — table may not exist yet */ });
  }

  return Response.json({
    ok: true,
    diff,
    soldDetails,
    boughtTickers: diff.to_buy,
    trades: trades.length,
    cash: state.cash,
    positions: Object.keys(state.positions).length,
  });
}
