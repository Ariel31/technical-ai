import type { OHLCVBar, ScreenerCandidate, ScreenerPattern } from "./types";

// ─── Math helpers ──────────────────────────────────────────────────────────────

export function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  return closes.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function ema(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let val = closes.slice(0, period).reduce((a, b) => a + b, 0) / period; // seed with SMA
  for (let i = period; i < closes.length; i++) val = closes[i] * k + val * (1 - k);
  return val;
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const slice = changes.slice(-period);
  const gains = slice.filter((c) => c > 0).reduce((a, b) => a + b, 0) / period;
  const losses = slice.filter((c) => c < 0).reduce((a, b) => a + Math.abs(b), 0) / period;
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

export function atr(bars: OHLCVBar[], period = 14): number {
  if (bars.length < period + 1) return 0;
  const trs = bars.slice(1).map((b, i) => {
    const prev = bars[i].close;
    return Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev));
  });
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ─── Basic filter: price > $10, 50-day avg vol > 500k ─────────────────────────

export function passesBasicFilter(bars: OHLCVBar[], price: number): boolean {
  if (price < 10) return false;
  const volumes = bars.map((b) => b.volume);
  const avgVol50 = volumes.slice(-51, -1).reduce((a, b) => a + b, 0) / 50;
  return avgVol50 >= 500_000;
}

// ─── Trend filter (Minervini-style template) ───────────────────────────────────
// Pass: price > SMA200, price > SMA150, SMA150 > SMA200, within 15% of 52wk high

export function passesTrendFilter(
  price: number,
  sma150: number,
  sma200: number,
  high52w: number,
): boolean {
  return (
    price > sma200 &&
    price > sma150 &&
    sma150 > sma200 &&
    (high52w - price) / high52w <= 0.15
  );
}

// ─── Pattern detection ────────────────────────────────────────────────────────

