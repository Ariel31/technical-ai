import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerationConfig,
  type Schema,
} from "@google/generative-ai";
import { AI_MODELS } from "./ai-config";
import type {
  AnalyzeRequest,
  AnalysisResult,
  TechnicalPattern,
  OHLCVBar,
  ChartCurve,
  ScreenerContext,
} from "./types";
import { PATTERN_COLORS } from "./utils";

// NOTE: instantiated per-call (not at module level) so env var changes are always picked up

// ─── Response Schema ────────────────────────────────────────────────────────────

// The Gemini SDK's EnumStringSchema type unnecessarily requires `format` — cast at use site.
const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    overallBias: {
      type: SchemaType.STRING,
      enum: ["bullish", "bearish", "neutral"],
      description: "Overall market bias for this ticker",
    },
    summary: {
      type: SchemaType.STRING,
      description:
        "Concise narrative summary of the technical picture (2-4 sentences)",
    },
    keyLevels: {
      type: SchemaType.OBJECT,
      properties: {
        supports: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER },
          description: "Key support price levels",
        },
        resistances: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.NUMBER },
          description: "Key resistance price levels",
        },
      },
      required: ["supports", "resistances"],
    },
    patterns: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: {
            type: SchemaType.STRING,
            enum: [
              "head_and_shoulders",
              "inverse_head_and_shoulders",
              "double_top",
              "double_bottom",
              "triple_top",
              "triple_bottom",
              "falling_wedge",
              "rising_wedge",
              "bull_flag",
              "bear_flag",
              "ascending_channel",
              "descending_channel",
              "horizontal_channel",
              "support",
              "resistance",
              "bullish_reversal",
              "bearish_reversal",
              "cup_and_handle",
              "uptrend_line",
              "downtrend_line",
              "gap_up",
              "gap_down",
            ],
          },
          label: { type: SchemaType.STRING },
          sentiment: {
            type: SchemaType.STRING,
            enum: ["bullish", "bearish", "neutral"],
          },
          reliability: {
            type: SchemaType.STRING,
            enum: ["high", "medium", "low"],
          },
          description: { type: SchemaType.STRING },
          confidenceScore: {
            type: SchemaType.NUMBER,
            description: "Detection confidence as a percentage 0–100. Reflect how textbook-clean the pattern is, volume confirmation, timeframe quality, and number of touches.",
          },
          startTime: {
            type: SchemaType.NUMBER,
            description: "Unix timestamp (seconds) where pattern begins",
          },
          endTime: {
            type: SchemaType.NUMBER,
            description: "Unix timestamp (seconds) where pattern ends",
          },
          priceTarget: {
            type: SchemaType.NUMBER,
            description: "Projected price target",
          },
          stopLoss: {
            type: SchemaType.NUMBER,
            description: "Suggested stop-loss level",
          },
          lines: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                price: { type: SchemaType.NUMBER },
                label: { type: SchemaType.STRING },
                color: { type: SchemaType.STRING },
                style: {
                  type: SchemaType.STRING,
                  enum: ["solid", "dashed", "dotted"],
                },
              },
              required: ["price", "color", "style"],
            },
          },
          zones: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                priceTop: { type: SchemaType.NUMBER },
                priceBottom: { type: SchemaType.NUMBER },
                color: { type: SchemaType.STRING },
                label: { type: SchemaType.STRING },
              },
              required: ["priceTop", "priceBottom", "color"],
            },
          },
          polygons: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                points: {
                  type: SchemaType.ARRAY,
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      time: { type: SchemaType.NUMBER },
                      price: { type: SchemaType.NUMBER },
                    },
                    required: ["time", "price"],
                  },
                },
                color: { type: SchemaType.STRING },
                borderColor: { type: SchemaType.STRING },
                label: { type: SchemaType.STRING },
              },
              required: ["points", "color", "borderColor"],
            },
          },
          markers: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                time: { type: SchemaType.NUMBER },
                position: {
                  type: SchemaType.STRING,
                  enum: ["aboveBar", "belowBar"],
                },
                color: { type: SchemaType.STRING },
                shape: {
                  type: SchemaType.STRING,
                  enum: ["arrowUp", "arrowDown", "circle", "square"],
                },
                text: { type: SchemaType.STRING },
              },
              required: ["time", "position", "color", "shape"],
            },
          },
        },
        required: [
          "type",
          "label",
          "sentiment",
          "reliability",
          "description",
          "startTime",
          "endTime",
          "lines",
          "zones",
          "polygons",
          "markers",
        ],
      },
    },
    entrySignal: {
      type: SchemaType.OBJECT,
      description: "Best trade setup based on all identified patterns. Omit if no clear entry exists.",
      properties: {
        hasEntry:        { type: SchemaType.BOOLEAN, description: "True only if a clear swing trade setup exists with R/R >= 2.0 and a well-defined stop-loss. False if R/R is below 2.0 or setup is unclear." },
        direction:       { type: SchemaType.STRING, enum: ["long", "short"] },
        entryPrice:      { type: SchemaType.NUMBER, description: "Ideal entry price (limit or stop-limit)" },
        stopLoss:        { type: SchemaType.NUMBER, description: "Stop-loss price" },
        target:          { type: SchemaType.NUMBER, description: "First price target" },
        riskRewardRatio: { type: SchemaType.NUMBER, description: "Reward divided by risk — must be 2.0 or higher to qualify as a valid entry (e.g. 2.5 means risk 1 to make 2.5)" },
        rationale:       { type: SchemaType.STRING, description: "One sentence explaining the setup" },
      },
      required: ["hasEntry", "direction", "entryPrice", "stopLoss", "target", "riskRewardRatio", "rationale"],
    },
  },
  required: ["overallBias", "summary", "keyLevels", "patterns", "entrySignal"],
};

