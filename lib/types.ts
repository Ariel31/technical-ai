// ─── OHLCV Data ────────────────────────────────────────────────────────────────

export interface OHLCVBar {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── Pattern Types ─────────────────────────────────────────────────────────────

export type PatternType =
  | "head_and_shoulders"
  | "inverse_head_and_shoulders"
  | "double_top"
  | "double_bottom"
  | "triple_top"
  | "triple_bottom"
  | "falling_wedge"
  | "rising_wedge"
  | "bull_flag"
  | "bear_flag"
  | "ascending_channel"
  | "descending_channel"
  | "horizontal_channel"
  | "support"
  | "resistance"
  | "bullish_reversal"
  | "bearish_reversal"
  | "cup_and_handle"
  | "uptrend_line"
  | "downtrend_line"
  | "gap_up"
  | "gap_down";

export type PatternSentiment = "bullish" | "bearish" | "neutral";
export type PatternReliability = "high" | "medium" | "low";

// A single price level line (support, resistance, trendline)
export interface PriceLine {
  price: number;
  label?: string;
  color: string;
  style: "solid" | "dashed" | "dotted";
}

// A price area / zone (e.g. support zone)
export interface PriceZone {
  priceTop: number;
  priceBottom: number;
  color: string;     // rgba color with alpha
  label?: string;
}

// A polygon / shape drawn on the chart (for flags, wedges, H&S, etc.)
export interface ChartPolygon {
  points: Array<{ time: number; price: number }>;
  color: string;     // rgba fill
  borderColor: string;
  label?: string;
}

// A smooth curved overlay rendered via Catmull-Rom spline (double top/bottom, H&S, cup, etc.)
export interface ChartCurve {
  points: Array<{
    time: number;
    price: number;
    dot?: boolean; // draw a filled circle at this point (peaks, troughs)
  }>;
  color: string;
  lineWidth?: 1 | 2 | 3 | 4;
  label?: string;
  // When set, fills the area between the curve and this horizontal price level
  fill?: { basePrice: number; color: string };
}

// A marker on a specific candle
export interface ChartMarker {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text?: string;
}

export interface TechnicalPattern {
  id: string;
  type: PatternType;
  label: string;
  sentiment: PatternSentiment;
  reliability: PatternReliability;
  description: string;
  // Confidence score 0–100 (e.g. 85 = 85% confident)
  confidenceScore?: number;
  // Date range over which the pattern spans
  startTime: number;
  endTime: number;
  // Price target (projected move)
  priceTarget?: number;
  // Stop-loss suggestion
  stopLoss?: number;
  // Visual overlays for this pattern
  lines: PriceLine[];
  zones: PriceZone[];
  polygons: ChartPolygon[];
  markers: ChartMarker[];
  curves?: ChartCurve[];  // smooth curved shape (optional — omit for straight-line patterns)
}

// ─── Entry Signal ──────────────────────────────────────────────────────────────

export interface EntrySignal {
  hasEntry: boolean;
  direction: "long" | "short";
  entryPrice: number;
  stopLoss: number;
  target: number;
  riskRewardRatio: number; // e.g. 2.5 means risking 1 to make 2.5
  rationale: string;       // one-sentence explanation
}

// ─── Analysis Response ─────────────────────────────────────────────────────────

export interface AnalysisResult {
  ticker: string;
  analyzedAt: string;
  timeframe: string;
  overallBias: PatternSentiment;
  summary: string;
  patterns: TechnicalPattern[];
  keyLevels: {
    supports: number[];
    resistances: number[];
  };
  entrySignal?: EntrySignal;
}

// ─── Setup Versions ────────────────────────────────────────────────────────────

export interface SetupVersion {
  id: string;
  setupId: string;
  versionNumber: number;
  source: "ai" | "user_refinement";
  createdAt: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  rrRatio: number;
  changedFields: string[] | null;
  changeSummary: string | null;
  technicalWarning: string | null;
  userInputText: string | null;
  isCommitted: boolean;
  belowMinimumRr: boolean;
  disagreed?: boolean;
}

// ─── API Payloads ──────────────────────────────────────────────────────────────

export interface StockDataResponse {
  ticker: string;
  bars: OHLCVBar[];
  meta: {
    name: string;
    currency: string;
    exchange: string;
  };
}

export interface ScreenerContext {
  direction: "long" | "short";
  pattern: string;
  entry: number;
  stopLoss: number;
  target: number;
  confidence: number;
}

export interface ExistingSetup {
  entryPrice: number;
  stopLoss: number;
  target: number;
  direction: "long" | "short";
}

export interface AnalyzeRequest {
  ticker: string;
  bars: OHLCVBar[];
  indicators?: string[];
  /** When set, the chart analysis is anchored to a screener pick for consistency */
  screenerContext?: ScreenerContext;
  /** When set, Gemini validates this locked-in setup rather than generating new levels */
  existingSetup?: ExistingSetup;
}

export interface ApiError {
  error: string;
  code?: string;
}

// ─── UI State ──────────────────────────────────────────────────────────────────

export type AppStatus =
  | "idle"
  | "fetching_data"
  | "analyzing"
  | "done"
  | "error";

// ─── Screener Types ────────────────────────────────────────────────────────────

export type MarketTrend = "uptrend" | "downtrend" | "sideways";

export interface MarketRegime {
  spyPrice: number;
  spySma200: number;
  aboveSma200: boolean;
  trend: MarketTrend;
  return60d: number;   // SPY 60-day % return (RS benchmark)
  note: string;        // human-readable summary
}

export type ScreenerPattern =
  | "cup_and_handle"
  | "double_bottom"
  | "bull_flag"
  | "consolidation_breakout"
  | "sma_bounce"
  | "momentum_continuation"
  | "falling_wedge"
  | "inverse_head_and_shoulders"
  | "none";

export interface ScreenerCandidate {
  // Identity
  ticker: string;
  name: string;
  price: number;