export function detectPattern(
  bars: OHLCVBar[],
  price: number,
  sm20: number,
  sm50: number,
): { pattern: ScreenerPattern; breakoutLevel: number; consolidationDays: number } {
  const closes  = bars.map((b) => b.close);
  const highs   = bars.map((b) => b.high);
  const lows    = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);
  const len = bars.length;

  // ── Cup & Handle ─────────────────────────────────────────────────────────────
  // Requires a genuine U-shape: both rims at similar level, middle clearly lower,
  // followed by a shallow handle that hasn't retraced > 35% of the cup depth.
  if (len >= 80) {
    const cup      = bars.slice(-90, -12); // cup body (excludes the handle)
    const handle   = bars.slice(-12);

    // Left and right rim = highest high in first/last 10% of cup
    const wing = Math.max(1, Math.floor(cup.length * 0.12));
    const leftRim  = Math.max(...cup.slice(0, wing).map((b) => b.high));
    const rightRim = Math.max(...cup.slice(-wing).map((b) => b.high));
    const rimLevel = Math.max(leftRim, rightRim);

    // Both rims must be within 8% of each other (symmetric base)
    if (Math.abs(leftRim - rightRim) / rimLevel <= 0.08) {
      const cupLow  = Math.min(...cup.map((b) => b.low));
      const cupDepth = (rimLevel - cupLow) / rimLevel * 100;

      if (cupDepth >= 12 && cupDepth <= 45) {
        // Verify U-shape: average close of the middle third must be clearly lower
        const t = Math.floor(cup.length / 3);
        const avg = (slice: OHLCVBar[]) => slice.reduce((s, b) => s + b.close, 0) / slice.length;
        const midAvg   = avg(cup.slice(t, 2 * t));
        const edgeAvg  = (avg(cup.slice(0, t)) + avg(cup.slice(2 * t))) / 2;
        if (midAvg < edgeAvg * 0.94) {
          // Handle: shallow pullback from right rim, price near breakout
          const handleLow  = Math.min(...handle.map((b) => b.low));
          const retracement = (rimLevel - handleLow) / (rimLevel - cupLow) * 100;
          if (retracement >= 5 && retracement <= 35 && price >= rimLevel * 0.96) {
            return { pattern: "cup_and_handle", breakoutLevel: rimLevel, consolidationDays: 12 };
          }
        }
      }
    }
  }

  // ── Double Bottom ─────────────────────────────────────────────────────────────
  // Two lows within 3%, separated by a peak ≥ 6% above both lows.
  // Neckline = highest point BETWEEN the two bottoms (not the all-time high).
  if (len >= 40) {
    const search = bars.slice(-60);
    const mid    = Math.floor(search.length / 2);

    // Find index and value of each bottom
    let lo1Idx = 0;
    for (let i = 1; i < mid; i++) if (search[i].low < search[lo1Idx].low) lo1Idx = i;
    let lo2Idx = mid;
    for (let i = mid + 1; i < search.length; i++) if (search[i].low < search[lo2Idx].low) lo2Idx = i;

    const lo1 = search[lo1Idx].low;
    const lo2 = search[lo2Idx].low;

    // Neckline = highest high BETWEEN the two bottoms
    const between    = search.slice(lo1Idx + 1, lo2Idx);
    const neckline   = between.length > 0
      ? Math.max(...between.map((b) => b.high))
      : Math.max(...search.map((b) => b.high));
    const avgLow = (lo1 + lo2) / 2;

    if (
      Math.abs(lo1 - lo2) / lo1 < 0.03 &&            // lows match within 3%
      (neckline - avgLow) / avgLow >= 0.06 &&          // neckline ≥ 6% above lows
      price >= neckline * 0.97                          // price near or above neckline
    ) {
      return { pattern: "double_bottom", breakoutLevel: neckline, consolidationDays: search.length };
    }
  }

  // ── Bull Flag ─────────────────────────────────────────────────────────────────
  // 20-bar pole ≥ 8%, followed by a 10-bar flag with range < 5%.
  // Flag must not retrace > 50% of the pole.
  if (len >= 30) {
    const pole    = bars.slice(-30, -10);
    const flag    = bars.slice(-10);
    const poleLow  = Math.min(...pole.map((b) => b.low));
    const poleHigh = Math.max(...pole.map((b) => b.high));
    const poleRet  = (pole[pole.length - 1].close - pole[0].close) / pole[0].close * 100;
    const flagHigh = Math.max(...flag.map((b) => b.high));
    const flagLow  = Math.min(...flag.map((b) => b.low));
    const flagRange = (flagHigh - flagLow) / price * 100;
    const flagRetrace = poleHigh > poleLow
      ? (poleHigh - flagLow) / (poleHigh - poleLow) * 100
      : 100;

    if (poleRet >= 8 && flagRange < 5 && flagRetrace < 50) {
      return { pattern: "bull_flag", breakoutLevel: flagHigh, consolidationDays: 10 };
    }
  }

  // ── Consolidation Breakout ────────────────────────────────────────────────────
  // Tight 10-day range (< 4%) coiling near 52-week high (within 5%).
  const high10d  = Math.max(...highs.slice(-10));
  const low10d   = Math.min(...lows.slice(-10));
  const range10d = (high10d - low10d) / price * 100;
  const high52w  = Math.max(...highs);
  if (range10d < 4 && price >= high52w * 0.96) {
    return { pattern: "consolidation_breakout", breakoutLevel: high10d, consolidationDays: 10 };
  }

  // ── SMA Bounce ────────────────────────────────────────────────────────────────
  // Pulled back to within 1% of SMA20 or SMA50 within last 5 bars, now recovering.
  const recentLow = Math.min(...lows.slice(-5));
  const touchedSma20 = recentLow <= sm20 * 1.012 && recentLow >= sm20 * 0.97;
  const touchedSma50 = recentLow <= sm50 * 1.012 && recentLow >= sm50 * 0.97;
  if ((touchedSma20 || touchedSma50) && price > sm20 && price > sm50) {
    return { pattern: "sma_bounce", breakoutLevel: Math.max(...highs.slice(-20)), consolidationDays: 5 };
  }

  // ── Momentum Continuation ─────────────────────────────────────────────────────
  // Above both SMAs, RSI in 52–70 range, recent volume pickup.
  const rsi14Val = rsi(closes);
  if (rsi14Val !== null && rsi14Val >= 52 && rsi14Val <= 70 && price > sm20 && price > sm50) {
    const avgVol20   = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const recentVol5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    if (recentVol5 >= avgVol20 * 1.15) {
      return { pattern: "momentum_continuation", breakoutLevel: Math.max(...highs.slice(-20)), consolidationDays: 5 };
    }
  }

  return { pattern: "none", breakoutLevel: price * 1.03, consolidationDays: 0 };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────
//
//  SetupScore       = 0.35 * pattern_quality
//                   + 0.30 * trend_strength
//                   + 0.20 * relative_strength
//                   + 0.15 * consolidation_quality
//
//  OpportunityScore = 0.35 * breakout_proximity
//                   + 0.25 * volume_strength
//                   + 0.25 * risk_reward_score
//                   + 0.15 * momentum_score
//
//  FinalScore = 0.60 * SetupScore + 0.40 * OpportunityScore