const generationConfig: GenerationConfig = {
  temperature: 0.2,
  topK: 40,
  topP: 0.95,
  maxOutputTokens: 65536,
  responseMimeType: "application/json",
  responseSchema: responseSchema as unknown as Schema,
};

// ─── Prompt Builder ─────────────────────────────────────────────────────────────

function buildPrompt(
  ticker: string,
  bars: OHLCVBar[],
  indicators: string[],
  screenerContext?: ScreenerContext
): string {
  // Limit to 100 bars to stay well within free-tier token limits
  const recentBars = bars.slice(-100);
  const latestBar = recentBars[recentBars.length - 1];
  const firstBar = recentBars[0];

  // 2 decimal places + volume in thousands = ~50% fewer tokens vs 4 dp + full volume
  const barsCsv = [
    "t,o,h,l,c,v",
    ...recentBars.map(
      (b) =>
        `${b.time},${b.open.toFixed(2)},${b.high.toFixed(2)},${b.low.toFixed(
          2
        )},${b.close.toFixed(2)},${Math.round(b.volume / 1000)}`
    ),
  ].join("\n");

  const bullishColor = PATTERN_COLORS.bullish.line;
  const bearishColor = PATTERN_COLORS.bearish.line;
  const neutralColor = PATTERN_COLORS.neutral.line;
  const bullishFill = PATTERN_COLORS.bullish.fill;
  const bearishFill = PATTERN_COLORS.bearish.fill;
  const neutralFill = PATTERN_COLORS.neutral.fill;

  const indicatorsSection =
    indicators.length > 0
      ? `\nUser-selected indicators to factor in: ${indicators.join(", ")}\n`
      : "";

  const screenerSection = screenerContext
    ? `\nSCREENER CONTEXT: The algorithmic screener identified this as a ${screenerContext.direction.toUpperCase()} setup — pattern: ${screenerContext.pattern}, confidence ${screenerContext.confidence}%, entry $${screenerContext.entry}, stop $${screenerContext.stopLoss}, target $${screenerContext.target}. Your deep analysis should confirm or refine this. If the pattern is still valid, your entrySignal direction MUST match (${screenerContext.direction}). Only override the direction if you find clear evidence that the setup has materially changed since the scan.\n`
    : "";

  return `Expert technical analyst. Analyze ${ticker} OHLCV data and identify chart patterns.${indicatorsSection}${screenerSection}

Columns: t=Unix timestamp(s), o=open, h=high, l=low, c=close, v=volume(k)
Range: ${new Date(firstBar.time * 1000).toDateString()} → ${new Date(
    latestBar.time * 1000
  ).toDateString()} | Latest close: ${latestBar.close.toFixed(2)}

${barsCsv}

TASK: Find 3-8 significant patterns including trend lines. For each provide:
- lines: horizontal levels (support/resistance/necklines) with color+style
- polygons: straight trendlines — EXACTLY 2 points each (start anchor + end anchor). Each line of a channel = one polygon with 2 points. Do NOT add intermediate points; the renderer draws a straight line between the two anchors automatically.
- zones: price areas with priceTop+priceBottom
- markers: key candle annotations
- confidenceScore: integer 0–100 reflecting how textbook-clean the pattern is, volume confirmation, number of touches, and timeframe quality

TREND LINES: Always look for and include the most dominant trend lines in the data:
PROCEDURE for each trend line — follow these steps exactly:
  Step 1. Find the earliest significant swing point (low for uptrend, high for downtrend) — this is point 1.
  Step 2. Draw a provisional line from point 1 through the next qualifying swing point.
  Step 3. Scan EVERY remaining bar to the right: check if each subsequent swing point lies within 0.5% of the extrapolated line. Every bar that qualifies extends the "last confirmed touch" forward.
  Step 4. Continue scanning until you reach the end of the data OR until price clearly breaks through the line (close beyond the line by >1%). The LAST qualifying swing point before that break is point 2.
  Step 5. Set the polygon to EXACTLY 2 points: [{ time: point1_timestamp, price: point1_exact_price }, { time: point2_timestamp, price: point2_exact_price }]
    - For uptrend_line: price MUST be the exact "l" (low) value of that bar from the CSV above
    - For downtrend_line: price MUST be the exact "h" (high) value of that bar from the CSV above
    - Copy the price verbatim from the data — do NOT round, estimate, or interpolate
    - The renderer draws a straight line between these 2 points with no modification

- uptrend_line: diagonal support line. Use the procedure above with swing lows.
- downtrend_line: diagonal resistance line. Use the procedure above with swing highs.
- DOMINANT TREND FIRST: A trend line spanning 60-100% of the dataset with 3+ touches is always more significant than a short 2-touch line covering only a recent portion.
- If price has already broken out, the second anchor is the last valid touch before the breakout. The breakout will be visually obvious because the candle exceeds the drawn line.
- Include only if there are at least 2 clear touch points with confirmation.

TRENDLINE SENTIMENT — this is critical, follow exactly:
- downtrend_line INTACT (price is still below or touching the line at the latest bar): sentiment="bearish". Place an arrowDown marker at the most recent rejection candle.
- downtrend_line BROKEN (a recent candle closed clearly above the line): sentiment="bullish". The breakout of a downtrend is a BULLISH REVERSAL signal. Place an arrowUp marker at the breakout candle.
- uptrend_line INTACT (price is still above or touching the line at the latest bar): sentiment="bullish". Place an arrowUp marker at the most recent bounce candle.
- uptrend_line BROKEN (a recent candle closed clearly below the line): sentiment="bearish". The breakdown of an uptrend is a BEARISH REVERSAL signal. Place an arrowDown marker at the breakdown candle.

GAP DETECTION — scan every consecutive pair of bars for price gaps:
Definition:
- gap_up: current bar's low > previous bar's high (price jumped up, leaving an open zone below)
- gap_down: current bar's high < previous bar's low (price dropped down, leaving an open zone above)
Only report OPEN (unfilled) gaps — a gap is filled when any subsequent bar's range overlaps the gap zone. Limit to the 3 most significant open gaps from the last 60 bars. Skip tiny gaps (<0.3% of price).
For each open gap:
- zones: ONE zone entry — priceTop and priceBottom define the unfilled region:
    gap_up:   priceTop = gap bar's low,  priceBottom = previous bar's high
    gap_down: priceTop = previous bar's low, priceBottom = gap bar's high
    Use the corresponding fill color (bearish fill for gap_up, bullish fill for gap_down).
- markers: ONE arrowDown above the gap bar for gap_up; ONE arrowUp below for gap_down.
- startTime / endTime: both set to the timestamp of the gap bar.
SENTIMENT RULES:
- gap_up default: sentiment="bearish" — statistically ~80% of gaps fill, so upward gaps act as magnets pulling price back down. label="Gap Up (unfilled)".
    EXCEPTION: if gap_up occurred on volume >2× the 20-bar average AND broke out of a multi-week consolidation range, classify sentiment="bullish" (breakaway gap). label="Breakaway Gap Up".
- gap_down default: sentiment="bullish" — the open zone below acts as a price magnet. label="Gap Down (unfilled)".
    EXCEPTION: if gap_down broke a major support level on high volume (distributional breakdown), classify sentiment="bearish". label="Breakdown Gap Down".
- The gap description must state: whether it is filled or open, the size as a %, and the expected fill implication.

OVERALL BIAS — weight by recency and significance:
- A trendline breakout is the most recent and most significant event — it overrides the prior trend direction.
- If a downtrend has been broken to the upside, overallBias should be "bullish" unless other patterns strongly contradict it.
- If an uptrend has been broken to the downside, overallBias should be "bearish" unless other patterns strongly contradict it.
- The summary must explicitly mention the breakout and its bullish/bearish implication.

Colors: bullish="${bullishColor}", bearish="${bearishColor}", neutral="${neutralColor}"
Fill: bullish="${bullishFill}", bearish="${bearishFill}", neutral="${neutralFill}"
Support lines: color="${bullishColor}" style=dashed | Resistance: color="${bearishColor}" style=dashed

RULES: All timestamps must be from the data above. Prices must match data range. Only flag genuine patterns.

entrySignal: Based on ALL patterns combined, identify the single best SWING TRADE setup available RIGHT NOW (medium to long timeframe — targeting moves that play out over days to weeks, not intraday). Set hasEntry=true ONLY if ALL of the following conditions are met: (1) there is a clear, confluent pattern with defined risk, (2) the risk/reward ratio is AT LEAST 2:1 (riskRewardRatio >= 2.0), and (3) there is a logical, well-defined stop-loss level. Calculate riskRewardRatio = (target - entryPrice) / (entryPrice - stopLoss) for longs, or (entryPrice - target) / (stopLoss - entryPrice) for shorts. If the best available setup has R/R below 2.0, set hasEntry=false — do not force a low-quality entry. If no clean setup exists, set hasEntry=false but still populate the other fields with the most likely swing trade scenario if one materializes.

IMPORTANT: Respond with ONLY a raw JSON object. No markdown, no code fences, no explanation — just the JSON.`;
}

