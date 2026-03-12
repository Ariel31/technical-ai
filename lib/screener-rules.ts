import type { ScreenerCandidate, UserScreenerConfig } from "./types";

// ─── Filter definition ────────────────────────────────────────────────────────

export interface FilterDefinition {
  id: string;
  label: string;
  category: "pattern" | "indicator" | "fibonacci" | "risk";
  description: string;
  /** true → hard filter (must pass). Pattern category uses OR; others use AND. */
  isHardFilter: boolean;
  /** Returns true if the candidate has this characteristic. */
  matches: (c: ScreenerCandidate) => boolean;
  /**
   * Soft boost factor added to total multiplier when matched.
   * adjustedScore = baseScore * (1 + Σ boostFactor), capped at 2×.
   * Ignored when isHardFilter = true.
   */
  boostFactor: number;
  /** Short sentence injected into the Gemini prompt under USER PREFERENCES. */
  promptHint: string;
}

// ─── Fibonacci helpers ────────────────────────────────────────────────────────

function nearFib(c: ScreenerCandidate, ratio: number): boolean {
  const range = c.high52w - c.low52w;
  if (range <= 0) return false;
  const level = c.high52w - range * ratio;
  return Math.abs(c.price - level) / level < 0.03; // within ±3%
}

// ─── Filter list (display order) ─────────────────────────────────────────────