function patternQualityScore(
  pattern: ScreenerPattern,
  breakoutDistance: number,
  volumeRatio: number,
): number {
  if (pattern === "none") return 0;
  const base: Record<ScreenerPattern, number> = {
    cup_and_handle:              85,
    double_bottom:               75,
    bull_flag:                   70,
    consolidation_breakout:      65,
    sma_bounce:                  55,
    momentum_continuation:       50,
    falling_wedge:               78,
    inverse_head_and_shoulders:  82,
    none:                        0,
  };
  let q = base[pattern];
  if      (breakoutDistance < 1) q += 15;
  else if (breakoutDistance < 3) q += 8;
  else if (breakoutDistance < 6) q += 3;
  if      (volumeRatio > 1.5)    q += 8;
  else if (volumeRatio > 1.2)    q += 4;
  return Math.min(100, q);
}

export interface ScoreResult {
  setupScore: number;
  opportunityScore: number;
  finalScore: number;
}

export function computeScores(params: {
  pattern: ScreenerPattern;
  breakoutDistance: number;
  volumeRatio: number;
  relativeStrength: number;
  trendAlignment: number;   // 0-100 (25 per SMA above)
  isContracting: boolean;
  range10d: number;
  riskReward: number;
  change5d: number;
  change20d: number;
  change60d: number;
}): ScoreResult {
  const {
    pattern, breakoutDistance, volumeRatio, relativeStrength,
    trendAlignment, isContracting, range10d, riskReward,
    change5d, change20d, change60d,
  } = params;

  // SetupScore components
  const patternQuality  = patternQualityScore(pattern, breakoutDistance, volumeRatio);
  const trendStrength   = trendAlignment;
  const rsScore         = Math.max(0, Math.min(100, (relativeStrength + 10) * 5));
  const consolidation   =
    isContracting  ? 90 :
    range10d < 5   ? 75 :
    range10d < 8   ? 50 :
    range10d < 12  ? 25 : 0;

  // OpportunityScore components
  const breakoutProximity =
    breakoutDistance <= 0  ? 100 :
    breakoutDistance <= 1  ? 90  :
    breakoutDistance <= 2  ? 75  :
    breakoutDistance <= 4  ? 55  :
    breakoutDistance <= 7  ? 35  :
    breakoutDistance <= 12 ? 15  : 0;

  const volumeStrength =
    volumeRatio >= 3   ? 100 :
    volumeRatio >= 2.5 ? 85  :
    volumeRatio >= 2   ? 70  :
    volumeRatio >= 1.5 ? 50  :
    volumeRatio >= 1.2 ? 30  :
    volumeRatio >= 1   ? 15  : 0;

  const rrScore     = Math.max(0, Math.min(100, (riskReward - 1) / 3 * 100));
  const momentumRaw = 0.5 * change5d + 0.3 * change20d + 0.2 * change60d;
  const momentum    = Math.max(0, Math.min(100, (momentumRaw + 5) * 10));

  const setupScore =
    0.35 * patternQuality +
    0.30 * trendStrength  +
    0.20 * rsScore        +
    0.15 * consolidation;

  const opportunityScore =
    0.35 * breakoutProximity +
    0.25 * volumeStrength    +
    0.25 * rrScore           +
    0.15 * momentum;

  const finalScore = 0.60 * setupScore + 0.40 * opportunityScore;

  return { setupScore, opportunityScore, finalScore };
}

// ─── Algorithmic signal labels (derived from candidate data) ──────────────────

export function generateSignals(c: Pick<
  ScreenerCandidate,
  | "aboveSma200" | "aboveSma150" | "sma150" | "sma200"
  | "isContracting" | "rsRank" | "volumeRatio"
  | "breakoutDistance" | "pattern" | "rsi14" | "change5d" | "change20d" | "change60d"
>): string[] {
  const signals: string[] = [];

  // Volatility squeeze (specific — not universal)
  if (c.isContracting)
    signals.push("Volatility squeeze — coiling");

  // Relative strength rank (with percentile)
  if (c.rsRank >= 90)      signals.push(`RS rank ${c.rsRank}th percentile`);
  else if (c.rsRank >= 75) signals.push(`RS rank ${c.rsRank}th percentile`);

  // Volume with actual ratio
  if (c.volumeRatio >= 2)
    signals.push(`Volume ${c.volumeRatio.toFixed(1)}× 50d avg`);
  else if (c.volumeRatio >= 1.4)
    signals.push(`Volume ${c.volumeRatio.toFixed(1)}× 50d avg`);

  // Breakout proximity with actual distance
  if (c.breakoutDistance <= 0)
    signals.push("Breaking out now");
  else if (c.breakoutDistance <= 1.5)
    signals.push(`${c.breakoutDistance.toFixed(1)}% from breakout`);
  else if (c.breakoutDistance <= 4)
    signals.push(`${c.breakoutDistance.toFixed(1)}% from breakout`);

  // RSI with actual value
  if (c.rsi14 >= 52 && c.rsi14 <= 70)
    signals.push(`RSI ${Math.round(c.rsi14)} — momentum zone`);
  else if (c.rsi14 > 70)
    signals.push(`RSI ${Math.round(c.rsi14)} — extended`);

  // Momentum with actual % — most differentiating signal
  if (c.change5d >= 4)
    signals.push(`+${c.change5d.toFixed(1)}% this week`);
  else if (c.change20d >= 8)
    signals.push(`+${c.change20d.toFixed(1)}% this month`);
  else if (c.change60d >= 15)
    signals.push(`+${c.change60d.toFixed(1)}% in 60 days`);

  return signals;
}

