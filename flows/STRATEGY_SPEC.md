# Cross-Sectional Momentum Strategy — Implementation Spec

**Version**: 1.0  
**Strategy**: 12-1 Cross-Sectional Momentum, Top-20, Monthly Rebalance, with Fixed-20% Stop-Loss  
**Backtested**: 1, 3, 5, 10-year US large-cap windows  
**Universe**: S&P 500 + NASDAQ-100 holdings, market cap ≥ $10B

This document is language-agnostic and implementation-ready. Pair it with any data source that provides daily OHLCV and market caps.

---

## 1. Strategy Summary

Each month, rank all eligible stocks by their 12-month total return *excluding the most recent month*, equal-weight buy the top 20, and hold until the next monthly rebalance. Apply a per-position −20% from-entry stop-loss between rebalances. No market regime filters, no AI, no trend filters — empirical testing showed every other modification either hurts returns or doesn't help meaningfully.

**Why "12-1" (skip last month)**: The most recent month often shows short-term mean reversion that contaminates the trend signal. Excluding it produced consistently better results in academic literature (Jegadeesh & Titman 1993) and in our backtests.

---

## 2. Required Data

| Data | Frequency | Lookback needed | Purpose |
|---|---|---|---|
| Daily OHLCV per ticker | Daily close (or end-of-day) | ~13 months minimum | Momentum calculation |
| Current market cap per ticker | Refresh weekly/monthly | Latest only | Universe filter |
| S&P 500 constituents list | Refresh quarterly | Current | Universe |
| NASDAQ-100 constituents list | Refresh quarterly | Current | Universe |
| SPY (ETF) daily close | Daily | Backtest period | Benchmark only |

### Recommended JS data sources
- **`yahoo-finance2`** (npm package) — most flexible free option, mirrors Python's yfinance
- **Polygon.io API** — paid, much higher rate limits, cleaner data
- **Alpaca Markets API** — free for hobbyist, broker-grade data
- **IEX Cloud API** — paid tiers; very stable

### Universe lists
Wikipedia maintains current constituents for both indices:
- `https://en.wikipedia.org/wiki/List_of_S%26P_500_companies`
- `https://en.wikipedia.org/wiki/Nasdaq-100`

Set a custom `User-Agent` header (e.g. `Mozilla/5.0 ...`) — Wikipedia blocks default `axios`/`fetch` user agents.

Parse the table where columns include `Symbol` (or `Ticker`). Convert dot notation to dash for Yahoo: `BRK.B → BRK-B`.

---

## 3. Universe Definition

Build the universe once per month (or quarter):

```
1. Fetch S&P 500 ticker list from Wikipedia
2. Fetch NASDAQ-100 ticker list from Wikipedia
3. Combine into a Set (dedupe)
4. Exclude ETFs and known non-stocks: SPY, QQQ, IVV, VOO, VXX, GLD, TLT
5. For each ticker, fetch current market cap
6. Keep only tickers where marketCap >= 10_000_000_000
7. Result: ~495-516 tickers (varies by index changes)
```

### Pseudocode

```javascript
async function buildUniverse() {
  const sp500 = await fetchSP500Wikipedia();
  const ndx100 = await fetchNDX100Wikipedia();
  const combined = new Set([...sp500, ...ndx100]);
  const exclude = new Set(['SPY', 'QQQ', 'IVV', 'VOO', 'VXX', 'GLD', 'TLT']);
  const tickers = [...combined]
    .filter(t => !exclude.has(t) && /^[A-Z\-]{1,6}$/.test(t));

  const withCaps = await Promise.all(
    tickers.map(async t => ({
      ticker: t,
      cap: await fetchMarketCap(t),
    }))
  );

  return withCaps
    .filter(x => x.cap >= 10_000_000_000)
    .map(x => x.ticker)
    .sort();
}
```

---

## 4. Core Algorithm

### 4.1 12-1 Momentum Calculation

For each eligible ticker, compute the total return from `t-252` to `t-21` trading days (252 trading days = ~12 months, 21 trading days = ~1 month):

```
momentum_pct = (Close[t-21] / Close[t-252]) - 1
```

Where `t` is today (the rebalance date).

**Constraints**:
- Skip ticker if it has fewer than 253 trading days of data
- Skip ticker if `Close[t-252]` is `NaN`, `null`, or `<= 0`
- The momentum is a number (e.g. `0.45` = 45% return)

