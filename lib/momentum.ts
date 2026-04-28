/**
 * 12-1 Cross-Sectional Momentum Strategy
 * Universe: S&P 500 + NASDAQ-100, market cap >= $10B
 * Signal: (Close[t-21] / Close[t-252]) - 1
 * Selection: Top 20 by momentum, equal-weighted
 * Stop-loss: -20% from entry (fixed)
 */

import type { MomentumPortfolioState, MomentumPick } from "./types";

const EXCLUDE = new Set(["SPY", "QQQ", "IVV", "VOO", "VXX", "GLD", "TLT"]);
const VALID_TICKER = /^[A-Z][A-Z0-9-]{0,5}$/;

// ── Wikipedia scraping ──────────────────────────────────────────────────────

async function fetchWikipediaTickers(url: string): Promise<string[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MomentumBot/1.0)" },
    next: { revalidate: 86400 }, // cache 24h
  });
  if (!res.ok) throw new Error(`Wikipedia fetch failed: ${res.status}`);
  const html = await res.text();

  // Match ticker symbols from table cells — first <a> in each <td>
  // Handles both: <td><a href="...">TICK</a></td> and <td><a href="..." title="...">TICK</a></td>
  const seen = new Set<string>();
  const results: string[] = [];

  // Pattern 1: <td><a ... >TICKER</a></td>
  const re1 = /<td[^>]*><a[^>]*>([A-Z][A-Z0-9.]{0,5})<\/a>/g;
  for (const m of html.matchAll(re1)) {
    const t = m[1].replace(".", "-");
    if (!seen.has(t) && VALID_TICKER.test(t) && !EXCLUDE.has(t)) {
      seen.add(t);
      results.push(t);
    }
  }

  // If we got a reasonable number, return early
  if (results.length >= 50) return results;

  // Pattern 2: broader fallback — any <td> with a short uppercase link text
  const re2 = /<td[^>]*>.*?<a[^>]*>([A-Z][A-Z0-9.]{0,5})<\/a>/g;
  for (const m of html.matchAll(re2)) {
    const t = m[1].replace(".", "-");
    if (!seen.has(t) && VALID_TICKER.test(t) && !EXCLUDE.has(t)) {
      seen.add(t);
      results.push(t);
    }
  }

  return results;
}

export async function buildUniverse(): Promise<string[]> {
  const [sp500, ndx100] = await Promise.allSettled([
    fetchWikipediaTickers(
      "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
    ),
    fetchWikipediaTickers("https://en.wikipedia.org/wiki/Nasdaq-100"),
  ]);

  const combined = new Set<string>();

  if (sp500.status === "fulfilled") {
    sp500.value.forEach((t) => combined.add(t));
  }
  if (ndx100.status === "fulfilled") {
    ndx100.value.forEach((t) => combined.add(t));
  }

  // Fallback: if scraping failed entirely, use a hardcoded core list
  if (combined.size < 50) {
    FALLBACK_UNIVERSE.forEach((t) => combined.add(t));
  }

  return [...combined].filter((t) => VALID_TICKER.test(t) && !EXCLUDE.has(t)).sort();
}

// ── Momentum calculation ────────────────────────────────────────────────────

export interface DailyClose {
  time: number; // unix seconds
  close: number;
}

/**
 * Fetch adjusted daily closes for a ticker (~13 months = range=2y capped).
 * Returns closes sorted oldest-first.
 */
export async function fetchDailyCloses(ticker: string): Promise<DailyClose[]> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=2y&includeTimestamps=true`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TechnicalAI/1.0)",
      Accept: "application/json",
    },
    next: { revalidate: 3600 }, // 1h cache
  });
  if (!res.ok) throw new Error(`Yahoo Finance ${res.status} for ${ticker}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${ticker}`);

  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];

  return timestamps
    .map((t, i) => ({ time: t, close: closes[i] ?? NaN }))
    .filter((d) => !isNaN(d.close) && d.close > 0)
    .sort((a, b) => a.time - b.time);
}

/**
 * Compute 12-1 momentum: return from Close[t-252] to Close[t-21].
 * Returns null if insufficient data.
 */
export function computeMomentum(closes: DailyClose[]): {
  momentum: number;
  priceT252: number;
  priceT21: number;
  currentPrice: number;
} | null {
  if (closes.length < 253) return null;

  const currentPrice = closes[closes.length - 1].close;
  const priceT21 = closes[closes.length - 21].close;
  const priceT252 = closes[closes.length - 252].close;

  if (!priceT252 || !priceT21 || priceT252 <= 0) return null;

  const momentum = priceT21 / priceT252 - 1;
  return { momentum, priceT252, priceT21, currentPrice };
}

// ── Market cap filter ───────────────────────────────────────────────────────

export async function fetchMarketCap(ticker: string): Promise<number> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryDetail`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TechnicalAI/1.0)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return 0;
    const json = await res.json();
    return (
      json?.quoteSummary?.result?.[0]?.summaryDetail?.marketCap?.raw ?? 0
    );
  } catch {
    return 0;
  }
}

// ── Portfolio helpers ───────────────────────────────────────────────────────

