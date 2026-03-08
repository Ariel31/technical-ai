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
  | "downtrend_line";

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

export interface AnalyzeRequest {
  ticker: string;
  bars: OHLCVBar[];
  indicators?: string[];
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