### 4.2 Selection (Top-N)

```
1. Compute momentum_pct for every ticker in the universe
2. Drop tickers with NaN momentum
3. Sort descending by momentum_pct
4. Take the top N (default N=20)
```

### 4.3 Position Sizing — Equal Weight

After selecting the top N tickers, equal-weight the available capital across them:

```
slot_value = (cash_on_hand + value_of_existing_positions_being_sold) / N

For each new position:
  shares = floor(slot_value / current_close)
  cost_basis = shares * current_close
  cash -= cost_basis
```

**Important**: shares must be an integer. Truncated cash remains in the account.

### 4.4 Rebalancing Logic

**Cadence**: Every 21 trading days (≈ monthly). Don't rebalance on weekends or holidays — use the next available trading day.

On each rebalance date:

```
1. Compute today's top-N
2. Compare to current holdings:
     to_sell = current_holdings - top_n
     to_buy  = top_n - current_holdings
     to_hold = current_holdings ∩ top_n
3. SELL all `to_sell` positions at today's close (or next-day open in live trading)
4. BUY all `to_buy` positions equal-weighted from cash + sale proceeds
5. HOLD positions in `to_hold` are NOT touched (no re-balancing of weights to equal)
```

**Note on weight drift**: Holdings naturally drift away from equal weight as some grow and some shrink. **Do NOT rebalance them back to equal weight every month.** Only rebalance the buy/sell turnover. This matches the backtest and reduces transaction costs.

### 4.5 Stop-Loss (fixed_20pct)

Between monthly rebalances, check each position daily (or at any cadence):

```
For each open position:
  if current_close < entry_price * 0.80:
    SELL at next available price
    Record realized loss
    Capital sits in cash until next rebalance (do NOT replace the position immediately)
```

This stop-loss empirically improved 10-year return by ~50pp and reduced drawdown by ~5pp in our backtest. Tested ~85 stops over 10 years on a 20-position portfolio = ~8 stops per year. Sparse and disaster-only.

**Do NOT use these alternative stops** (we tested and they hurt):
- ❌ Trailing % stop (any flavor)
- ❌ Trailing ATR stop
- ❌ SMA-200 stop on individual stocks
- ❌ RSI overbought / oversold exits

---

## 5. State Persistence

### 5.1 Portfolio State Schema (`current_portfolio.json`)

```json
{
  "started": "2026-04-28",
  "initial_capital": 100000.0,
  "last_rebalance": "2026-04-28",
  "cash": 5656.88,
  "positions": {
    "SNDK": {
      "entry_date": "2026-04-28",
      "entry_price": 1070.20,
      "shares": 4,
      "cost_basis": 4280.80
    },
    "LITE": {
      "entry_date": "2026-04-28",
      "entry_price": 859.68,
      "shares": 5,
      "cost_basis": 4298.40
    }
  }
}
```

### 5.2 Trade History Schema (`trade_history.csv` — append-only)

| Column | Type | Description |
|---|---|---|
| `date` | YYYY-MM-DD | Date of trade execution |
| `ticker` | string | Stock symbol |
| `action` | `BUY` or `SELL` | Trade type |
| `price` | number | Execution price per share |
| `shares` | integer | Number of shares |
| `cost_basis` | number | For BUY: total cost; for SELL: original cost basis |
| `proceeds` | number | For SELL only: total sale proceeds (else empty) |
| `pnl` | number | For SELL only: realized profit/loss in dollars |
| `pnl_pct` | number | For SELL only: realized return % |
| `entry_date` | YYYY-MM-DD | Date the position was opened (links SELL → original BUY) |
| `exit_reason` | enum | `rebalance` / `stop_loss` (suggested addition) |

---

## 6. Monthly Workflow

### Initial setup (one time)
1. Run universe builder → save list of eligible tickers.
2. Compute today's top-N momentum picks.
3. Place buy orders to open all N positions at next-day open, equal-weighted.
4. Save initial portfolio state with each position's actual fill price + share count.

### Monthly rebalance (every ~21 trading days)
1. Refresh universe (re-fetch SP500/NDX100 lists, re-fetch market caps).
2. Compute today's top-N momentum picks.
3. Diff against current portfolio:
   - Compute `to_sell`, `to_buy`, `to_hold`.
