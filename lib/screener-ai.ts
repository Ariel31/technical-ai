import {
  GoogleGenerativeAI,
  SchemaType,
  type Schema,
} from "@google/generative-ai";
import type { MarketRegime, ScreenerCandidate, ScreenerPick } from "./types";

// ─── Response schema (unchanged — ScreenerPick shape) ────────────────────────

const screenerSchema = {
  type: SchemaType.OBJECT,
  properties: {
    picks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          ticker:          { type: SchemaType.STRING },
          companyName:     { type: SchemaType.STRING },
          direction:       { type: SchemaType.STRING, enum: ["long", "short"] },
          confidence:      { type: SchemaType.NUMBER },
          currentPrice:    { type: SchemaType.NUMBER },
          entry:           { type: SchemaType.NUMBER },
          target:          { type: SchemaType.NUMBER },
          stopLoss:        { type: SchemaType.NUMBER },
          potentialReturn: { type: SchemaType.NUMBER },
          riskReward:      { type: SchemaType.NUMBER },
          primaryPattern:  { type: SchemaType.STRING },
          triggers: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
          reasoning: { type: SchemaType.STRING },
        },
        required: [
          "ticker", "companyName", "direction", "confidence", "currentPrice",
          "entry", "target", "stopLoss", "potentialReturn", "riskReward",
          "primaryPattern", "triggers", "reasoning",
        ],
      },
    },
  },
  required: ["picks"],
};

// ─── Prompt builder — structured JSON input ───────────────────────────────────

function buildPrompt(candidates: ScreenerCandidate[], regime: MarketRegime): string {
  const candidateData = candidates.map((c) => ({
    ticker:               c.ticker,
    name:                 c.name,
    price:                +c.price.toFixed(2),
    pattern:              c.pattern,
    breakoutDistance:     +c.breakoutDistance.toFixed(1),  // % from price to breakout
    consolidationDays:    c.consolidationDays,
    rsi14:                +c.rsi14.toFixed(0),
    atr14Pct:             +c.atr14Pct.toFixed(2),
    volumeRatio:          +c.volumeRatio.toFixed(2),
    change5d:             +c.change5d.toFixed(1),
    change60d:            +c.change60d.toFixed(1),
    relativeStrength:     +c.relativeStrength.toFixed(1),  // stock_60d - SPY_60d
    rsRank:               c.rsRank,                         // 0-100 percentile
    aboveSma50:           c.aboveSma50,
    aboveSma200:          c.aboveSma200,
    isContracting:        c.isContracting,
    range10d:             +c.range10d.toFixed(1),
    riskReward:           +c.riskReward.toFixed(2),
    entry:                +c.entry.toFixed(2),
    stopLevel:            +c.stopLevel.toFixed(2),
    targetLevel:          +c.targetLevel.toFixed(2),
    score:                +c.score.toFixed(1),
  }));

  const regimeSummary = {
    spyPrice:    +regime.spyPrice.toFixed(2),
    aboveSma200: regime.aboveSma200,
    trend:       regime.trend,
    return60d:   `${regime.return60d >= 0 ? "+" : ""}${regime.return60d.toFixed(1)}%`,
    note:        regime.note,
  };

  return `You are a professional swing trader and portfolio manager. Select the 3 best trade setups from the candidates below.

MARKET REGIME:
${JSON.stringify(regimeSummary, null, 2)}

SCREENED CANDIDATES (${candidates.length} stocks, pre-filtered RR ≥ 1.8, sorted by weighted score):
${JSON.stringify(candidateData, null, 2)}

FIELD GLOSSARY:
- pattern: detected chart pattern
- breakoutDistance: % from current price to breakout level (lower = closer)
- relativeStrength: stock 60d return minus SPY 60d return (higher = outperforming market)
- rsRank: 0-100 percentile of relativeStrength across all candidates (100 = strongest)
- isContracting: true if price range and ATR are tightening (volatility squeeze)
- riskReward: pre-calculated based on 1.5×ATR stop, 3× risk target
- entry/stopLevel/targetLevel: algorithmic levels — you may fine-tune ±5%

SELECTION RULES:
1. Prefer isContracting=true AND breakoutDistance < 3% (coiled setups about to break)
2. Favor rsRank ≥ 70 (relative strength leaders)
3. In a downtrend regime you MAY include 1 SHORT; in uptrend focus on longs
4. Avoid duplicating patterns — pick diverse setups across different sectors/patterns
5. potentialReturn = (target − entry) / entry × 100 for longs (always positive %)
6. riskReward = (target − entry) / (entry − stopLoss)
7. confidence ≥ 80 only if pattern is clear, RSI is not overextended, and volume confirms
8. triggers[]: 3–5 strings from the actual data, e.g.:
   "RSI 58 momentum zone", "Volume 2.1× 50d avg", "Volatility squeeze",
   "RS rank 89th pct", "Bull flag breakout within 1.2%", "Above SMA200"

Return exactly 3 picks.`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function analyzeScreenerCandidates(
  candidates: ScreenerCandidate[],
  regime: MarketRegime
): Promise<ScreenerPick[]> {
  if (candidates.length === 0) {
    throw new Error("No candidates to analyze — screener pipeline produced zero results");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: screenerSchema as unknown as Schema,
      temperature: 0.3,
    },
  });

  const prompt = buildPrompt(candidates, regime);
  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  const json = JSON.parse(cleaned);
  return (json.picks ?? []) as ScreenerPick[];
}