/** Stop-loss price for a position (20% below entry) */
export function stopPrice(entryPrice: number): number {
  return Math.round(entryPrice * 0.8 * 100) / 100;
}

/** Compute total portfolio value from state + current prices */
export function portfolioValue(
  state: MomentumPortfolioState,
  currentPrices: Record<string, number>
): number {
  let value = state.cash;
  for (const [ticker, pos] of Object.entries(state.positions)) {
    const price = currentPrices[ticker] ?? pos.entry_price;
    value += pos.shares * price;
  }
  return Math.round(value * 100) / 100;
}

/** Equal-weight slot value for N positions */
export function slotValue(totalCash: number, n: number): number {
  return totalCash / n;
}

/** Integer shares for a given slot value and price */
export function sharesForSlot(slotVal: number, price: number): number {
  return Math.floor(slotVal / price);
}

// ── Top-N computation ───────────────────────────────────────────────────────

/**
 * Given a universe of tickers and their closes, return the top-N momentum picks.
 * Fetching is done externally (in the SSE route) to allow progress reporting.
 */
export function rankByMomentum(
  results: Array<{
    ticker: string;
    name: string;
    closes: DailyClose[];
  }>,
  topN = 20
): MomentumPick[] {
  const picks: MomentumPick[] = [];

  for (const { ticker, name, closes } of results) {
    const m = computeMomentum(closes);
    if (!m) continue;
    picks.push({
      ticker,
      name,
      momentum: m.momentum,
      currentPrice: m.currentPrice,
      priceT252: m.priceT252,
      priceT21: m.priceT21,
      rank: 0,
    });
  }

  picks.sort((a, b) => b.momentum - a.momentum);
  picks.forEach((p, i) => (p.rank = i + 1));

  return picks.slice(0, topN);
}

// ── Rebalance diff ──────────────────────────────────────────────────────────

export function computeRebalanceDiff(
  currentHoldings: string[],
  newTopN: string[]
): { to_sell: string[]; to_buy: string[]; to_hold: string[] } {
  const current = new Set(currentHoldings);
  const next = new Set(newTopN);

  const to_sell = [...current].filter((t) => !next.has(t));
  const to_buy = [...next].filter((t) => !current.has(t));
  const to_hold = [...current].filter((t) => next.has(t));

  return { to_sell, to_buy, to_hold };
}

// ── Fallback universe (top S&P 500 / NDX100 by market cap) ─────────────────
// Used only if Wikipedia scraping fails entirely.

const FALLBACK_UNIVERSE = [
  "AAPL","MSFT","NVDA","AMZN","GOOGL","GOOG","META","TSLA","BRK-B","AVGO",
  "JPM","LLY","V","UNH","XOM","MA","COST","HD","PG","WMT",
  "NFLX","JNJ","CRM","BAC","ORCL","MRK","CVX","KO","AMD","ADBE",
  "PEP","TMO","ABBV","ACN","CSCO","MCD","ABT","WFC","INTC","LIN",
  "DHR","TXN","MS","PM","INTU","DIS","UNP","GE","CAT","ISRG",
  "NOW","SPGI","IBM","GS","RTX","UBER","SYK","BKNG","AMAT","T",
  "LOW","HON","VRTX","PLD","DE","AXP","NEE","AMGN","BLK","TJX",
  "REGN","MDT","MU","CI","BSX","ADI","GILD","SCHW","CB","C",
  "ETN","MMC","SO","LRCX","SHW","ZTS","CME","COP","ICE","EQIX",
  "AON","KLAC","PNC","USB","DUK","ITW","NOC","MCO","GD","APH",
  "MCHP","SNPS","ELV","NSC","FCX","EMR","FDX","TGT","CDNS","WM",
  "MNST","ORLY","ADP","MSI","HUM","FTNT","CTAS","PSA","MPC","MAR",
  "CPRT","CARR","PWR","ECL","NUE","GWW","AEP","OXY","ODFL","KMB",
  "PYPL","TMUS","PANW","CCI","HPQ","EW","ADSK","VRSK","WBD","URI",
  "IDXX","CMG","MET","HIG","AFL","SRE","ROST","F","GM","BIIB",
  "ED","ES","EIX","XEL","DVN","HCA","DXCM","KEYS","RJF","CTSH",
  "ACGL","BK","STZ","GIS","EXC","FAST","MTD","SYF","PAYX","KHC",
  "DLTR","DAL","LHX","LDOS","PPG","TROW","ETR","HAL","MKL","WEC",
  "TRV","BALL","TSN","ALB","ENPH","SEDG","ON","ALGN","TSCO","POOL",
  "ZBRA","TDY","JBHT","GPC","NDSN","RGA","WRB","CINF","ERIE","PRU",
  // NASDAQ-100 extras
  "MRVL","CEG","CSGP","DDOG","CRWD","ZS","TEAM","OKTA","SNOW","PLTR",
  "TTD","NET","BILL","HUBS","MDB","RBLX","U","AFRM","RIVN","LCID",
  "QCOM","TER","SWKS","MPWR","WOLF","FSLR","ENPH","RUN","ARRY","GTLB",
  "ASML","TSM","SAP","SHOP","SPOT","SE","GRAB","BIDU","JD","PDD",
];