4. Execute trades at next-day open:
   - Sell positions in `to_sell`.
   - Use sale proceeds + existing cash to equal-weight `to_buy` positions.
5. Update portfolio state file with new entry prices/shares/dates.
6. Append all trades to history file (with realized P&L on sells).

### Daily (or any cadence) — stop-loss check
1. For each open position, fetch today's close.
2. If `close < entry_price * 0.80`, queue a sell order.
3. After confirming the sell fills, log to history with realized loss.
4. Capital stays in cash until next monthly rebalance.

### Performance check (anytime)
1. For each open position, fetch current price.
2. Compute unrealized P&L per position.
3. Sum all realized P&L from history file.
4. Total = (open positions value) + cash + (realized P&L) − initial_capital.
5. Compare to: SPY price-then vs SPY price-now × initial_capital.

---

## 7. JavaScript-Specific Implementation Notes

### 7.1 Date handling

JavaScript's native `Date` is awkward for trading data. Use one of:
- `date-fns` (lightweight, immutable, preferred)
- `dayjs` (Moment.js successor)
- `luxon` (heavier, more features)

Always work in **trading days**, not calendar days. A 21-trading-day rebalance ≠ 21 calendar days.

```javascript
// Pseudocode for "21 trading days ago"
function nThTradingDayBefore(targetDate, n, allTradingDates) {
  const idx = allTradingDates.indexOf(targetDate);
  if (idx < n) return null;
  return allTradingDates[idx - n];
}
```

### 7.2 Async data fetching

Batch ticker downloads to avoid rate limiting:
```javascript
async function fetchInBatches(tickers, batchSize = 50) {
  const results = [];
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const data = await Promise.all(batch.map(fetchTicker));
    results.push(...data);
    await sleep(500); // courtesy delay between batches
  }
  return results;
}
```

### 7.3 Caching

Cache OHLCV data on disk (or IndexedDB / SQLite). Free-tier APIs have aggressive rate limits; you'll hit them on the first run with 500+ tickers.

Suggested cache TTL: 24 hours for daily data. Re-fetch only if last cache write < today.

### 7.4 Floating point precision

Money math in JS suffers floating-point errors. Either:
- Round to 2 decimals on all dollar amounts
- Use `decimal.js` or `big.js` for exact arithmetic if you care about cent-level accuracy

```javascript
// Acceptable: round-then-compare
const cost = Math.round(shares * price * 100) / 100;
```

### 7.5 Wikipedia scraping

Use `axios` + `cheerio`:
```javascript
const html = await axios.get(URL, {
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; momentum-bot)' }
}).then(r => r.data);
const $ = cheerio.load(html);
const tickers = $('table#constituents tbody tr')
  .map((_, row) => $(row).find('td:nth-child(1) a').first().text().trim())
  .get();
```

---

## 8. Edge Cases to Handle

| Case | Behavior |
|---|---|
| Ticker has < 253 trading days of data (recent IPO) | Skip — not eligible until it has enough history |
| Ticker delisted between rebalances | Sell at last available close on next rebalance, log as SELL |
| Market cap data unavailable | Skip from universe |
| Stop-loss fires on the same day as a rebalance | Stop-loss takes priority; don't double-trade |
| Ticker is in top-N but `Close[today]` is NaN | Skip this rebalance for that ticker; reconsider next month |
| Rebalance falls on a non-trading day | Use next available trading day |
| Weekends / holidays | Trading day calendar must be respected; use exchange calendar |
| Ticker symbol changes (e.g. FB → META) | One-time mapping in code; rare event |
| Stock split | If using adjusted close (recommended), splits are auto-handled. If using raw close, must adjust manually |

**Always use adjusted close** for momentum calculation. yfinance's `auto_adjust=True` mode is correct. Most JS data libraries default to adjusted close as well.

---

## 9. What NOT to Add (Empirically Tested and Rejected)