  // Moving averages
  sma20: number;
  sma50: number;
  sma150: number;
  sma200: number;
  aboveSma20: boolean;
  aboveSma50: boolean;
  aboveSma150: boolean;
  aboveSma200: boolean;

  // Exponential moving averages
  ema20: number;
  ema50: number;

  // 52-week range (for Fibonacci levels)
  high52w: number;
  low52w:  number;

  // Momentum
  change5d: number;
  change20d: number;
  change60d: number;
  relativeStrength: number;     // change60d - spyReturn60d

  // Oscillator + volatility
  rsi14: number;
  atr14: number;
  atr14Pct: number;             // atr14 / price * 100

  // Volume
  volumeRatio: number;          // latest vol / 50-day avg

  // Range / contraction
  range10d: number;             // (high10d - low10d) / price * 100
  isContracting: boolean;

  // Pattern
  pattern: ScreenerPattern;
  breakoutLevel: number;
  breakoutDistance: number;     // % from price to breakoutLevel
  consolidationDays: number;

  // Trade setup (pre-calculated)
  entry: number;
  stopLevel: number;            // entry - 1.5 * atr14
  targetLevel: number;          // entry + 3 * (entry - stopLevel)
  riskReward: number;

  // Score components (0-100 each)
  breakoutStrength: number;
  volumeExpansion: number;
  trendAlignment: number;
  volatilityContraction: number;
  rsRank: number;               // 0-100 percentile, filled by assignRSRanks()

  // Pipeline scores (new architecture)
  setupScore: number;
  opportunityScore: number;