// ─── Linear regression helper (private) ──────────────────────────────────────

function linReg(vals: number[]): { slope: number; intercept: number } {
  const n = vals.length;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += vals[i]; sxy += i * vals[i]; sx2 += i * i; }
  const d = n * sx2 - sx * sx;
  if (d === 0) return { slope: 0, intercept: sy / n };
  return { slope: (n * sxy - sx * sy) / d, intercept: (sy - ((n * sxy - sx * sy) / d) * sx) / n };
}

// ─── Reversal pattern detection ───────────────────────────────────────────────
// Separate from detectPattern because it runs on stocks that fail the Minervini filter.

export function detectReversalPattern(
  bars: OHLCVBar[],
  price: number,
): { pattern: ScreenerPattern; breakoutLevel: number; consolidationDays: number } {
  const len = bars.length;

  // ── Falling Wedge ─────────────────────────────────────────────────────────
  // Both highs and lows are declining, but lows decline more slowly (converging).
  // Price approaches the upper trendline = near breakout.
  if (len >= 40) {
    const wb     = bars.slice(-40);
    const n      = wb.length;
    const midRef = (wb[0].high + wb[0].low) / 2 || 1;
    const upperR = linReg(wb.map((b) => b.high));
    const lowerR = linReg(wb.map((b) => b.low));
    // Normalise slopes so they are scale-independent (% per bar)
    const slopeU = upperR.slope / midRef;
    const slopeL = lowerR.slope / midRef;
    // Both must trend down; upper must decline faster → wedge narrows
    if (slopeU < -0.0008 && slopeL < 0 && slopeU < slopeL) {
      const upperNow = upperR.slope * (n - 1) + upperR.intercept;
      // Price must be within 4% of the upper trendline (near breakout)
      if (price >= upperNow * 0.96 && price <= upperNow * 1.04) {
        return { pattern: "falling_wedge", breakoutLevel: upperNow, consolidationDays: 40 };
      }
    }
  }

  // ── Inverse Head and Shoulders ────────────────────────────────────────────
  // Three lows: head is the deepest; shoulders are at a similar (higher) level.
  // Neckline = average of the two peaks flanking the head.
  // Price near the neckline = about to break out.
  if (len >= 60) {
    const wb  = bars.slice(-80);
    const seg = Math.floor(wb.length / 5);
    if (seg >= 8) {
      const lsSeg   = wb.slice(0,           seg);
      const nk1Seg  = wb.slice(seg,     2 * seg);
      const hdSeg   = wb.slice(2 * seg, 3 * seg);
      const nk2Seg  = wb.slice(3 * seg, 4 * seg);
      const rsSeg   = wb.slice(4 * seg);

      const lsLow  = Math.min(...lsSeg.map((b) => b.low));
      const nk1Hi  = Math.max(...nk1Seg.map((b) => b.high));
      const hdLow  = Math.min(...hdSeg.map((b) => b.low));
      const nk2Hi  = Math.max(...nk2Seg.map((b) => b.high));
      const rsLow  = Math.min(...rsSeg.map((b) => b.low));
      const neckline = (nk1Hi + nk2Hi) / 2;

      if (
        hdLow < lsLow * 0.95 &&                           // head ≥ 5% below left shoulder
        hdLow < rsLow * 0.95 &&                           // head ≥ 5% below right shoulder
        Math.abs(lsLow - rsLow) / lsLow < 0.10 &&        // shoulders within 10%
        (neckline - hdLow) / hdLow >= 0.05 &&             // neckline ≥ 5% above head
        price >= neckline * 0.95 &&                        // price ≥ 95% of neckline
        price <= neckline * 1.05                           // price ≤ 105% of neckline
      ) {
        return {
          pattern: "inverse_head_and_shoulders",
          breakoutLevel: neckline,
          consolidationDays: 80,
        };
      }
    }
  }

  return { pattern: "none", breakoutLevel: price * 1.03, consolidationDays: 0 };
}