| Modification | Effect on 10-year return | Why it failed |
|---|---|---|
| Quarterly rebalance | −30 to −50% loss | Lets winners decay between rebalances |
| SPY-200-SMA market regime filter | **−2,120 pp** | Forces exit during temporary SPY dips when momentum is still working |
| RSP-200-SMA breadth filter | −100% (worse than buy-and-hold) | Equal-weighted RSP lags large-cap recovery |
| Per-stock SMA-200 trend filter | Marginal at best | Mostly redundant with momentum |
| RSI overbought exits | Doesn't fire / becomes buy-and-hold | RSI rarely hits >80 for 3 days even at tops |
| Trailing-% stop loss | −1,500+ pp | Whipsaws on normal pullbacks |
| Trailing ATR stop loss | −1,700+ pp | Same — too sensitive |
| Equity-curve trend filter | Originally appeared bad due to a bug; with bug fixed: marginal/neutral | Mean-reversion strategies have anti-persistent equity curves |
| LLM/AI regime detection | Untestable | Output not deterministic; training data leakage; no validation possible |

The strategy has been **deliberately stripped to the minimum that empirically works**. Every "improvement" we tested either hurt or didn't help meaningfully. Resist the urge to add filters.

---

## 10. Expected Performance (calibrated, not backtest)

The 10-year backtest showed +3,402%. That number is structurally inflated by survivorship bias and lookahead in universe construction. Realistic out-of-sample expectations:

| Metric | Realistic forward |
|---|---|
| Annualized return | **15-22%** (vs SPY ~10%) |
| Annualized alpha | **+5-12 pp over SPY** |
| 5-year cumulative | **+90-180%** (vs SPY ~50-80%) |
| 10-year cumulative | **+400-900%** (vs SPY ~250-350%) |
| Max drawdown | **−35% to −45%** (similar to SPY) |
| Underperformance streaks | 6-18 months are normal |
| Months below SPY | ~40% |

**Tax considerations**: Monthly rotation = mostly short-term capital gains. In a taxable account at ~37% short-term rate, after-tax alpha shrinks roughly in half. **Run in IRA / 401(k) / tax-advantaged account if at all possible.**

**Transaction costs**: 20 positions × ~30% turnover/month × 12 months × 2 (round-trip) ≈ 144 trades/year. At a $0-commission broker with 5bps slippage on large-caps, expect ~0.7% annualized cost drag. Negligible-to-meaningful depending on AUM.

---

## 11. Validation Checklist

Before going live, verify your implementation produces these outputs (using cached data through 2024 or 2025):

1. **Momentum calculation correctness**:
   - Pick a ticker (e.g. NVDA).
   - Compute manually: NVDA's close 252 trading days ago vs 21 trading days ago.
   - Compare to your `momentum_pct` for the same date.
   - Should match to 4 decimal places.

2. **Top-N stability**:
   - Compute top-20 on date `T`.
   - Compute top-20 on date `T+1`.
   - The two lists should differ by ≤ 2 tickers in normal market conditions.
   - Massive turnover day-to-day = bug in calculation.

3. **Historical face validity**:
   - Run momentum on April 2022. Top stocks should be **energy** (DVN, OXY, COP, HAL).
   - Run on April 2024. Top stocks should include **AI/semis** (NVDA, SMCI, CVNA, MSTR).
   - Run on April 2020. Top stocks should include **COVID-rally names** (TSLA, AMD, SHOP).
   - If your historical picks don't reflect what was working at those times, you have a lookahead or computation bug.

4. **No look-ahead in rebalance**:
   - On rebalance date `T`, momentum should use only data ≤ `T - 21`.
   - Trades execute at price on `T` or `T+1`.
   - The `T-21` buffer is critical — using `T-1` instead introduces short-term reversal contamination.

5. **Stop-loss arithmetic**:
   - Open a test position at $100.
   - Verify the stop fires when price closes < $80.
   - Verify the stop does NOT fire on intraday price below $80 if close is ≥ $80.

6. **Bookkeeping integrity**:
   - Sum of all `cost_basis` in open positions + cash should equal `initial_capital + sum(realized PnL)`.
   - Always within ~$1 of accounting tolerance (rounding).

---

## 12. Summary Card

```
Universe        : current S&P 500 + NASDAQ-100, market cap ≥ $10B (~500 stocks)
Signal          : 12-1 momentum (return from t-252 to t-21)
Selection       : top 20 by momentum, equal-weighted (5% each)
Rebalance       : every ~21 trading days
Stop-loss       : fixed −20% from entry, position-level (sells to cash until next rebalance)
Position sizing : floor(slot_value / current_close), integer shares
Filters         : NONE (no SPY filter, no trend filter, no AI)
Operational     : run screener monthly, execute the diff
```

This is the entire strategy. Everything else is decoration.