  // Final weighted score (= finalScore from pipeline)
  score: number;
}

export interface MiniBar {
  t: number;  // Unix timestamp (seconds)
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface ScreenerPick {
  ticker: string;
  companyName: string;
  direction: "long" | "short";
  confidence: number;       // 0-100
  currentPrice: number;
  entry: number;
  target: number;
  stopLoss: number;
  potentialReturn: number;  // % from entry to target
  riskReward: number;       // e.g. 2.3 means risk 1 to make 2.3
  primaryPattern: string;   // e.g. "Bull Flag", "SMA50 Breakout"
  triggers: string[];       // AI-generated signals (e.g. ["RSI 58", "Volume 1.9x avg"])
  signals: string[];        // Algorithmic signals (e.g. ["Strong uptrend", "Tight consolidation"])
  reasoning: string;
  setupScore: number;       // 0-100 pipeline SetupScore
  opportunityScore: number; // 0-100 pipeline OpportunityScore
  bars?: MiniBar[];         // Last 90 OHLCV bars for the mini chart
  breakoutLevel?: number;   // Algorithmic breakout level
  patternKey?: string;      // Raw ScreenerPattern key (e.g. "bull_flag") for mini chart drawings
}

export interface CandidateSummary {
  ticker: string;
  name: string;
  price: number;
  pattern: ScreenerPattern;
  primaryPattern: string;
  score: number;
  setupScore: number;
  opportunityScore: number;
  rsi14: number;
  volumeRatio: number;
  riskReward: number;
  breakoutDistance: number;
  potentialReturn: number;
  rsRank: number;
  relativeStrength: number;
  change5d: number;
  change20d: number;
  isContracting: boolean;
  aboveSma50: boolean;
  aboveSma200: boolean;
}

export interface ScreenerResult {
  screenedAt: string;
  totalScanned: number;
  filteredCount: number;
  picks: ScreenerPick[];
  allCandidates?: CandidateSummary[];
  sentiment?: MarketSentiment;
  hotSector?: HotSectorResult;
}

export type ScreenerStatus = "idle" | "scanning" | "analyzing" | "done" | "error";

// ─── Market Sentiment ───────────────────────────────────────────────────────────

export type SentimentLabel = "Bearish" | "Neutral" | "Bullish";

export interface MarketSentiment {
  label: SentimentLabel;
  score: number;          // -3 to +3
  spySignal: number;      // -1 | 0 | +1
  vixSignal: number;      // -1 | 0 | +1
  adSignal: number;       // -1 | 0 | +1
  vix: number;
  adRatio: number;        // advancing / declining
  spyVs200ma: "above" | "below" | "near";
}

// ─── Hot Sector Types ───────────────────────────────────────────────────────────

export interface SectorData {
  name: string;       // e.g. "Energy"
  etf: string;        // e.g. "XLE"
  rs5d: number;       // sector_return_5d - spy_return_5d
  rs20d: number;      // sector_return_20d - spy_return_20d
  rsScore: number;    // (rs5d * 0.6) + (rs20d * 0.4)
  breadthScore: number; // -1 | 0 | +1 | +2
  volumeScore: number;  // -1 | 0 | +1 | +2
  sectorScore: number;  // (rsScore * 5) + breadthScore + volumeScore
  breadthPct: number;   // % of sector stocks above 50MA
  volumeRatio: number;  // etf_volume_today / etf_20d_avg_volume
  etfReturn5d: number;  // raw ETF 5d return (for display)
}

export interface HotSectorSetup {
  ticker: string;
  primaryPattern: string;
  score: number;        // combined setupScore + opportunityScore
  setupScore: number;
  opportunityScore: number;
}

export interface HotSectorResult {
  primary: SectorData;
  secondary?: SectorData;   // only if within 10% of primary score
  setups: HotSectorSetup[]; // top 3 from screener matching primary sector
  secondarySetups?: HotSectorSetup[]; // top 3 from secondary sector
  noLeader: boolean;        // true if no sector has positive rs5d
}

// ─── Setup Tracking Types ───────────────────────────────────────────────────────

export type SetupStatus = "WATCHING" | "PENDING" | "ACTIVE" | "TARGET_HIT" | "STOP_HIT" | "EXPIRED" | "VOIDED";
export type ValidityState = "Active" | "Weakened" | "Invalidated";

export interface TrackedSetup {
  id: string;
  ticker: string;
  companyName: string | null;
  pattern: string;
  confidence: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  createdAt: string;
  status: SetupStatus;
  entryTriggeredAt: string | null;
  closedAt: string | null;
  result: "WIN" | "LOSS" | "VOIDED" | null;
  returnPercent: number | null;
  scanSource: string;
  setupScore: number | null;
  opportunityScore: number | null;
  reasoning: string | null;
  direction: "long" | "short";
  fittedPrice: number | null;
  patternInvalidationLevel: number | null;
  keyLevels: { supports: number[]; resistances: number[] } | null;
  validityState: ValidityState;
  aiValidationNote: string | null;
  lastCheckedAt: string | null;
}

export interface TrackRecordStats {
  totalSetups: number;
  wins: number;
  losses: number;
  winRate: number;       // 0-100
  avgReturn: number;     // % across all closed trades
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  activeCount: number;   // PENDING + ACTIVE
  voided: number;
}

// ─── Watchlist Types ────────────────────────────────────────────────────────────

export interface WatchlistItem {
  ticker: string;
  name: string;
  status: "pending" | "analyzing" | "done" | "error";
  addedAt: number;       // Date.now()
  errorMessage?: string;
  entrySignal?: {
    direction: "long" | "short";
    entryPrice: number;
    stopLoss: number;
    target: number;
    riskRewardRatio: number;
  };
}

export interface CachedAnalysis {
  ticker: string;
  timeframe: string;
  analyzedAt: string;
  bars: OHLCVBar[];
  result: AnalysisResult;
  meta: { name: string; currency: string; exchange: string };
}

// ─── Momentum Strategy Types ────────────────────────────────────────────────────

export interface MomentumPosition {
  entry_date: string;       // YYYY-MM-DD
  entry_price: number;
  shares: number;
  cost_basis: number;
  name?: string;            // company name, filled on fetch
}

export interface MomentumPortfolioState {
  started: string;                              // YYYY-MM-DD
  initial_capital: number;
  last_rebalance: string;                       // YYYY-MM-DD
  cash: number;
  spy_price_at_start: number;
  positions: Record<string, MomentumPosition>; // keyed by ticker
}

export interface MomentumPick {
  ticker: string;
  name: string;
  momentum: number;         // 12-1 return as decimal (0.45 = 45%)
  currentPrice: number;
  priceT252: number;        // close ~252 trading days ago
  priceT21: number;         // close ~21 trading days ago
  rank: number;             // 1 = highest momentum
}

export interface MomentumTrade {
  id: string;
  date: string;             // YYYY-MM-DD
  ticker: string;
  action: 'BUY' | 'SELL';
  price: number;
  shares: number;
  cost_basis: number;
  proceeds?: number;
  pnl?: number;
  pnl_pct?: number;
  entry_date?: string;
  exit_reason?: 'rebalance' | 'stop_loss';
}

export interface RebalanceDiff {
  to_sell: string[];
  to_buy: string[];
  to_hold: string[];
  picks: MomentumPick[];
}

export interface MomentumPositionLive extends MomentumPosition {
  ticker: string;
  name: string;
  current_price: number;
  market_value: number;
  pnl: number;
  pnl_pct: number;
  weight_pct: number;       // % of total portfolio
  stop_price: number;       // entry_price * 0.80
  stop_triggered: boolean;
}