const FILTER_LIST: FilterDefinition[] = [

  // ── Patterns (hard, OR logic within category) ────────────────────────────

  {
    id: "pattern_cup_handle",
    label: "Cup & Handle",
    category: "pattern",
    description: "Classic U-shaped base with a shallow pullback handle near breakout",
    isHardFilter: true,
    matches: (c) => c.pattern === "cup_and_handle",
    boostFactor: 0,
    promptHint: "User wants Cup & Handle setups — prioritize coiling near right-rim breakout",
  },
  {
    id: "pattern_double_bottom",
    label: "Double Bottom",
    category: "pattern",
    description: "Two equal lows with a neckline breakout confirming reversal",
    isHardFilter: true,
    matches: (c) => c.pattern === "double_bottom",
    boostFactor: 0,
    promptHint: "User wants Double Bottom setups — look for neckline breakout with volume",
  },
  {
    id: "pattern_bull_flag",
    label: "Bull Flag",
    category: "pattern",
    description: "Strong pole followed by tight, orderly pullback",
    isHardFilter: true,
    matches: (c) => c.pattern === "bull_flag",
    boostFactor: 0,
    promptHint: "User wants Bull Flag setups — pole strength and tight flag consolidation are key",
  },
  {
    id: "pattern_consolidation",
    label: "Consolidation Breakout",
    category: "pattern",
    description: "Tight 10-day range coiling near 52-week high",
    isHardFilter: true,
    matches: (c) => c.pattern === "consolidation_breakout",
    boostFactor: 0,
    promptHint: "User wants Consolidation Breakout setups — tight range + proximity to 52-week high",
  },
  {
    id: "pattern_sma_bounce",
    label: "SMA Bounce",
    category: "pattern",
    description: "Pullback to SMA20/SMA50 support with recovery",
    isHardFilter: true,
    matches: (c) => c.pattern === "sma_bounce",
    boostFactor: 0,
    promptHint: "User wants SMA Bounce setups — clean touches of SMA20/50 with recovery",
  },
  {
    id: "pattern_falling_wedge",
    label: "Falling Wedge",
    category: "pattern",
    description: "Converging downtrend lines with bullish breakout potential",
    isHardFilter: true,
    matches: (c) => c.pattern === "falling_wedge",
    boostFactor: 0,
    promptHint: "User wants Falling Wedge setups — converging trendlines near upper breakout",
  },
  {
    id: "pattern_inverse_hs",
    label: "Inverse H&S",
    category: "pattern",
    description: "Three-trough reversal pattern with neckline breakout",
    isHardFilter: true,
    matches: (c) => c.pattern === "inverse_head_and_shoulders",
    boostFactor: 0,
    promptHint: "User wants Inverse Head & Shoulders setups — neckline proximity and volume are key",
  },
  {
    id: "pattern_momentum",
    label: "Momentum",
    category: "pattern",
    description: "Above both SMAs with RSI in momentum zone and volume pickup",
    isHardFilter: true,
    matches: (c) => c.pattern === "momentum_continuation",
    boostFactor: 0,
    promptHint: "User wants Momentum Continuation setups — trending above SMAs with RSI 52-70",
  },

  // ── Indicators (soft score boosters) ─────────────────────────────────────

  {
    id: "rsi_momentum",
    label: "RSI 50–70",
    category: "indicator",
    description: "RSI in the momentum zone — uptrend with room to run",
    isHardFilter: false,
    matches: (c) => c.rsi14 >= 50 && c.rsi14 <= 70,
    boostFactor: 0.12,
    promptHint: "User prefers RSI in the 50–70 momentum zone (not overbought, trending up)",
  },
  {
    id: "rsi_oversold",
    label: "RSI Oversold",
    category: "indicator",
    description: "RSI below 35 — potential reversal/rebound setup",
    isHardFilter: false,
    matches: (c) => c.rsi14 < 35,
    boostFactor: 0.12,
    promptHint: "User prefers RSI oversold conditions (< 35) — reversal/mean-reversion setups",
  },
  {
    id: "above_ema20",
    label: "Above EMA 20",
    category: "indicator",
    description: "Price above the 20-period EMA — short-term trend is up",
    isHardFilter: false,
    matches: (c) => c.price > c.ema20,
    boostFactor: 0.10,
    promptHint: "User prefers stocks trading above their 20-day EMA (short-term uptrend)",
  },
  {
    id: "above_ema50",
    label: "Above EMA 50",
    category: "indicator",
    description: "Price above the 50-period EMA — medium-term trend is up",
    isHardFilter: false,
    matches: (c) => c.price > c.ema50,
    boostFactor: 0.10,
    promptHint: "User prefers stocks trading above their 50-day EMA (medium-term uptrend)",
  },
  {
    id: "sma_stack",
    label: "Bullish SMA Stack",
    category: "indicator",
    description: "SMA20 > SMA50 > SMA200 — full bullish moving average alignment",
    isHardFilter: false,
    matches: (c) => c.sma20 > c.sma50 && c.sma50 > c.sma200,
    boostFactor: 0.12,
    promptHint: "User wants full bullish SMA alignment (SMA20 > SMA50 > SMA200)",
  },
  {
    id: "near_breakout",
    label: "Near Breakout",
    category: "indicator",
    description: "Within 2% of the pattern's breakout level",
    isHardFilter: false,
    matches: (c) => c.breakoutDistance < 2,
    boostFactor: 0.15,
    promptHint: "User wants setups within 2% of breakout level — about to trigger",
  },
  {
    id: "volume_surge",
    label: "Volume Surge",
    category: "indicator",
    description: "Today's volume ≥ 1.5× the 50-day average",
    isHardFilter: false,
    matches: (c) => c.volumeRatio >= 1.5,
    boostFactor: 0.13,
    promptHint: "User wants volume confirmation — recent volume ≥ 1.5× 50-day average",
  },
  {
    id: "high_rs",
    label: "High Rel. Strength",
    category: "indicator",
    description: "RS rank in the top 25% — outperforming most candidates",
    isHardFilter: false,
    matches: (c) => c.rsRank >= 75,
    boostFactor: 0.13,
    promptHint: "User wants RS leaders — RS rank ≥ 75th percentile vs other candidates",
  },
  {
    id: "volatility_squeeze",
    label: "Volatility Squeeze",
    category: "indicator",
    description: "ATR and range are contracting — coiling for a move",
    isHardFilter: false,
    matches: (c) => c.isContracting,
    boostFactor: 0.15,
    promptHint: "User wants volatility squeezes — ATR contracting, range tightening (coiled setups)",
  },
  {
    id: "near_52wk_high",
    label: "Near 52-wk High",
    category: "indicator",
    description: "Price within 5% of its 52-week high",
    isHardFilter: false,
    matches: (c) => c.high52w > 0 && (c.high52w - c.price) / c.high52w < 0.05,
    boostFactor: 0.10,
    promptHint: "User wants stocks near their 52-week high (within 5%) — strength leaders",
  },

  // ── Fibonacci (soft score boosters) ──────────────────────────────────────

  {
    id: "fib_382",
    label: "At 38.2% Retrace",
    category: "fibonacci",
    description: "Price at the 38.2% Fibonacci retracement of the 52-week range (±3%)",
    isHardFilter: false,
    matches: (c) => nearFib(c, 0.382),
    boostFactor: 0.15,
    promptHint: "User wants stocks at the 38.2% Fibonacci retracement of their 52-week range",
  },
  {
    id: "fib_50",
    label: "At 50% Retrace",
    category: "fibonacci",
    description: "Price at the 50% Fibonacci retracement of the 52-week range (±3%)",
    isHardFilter: false,
    matches: (c) => nearFib(c, 0.50),
    boostFactor: 0.15,
    promptHint: "User wants stocks at the 50% Fibonacci retracement — midpoint support",
  },
  {
    id: "fib_618",
    label: "At 61.8% Retrace",
    category: "fibonacci",
    description: "Price at the golden ratio retracement of the 52-week range (±3%)",
    isHardFilter: false,
    matches: (c) => nearFib(c, 0.618),
    boostFactor: 0.15,
    promptHint: "User wants stocks at the 61.8% golden-ratio Fibonacci retracement",
  },

  // ── Risk / R/R (hard, AND logic) ──────────────────────────────────────────

  {
    id: "min_rr_2",
    label: "R/R ≥ 2:1",
    category: "risk",
    description: "Minimum risk/reward ratio of 2:1",
    isHardFilter: true,
    matches: (c) => c.riskReward >= 2.0,
    boostFactor: 0,
    promptHint: "User requires minimum 2:1 risk/reward — reject setups with tight targets",
  },
  {
    id: "min_rr_3",
    label: "R/R ≥ 3:1",
    category: "risk",
    description: "Minimum risk/reward ratio of 3:1",
    isHardFilter: true,
    matches: (c) => c.riskReward >= 3.0,
    boostFactor: 0,
    promptHint: "User requires minimum 3:1 risk/reward — only high-conviction wide-target setups",
  },
];