// ─── Mock Analyzer (MOCK_AI=true in .env.local) ──────────────────────────────

/** Find the bar with the lowest low in a slice of bars */
function swingLow(slice: OHLCVBar[]): OHLCVBar {
  return slice.reduce((a, b) => (b.low < a.low ? b : a));
}
/** Find the bar with the highest high in a slice of bars */
function swingHigh(slice: OHLCVBar[]): OHLCVBar {
  return slice.reduce((a, b) => (b.high > a.high ? b : a));
}

function buildMockAnalysis(ticker: string, bars: OHLCVBar[]): AnalysisResult {
  const len = bars.length;
  const last = bars[len - 1];

  // Split data into four quarters for swing point detection
  const q1Bars = bars.slice(0, Math.floor(len * 0.25));
  const q2Bars = bars.slice(Math.floor(len * 0.25), Math.floor(len * 0.5));
  const q3Bars = bars.slice(Math.floor(len * 0.5), Math.floor(len * 0.75));
  const q4Bars = bars.slice(Math.floor(len * 0.75));

  // Real swing points — these snap directly to actual candle prices
  const earlyLow = swingLow(q1Bars);
  const midLow = swingLow(q2Bars);
  const lateLow = swingLow(q3Bars);
  const earlyHigh = swingHigh(q2Bars);
  const lateHigh = swingHigh(q3Bars);
  const recentHigh = swingHigh(q4Bars);

  // Support: average of the two lowest swing lows
  const lowestLows = [earlyLow, midLow, lateLow].sort((a, b) => a.low - b.low);
  const support1 = +((lowestLows[0].low + lowestLows[1].low) / 2).toFixed(2);
  const support2 = +lowestLows[1].low.toFixed(2);

  // Resistance: average of the two highest swing highs
  const highestHighs = [earlyHigh, lateHigh, recentHigh].sort(
    (a, b) => b.high - a.high
  );
  const resist1 = +((highestHighs[0].high + highestHighs[1].high) / 2).toFixed(
    2
  );
  const resist2 = +highestHighs[1].high.toFixed(2);

  const prices = bars.map((b) => b.close);
  const avgPrice = +(prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(
    2
  );

  const bc = PATTERN_COLORS.bullish;
  const brc = PATTERN_COLORS.bearish;
  const nc = PATTERN_COLORS.neutral;

  // ── Time helpers ─────────────────────────────────────────────────────────
  /** Arithmetic midpoint timestamp between two bars */
  const midTime = (b1: OHLCVBar, b2: OHLCVBar) =>
    Math.round((b1.time + b2.time) / 2);
  /** Bar at a fractional position in the full dataset */
  const barAt = (frac: number) =>
    bars[Math.max(0, Math.min(len - 1, Math.floor(len * frac)))];

  // Neckline / mid-recovery price level (between lows and highs)
  const neckline = +((lowestLows[1].low + highestHighs[1].high) / 2).toFixed(2);

  const patterns: TechnicalPattern[] = [
    // ── 1. Support & Resistance ──────────────────────────────────────────────
    {
      id: `support-0-mock`,
      type: "support",
      label: "Key Support Zone",
      sentiment: "bullish",
      reliability: "high",
      confidenceScore: 82,
      description: `Strong support cluster around ${support1} — price has bounced from this level multiple times. A break below would be significant.`,
      startTime: bars[0].time,
      endTime: last.time,
      lines: [
        { price: support1, label: "Support", color: bc.line, style: "dashed" },
      ],
      zones: [
        {
          priceTop: support2,
          priceBottom: support1,
          color: bc.fill,
          label: "Support Zone",
        },
      ],
      polygons: [],
      markers: [
        {
          time: earlyLow.time,
          position: "belowBar",
          color: bc.marker,
          shape: "arrowUp",
          text: "S",
        },
      ],
    },
    {
      id: `resistance-1-mock`,
      type: "resistance",
      label: "Resistance Level",
      sentiment: "bearish",
      reliability: "high",
      confidenceScore: 78,
      description: `Price has struggled to close above ${resist1} — this level has acted as a ceiling. A breakout above would signal bullish continuation.`,
      startTime: bars[0].time,
      endTime: last.time,
      lines: [
        {
          price: resist1,
          label: "Resistance",
          color: brc.line,
          style: "dashed",
        },
        { price: resist2, label: "", color: brc.line, style: "dotted" },
      ],
      zones: [
        {
          priceTop: resist1,
          priceBottom: resist2,
          color: brc.fill,
          label: "Resistance Zone",
        },
      ],
      polygons: [],
      markers: [
        {
          time: lateHigh.time,
          position: "aboveBar",
          color: brc.marker,
          shape: "arrowDown",
          text: "R",
        },
      ],
    },

    // ── 2. Double Bottom (W) ─────────────────────────────────────────────────
    {
      id: `double_bottom-2-mock`,
      type: "double_bottom",
      label: "Double Bottom (W)",
      sentiment: "bullish",
      reliability: "medium",
      confidenceScore: 64,
      description: `Two consecutive lows near ${support1} form a W-shape. Neckline at ${neckline}. A close above the neckline confirms the pattern with a target near ${resist2}.`,
      startTime: barAt(0.03).time,
      endTime: earlyHigh.time,
      priceTarget: resist2,
      stopLoss: +lowestLows[0].low.toFixed(2),
      lines: [
        { price: neckline, label: "Neckline", color: nc.line, style: "dashed" },
      ],
      zones: [],
      polygons: [],
      curves: [
        {
          points: [
            { time: barAt(0.03).time,          price: neckline },
            { time: earlyLow.time,             price: earlyLow.low,                    dot: true },
            { time: midTime(earlyLow, midLow), price: neckline },
            { time: midLow.time,               price: midLow.low,                      dot: true },
            { time: earlyHigh.time,            price: +(neckline * 1.015).toFixed(2),  dot: true },
          ],
          color: bc.line,
          lineWidth: 2,
          fill: { basePrice: neckline, color: "rgba(34,197,94,0.12)" },
        } satisfies ChartCurve,
      ],
      markers: [
        {
          time: earlyLow.time,
          position: "belowBar",
          color: bc.marker,
          shape: "circle",
          text: "B1",
        },
        {
          time: midLow.time,
          position: "belowBar",
          color: bc.marker,
          shape: "circle",
          text: "B2",
        },
        {
          time: earlyHigh.time,
          position: "aboveBar",
          color: bc.marker,
          shape: "arrowUp",
          text: "↑",
        },
      ],
    },

    // ── 3. Double Top (M) ────────────────────────────────────────────────────
    {
      id: `double_top-3-mock`,
      type: "double_top",
      label: "Double Top (M)",
      sentiment: "bearish",
      reliability: "medium",
      confidenceScore: 61,
      description: `Two peaks near ${resist1} form an M-shape. Neckline at ${neckline}. A close below the neckline confirms breakdown toward ${support2}.`,
      startTime: midLow.time,
      endTime: barAt(0.78).time,
      priceTarget: support2,
      stopLoss: +highestHighs[0].high.toFixed(2),
      lines: [
        { price: neckline, label: "Neckline", color: nc.line, style: "dashed" },
      ],
      zones: [],
      polygons: [],
      curves: [
        {
          points: [
            { time: midLow.time,                  price: +(neckline * 1.01).toFixed(2) },
            { time: earlyHigh.time,               price: earlyHigh.high,                     dot: true },
            { time: midTime(earlyHigh, lateHigh), price: +(neckline * 1.02).toFixed(2) },
            { time: lateHigh.time,                price: +(lateHigh.high * 0.99).toFixed(2), dot: true },
            { time: barAt(0.78).time,             price: +(neckline * 0.99).toFixed(2),      dot: true },
          ],
          color: brc.line,
          lineWidth: 2,
          fill: { basePrice: neckline, color: "rgba(239,68,68,0.12)" },
        } satisfies ChartCurve,
      ],
      markers: [
        {
          time: earlyHigh.time,
          position: "aboveBar",
          color: brc.marker,
          shape: "circle",
          text: "T1",
        },
        {
          time: lateHigh.time,
          position: "aboveBar",
          color: brc.marker,
          shape: "circle",
          text: "T2",
        },
        {
          time: barAt(0.78).time,
          position: "belowBar",
          color: brc.marker,
          shape: "arrowDown",
          text: "↓",
        },
      ],
    },

    // ── 4. Head & Shoulders ──────────────────────────────────────────────────
    {
      id: `head_and_shoulders-4-mock`,
      type: "head_and_shoulders",
      label: "Head & Shoulders",
      sentiment: "bearish",
      reliability: "high",
      confidenceScore: 88,
      description: `Classic H&S with left shoulder at ${earlyHigh.high.toFixed(
        2
      )}, head at ${lateHigh.high.toFixed(
        2
      )}, and right shoulder forming. Neckline break targets ${support2}.`,
      startTime: earlyLow.time,
      endTime: barAt(0.95).time,
      priceTarget: support2,
      stopLoss: +lateHigh.high.toFixed(2),
      lines: [
        {
          price: lateLow.low,
          label: "Neckline",
          color: nc.line,
          style: "dashed",
        },
      ],
      zones: [],
      polygons: [],
      curves: [
        {
          points: [
            { time: earlyLow.time,                price: lateLow.low },
            { time: earlyHigh.time,               price: +Math.min(earlyHigh.high, lateHigh.high * 0.93).toFixed(2), dot: true },
            { time: midTime(earlyHigh, lateHigh), price: +(lateLow.low * 1.01).toFixed(2) },
            { time: lateHigh.time,                price: lateHigh.high,                                               dot: true },
            { time: midTime(lateHigh, recentHigh), price: +(lateLow.low * 1.01).toFixed(2) },
            { time: recentHigh.time,              price: +Math.min(recentHigh.high, lateHigh.high * 0.93).toFixed(2), dot: true },
            { time: barAt(0.95).time,             price: +(lateLow.low * 0.98).toFixed(2),                            dot: true },
          ],
          color: brc.line,
          lineWidth: 2,
          fill: { basePrice: lateLow.low, color: "rgba(239,68,68,0.10)" },
        } satisfies ChartCurve,
      ],
      markers: [
        {
          time: earlyHigh.time,
          position: "aboveBar",
          color: brc.marker,
          shape: "circle",
          text: "LS",
        },
        {
          time: lateHigh.time,
          position: "aboveBar",
          color: brc.marker,
          shape: "arrowDown",
          text: "Head",
        },
        {
          time: recentHigh.time,
          position: "aboveBar",
          color: brc.marker,
          shape: "circle",
          text: "RS",
        },
      ],
    },

    // ── 5. Cup & Handle ──────────────────────────────────────────────────────
    {
      id: `cup_and_handle-5-mock`,
      type: "cup_and_handle",
      label: "Cup & Handle",
      sentiment: "bullish",
      reliability: "medium",
      confidenceScore: 57,
      description: `Rounded cup base from ${earlyHigh.high.toFixed(
        2
      )} down to ${midLow.low.toFixed(
        2
      )} with a small handle consolidation. Breakout above the cup rim targets ${resist1}.`,
      startTime: earlyLow.time,
      endTime: barAt(0.95).time,
      priceTarget: resist1,
      stopLoss: +(earlyHigh.high * 0.88).toFixed(2),
      lines: [
        {
          price: +(earlyHigh.high * 0.96).toFixed(2),
          label: "Cup Rim",
          color: bc.line,
          style: "dotted",
        },
      ],
      zones: [],
      polygons: [],
      curves: [
        // Cup (rounded U)
        {
          points: [
            { time: earlyLow.time,            price: +(earlyHigh.high * 0.96).toFixed(2),                    dot: true },
            { time: midTime(earlyLow, midLow), price: +((earlyHigh.high * 0.96 + midLow.low) / 2).toFixed(2) },
            { time: midLow.time,              price: midLow.low,                                             dot: true },
            { time: midTime(midLow, lateHigh), price: +((earlyHigh.high * 0.96 + midLow.low) / 2).toFixed(2) },
            { time: lateHigh.time,            price: +(earlyHigh.high * 0.96).toFixed(2),                    dot: true },
          ],
          color: bc.line,
          lineWidth: 2,
          fill: { basePrice: +(earlyHigh.high * 0.96).toFixed(2), color: "rgba(34,197,94,0.10)" },
        } satisfies ChartCurve,
        // Handle (small declining flag then breakout)
        {
          points: [
            { time: lateHigh.time,                price: +(earlyHigh.high * 0.96).toFixed(2) },
            { time: midTime(lateHigh, recentHigh), price: +(earlyHigh.high * 0.91).toFixed(2), dot: true },
            { time: barAt(0.95).time,             price: +(earlyHigh.high * 0.98).toFixed(2),  dot: true },
          ],
          color: bc.line,
          lineWidth: 2,
        } satisfies ChartCurve,
      ],
      markers: [
        {
          time: midLow.time,
          position: "belowBar",
          color: bc.marker,
          shape: "circle",
          text: "Cup",
        },
        {
          time: barAt(0.95).time,
          position: "aboveBar",
          color: bc.marker,
          shape: "arrowUp",
          text: "↑",
        },
      ],
    },

    // ── 6. Triple Bottom ────────────────────────────────────────────────────
    {
      id: `triple_bottom-6-mock`,
      type: "triple_bottom",
      label: "Triple Bottom",
      sentiment: "bullish",
      reliability: "high",
      confidenceScore: 91,
      description: `Three lows near ${support1} forming a strong base. Each bounce from support builds conviction for a move toward ${resist2}.`,
      startTime: barAt(0.03).time,
      endTime: barAt(0.82).time,
      priceTarget: resist2,
      stopLoss: +lowestLows[0].low.toFixed(2),
      lines: [
        { price: neckline, label: "Neckline", color: nc.line, style: "dashed" },
      ],
      zones: [],
      polygons: [],
      curves: [
        {
          points: [
            { time: barAt(0.03).time,            price: +(neckline * 0.995).toFixed(2) },
            { time: earlyLow.time,               price: earlyLow.low,                    dot: true },
            { time: midTime(earlyLow, midLow),   price: +(neckline * 0.99).toFixed(2) },
            { time: midLow.time,                 price: +(midLow.low * 1.005).toFixed(2), dot: true },
            { time: midTime(midLow, lateLow),    price: +(neckline * 0.99).toFixed(2) },
            { time: lateLow.time,                price: +(lateLow.low * 1.005).toFixed(2), dot: true },
            { time: barAt(0.82).time,            price: +(neckline * 1.01).toFixed(2),    dot: true },
          ],
          color: bc.line,
          lineWidth: 2,
          fill: { basePrice: neckline, color: "rgba(34,197,94,0.12)" },
        } satisfies ChartCurve,
      ],
      markers: [
        {
          time: earlyLow.time,
          position: "belowBar",
          color: bc.marker,
          shape: "circle",
          text: "B1",
        },
        {
          time: midLow.time,
          position: "belowBar",
          color: bc.marker,
          shape: "circle",
          text: "B2",
        },
        {
          time: lateLow.time,
          position: "belowBar",
          color: bc.marker,
          shape: "circle",
          text: "B3",
        },
        {
          time: barAt(0.82).time,
          position: "aboveBar",
          color: bc.marker,
          shape: "arrowUp",
          text: "↑",
        },
      ],
    },
  ];

  const overallBias = last.close > avgPrice ? "bullish" : "bearish";

  return {
    ticker: ticker.toUpperCase(),
    analyzedAt: new Date().toISOString(),
    timeframe: "1d",
    overallBias,
    summary: `[MOCK DATA] ${ticker.toUpperCase()} is trading at ${last.close.toFixed(
      2
    )}, ${
      overallBias === "bullish" ? "above" : "below"
    } its average of ${avgPrice}. Key support at ${support1}, resistance at ${resist1}. Multiple patterns detected — toggle each in the sidebar to inspect them individually.`,
    patterns,
    keyLevels: {
      supports: [support1, support2, +lowestLows[0].low.toFixed(2)],
      resistances: [resist2, resist1, +highestHighs[0].high.toFixed(2)],
    },
    entrySignal: overallBias === "bullish" ? {
      hasEntry: true,
      direction: "long" as const,
      entryPrice: +(support2 * 1.005).toFixed(2),
      stopLoss:   +(support1 * 0.99).toFixed(2),
      target:     resist2,
      riskRewardRatio: +((resist2 - support2 * 1.005) / (support2 * 1.005 - support1 * 0.99)).toFixed(1),
      rationale:  `Price holding above key support at ${support1} with bullish bias — long entry above ${support2} targets resistance at ${resist2}.`,
    } : {
      hasEntry: true,
      direction: "short" as const,
      entryPrice: +(resist2 * 0.995).toFixed(2),
      stopLoss:   +(resist1 * 1.01).toFixed(2),
      target:     support2,
      riskRewardRatio: +((resist2 * 0.995 - support2) / (resist1 * 1.01 - resist2 * 0.995)).toFixed(1),
      rationale:  `Price rejecting resistance at ${resist1} with bearish bias — short below ${resist2} targets support at ${support2}.`,
    },
  };
}

// ─── Channel Validity Check ──────────────────────────────────────────────────────

const CHANNEL_TYPES = new Set([
  "ascending_channel", "descending_channel", "horizontal_channel",
  "falling_wedge", "rising_wedge", "bull_flag", "bear_flag",
]);

/**
 * Removes channel patterns where too many bars fall outside the boundary lines.
 * A 1.5% price buffer is applied so minor wicks don't invalidate a valid channel.
 * Patterns with >25% of their bars violating the buffer are dropped.
 */
function filterInvalidChannels(patterns: TechnicalPattern[], bars: OHLCVBar[]): TechnicalPattern[] {
  const BUFFER           = 0.015; // 1.5 % price tolerance
  const MAX_VIOLATION    = 0.25;  // drop if > 25 % of bars are outside

  /** Linear interpolation of price on a 2-point trendline at time t */
  function interpPrice(pts: { time: number; price: number }[], t: number): number {
    const [p0, p1] = pts;
    if (p1.time === p0.time) return p0.price;
    return p0.price + ((t - p0.time) / (p1.time - p0.time)) * (p1.price - p0.price);
  }

  return patterns.filter((pattern) => {
    if (!CHANNEL_TYPES.has(pattern.type))   return true; // non-channel — always keep
    if (pattern.polygons.length < 2)        return true; // can't validate without 2 lines
    if (pattern.polygons[0].points.length < 2 || pattern.polygons[1].points.length < 2) return true;

    const mid = (pattern.startTime + pattern.endTime) / 2;
    const m0  = interpPrice(pattern.polygons[0].points, mid);
    const m1  = interpPrice(pattern.polygons[1].points, mid);
    const upperPoly = m0 >= m1 ? pattern.polygons[0] : pattern.polygons[1];
    const lowerPoly = m0 >= m1 ? pattern.polygons[1] : pattern.polygons[0];

    const patternBars = bars.filter((b) => b.time >= pattern.startTime && b.time <= pattern.endTime);
    if (patternBars.length < 5) return true; // too few bars to decide

    let violations = 0;
    for (const bar of patternBars) {
      const upper = interpPrice(upperPoly.points, bar.time) * (1 + BUFFER);
      const lower = interpPrice(lowerPoly.points, bar.time) * (1 - BUFFER);
      if (bar.high > upper || bar.low < lower) violations++;
    }

    const valid = violations / patternBars.length <= MAX_VIOLATION;
    if (!valid) console.log(`[Gemini] Dropped invalid channel "${pattern.label}" (${Math.round(violations / patternBars.length * 100)}% bars outside)`);
    return valid;
  });
}

// ─── Main Analyzer ──────────────────────────────────────────────────────────────

export async function analyzeChart(
  request: AnalyzeRequest
): Promise<AnalysisResult> {
  const { ticker, bars, indicators = [], screenerContext } = request;

  // ── Mock mode: set MOCK_AI=true in .env.local to skip Gemini ──────────────
  if (process.env.MOCK_AI === "true") {
    console.log(
      "[Gemini] MOCK mode — returning synthetic analysis for",
      ticker
    );
    return buildMockAnalysis(ticker, bars);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  console.log("[Gemini] Using API key:", apiKey.slice(0, 8) + "...");

  const model = genAI.getGenerativeModel({
    model: AI_MODELS.chartAnalysis,
    generationConfig,
  });

  const prompt = buildPrompt(ticker, bars, indicators, screenerContext);
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  let parsed: Omit<AnalysisResult, "ticker" | "analyzedAt" | "timeframe">;
  try {
    // Strip markdown code fences if the model wraps the JSON despite instructions
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    const pos = parseErr instanceof SyntaxError
      ? parseInt(parseErr.message.match(/position (\d+)/)?.[1] ?? "-1", 10)
      : -1;
    console.error("[Gemini] JSON parse failed —", parseErr instanceof Error ? parseErr.message : parseErr);
    console.error("[Gemini] Response length:", text.length, "chars");
    if (pos >= 0) {
      console.error("[Gemini] Around error position:", JSON.stringify(text.slice(Math.max(0, pos - 60), pos + 60)));
    } else {
      console.error("[Gemini] Response tail (last 300 chars):", JSON.stringify(text.slice(-300)));
    }
    throw new Error("Failed to parse Gemini response as JSON");
  }

  // Assign unique IDs, then drop any channel patterns that don't fit the bars
  const patterns: TechnicalPattern[] = filterInvalidChannels(
    parsed.patterns.map((p, i) => ({ ...p, id: `${p.type}-${i}-${Date.now()}` })),
    bars
  );

  return {
    ticker: ticker.toUpperCase(),
    analyzedAt: new Date().toISOString(),
    timeframe: "1d",
    overallBias: parsed.overallBias,
    summary: parsed.summary,
    patterns,
    keyLevels: parsed.keyLevels,
    entrySignal: parsed.entrySignal,
  };
}