// ─── Registry + exports ───────────────────────────────────────────────────────

export const FILTER_REGISTRY: Record<string, FilterDefinition> = Object.fromEntries(
  FILTER_LIST.map((f) => [f.id, f]),
);

export function getFiltersByCategory(cat: FilterDefinition["category"]): FilterDefinition[] {
  return FILTER_LIST.filter((f) => f.category === cat);
}

// ─── Rule Builder ─────────────────────────────────────────────────────────────

export class ScreenerRuleBuilder {
  private active: FilterDefinition[];

  constructor(config: UserScreenerConfig) {
    this.active = config.activeFilters
      .map((id) => FILTER_REGISTRY[id])
      .filter(Boolean);
  }

  hasAnyFilters(): boolean {
    return this.active.length > 0;
  }

  /**
   * Apply hard filters.
   * - Pattern filters: OR logic (match ANY selected pattern)
   * - Other hard filters: AND logic (ALL must match)
   */
  applyFilters(candidates: ScreenerCandidate[]): ScreenerCandidate[] {
    const patternFilters = this.active.filter((f) => f.isHardFilter && f.category === "pattern");
    const otherHard = this.active.filter((f) => f.isHardFilter && f.category !== "pattern");

    return candidates.filter((c) => {
      if (patternFilters.length > 0 && !patternFilters.some((f) => f.matches(c))) return false;
      if (!otherHard.every((f) => f.matches(c))) return false;
      return true;
    });
  }

  /**
   * Apply soft score boosts.
   * adjustedScore = baseScore * min(2, 1 + Σ boostFactor for each matching soft filter)
   */
  applyBoosts(candidates: ScreenerCandidate[]): ScreenerCandidate[] {
    const soft = this.active.filter((f) => !f.isHardFilter);
    if (soft.length === 0) return candidates;

    return candidates.map((c) => {
      const totalBoost = soft.reduce((sum, f) => sum + (f.matches(c) ? f.boostFactor : 0), 0);
      return { ...c, score: c.score * Math.min(2, 1 + totalBoost) };
    });
  }

  /**
   * Build the addendum appended to the Gemini prompt.
   * Returns empty string when no filters are active.
   */
  buildPromptAddendum(): string {
    if (this.active.length === 0) return "";
    const hints = this.active.map((f) => `- ${f.promptHint}`).join("\n");
    return `\n\nUSER PREFERENCES (give these extra weight when ranking):\n${hints}\nAmong candidates that passed all filters, prefer those most strongly aligned with the above.`;
  }
}
