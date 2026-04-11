import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_MODELS } from "./ai-config";

export type ValidationMode = "levels_drawn" | "analyze_only";

export interface LevelValidation {
  verdict: "Good" | "Adjust" | "Unreadable";
  note: string;
}

export interface ValidationResultA {
  mode: "levels_drawn";
  ticker: string;
  patternIdentified: string;
  timeframe: string;
  direction: "LONG" | "SHORT" | null;
  levelsRead: { entry: number | null; stop: number | null; target: number | null };
  rrRatio: number | null;
  validation: {
    entry: LevelValidation;
    stop: LevelValidation;
    target: LevelValidation;
  };
  suggestedLevels: { entry: number | null; stop: number | null; target: number | null };
  patternInvalidationLevel: number | null;
  overallVerdict: "Valid" | "Valid with adjustments" | "Invalid";
  overallNote: string;
  confidence: number;
  imageQualityIssues: string | null;
}

export interface ValidationResultB {
  mode: "analyze_only";
  ticker: string;
  patternIdentified: string | null;
  timeframe: string;
  direction: "LONG" | "SHORT" | null;
  setupFound: boolean;
  entry: number | null;
  stop: number | null;
  target: number | null;
  rrRatio: number | null;
  patternInvalidationLevel: number | null;
  confidence: number;
  rationale: string;
  noSetupReason: string | null;
  imageQualityIssues: string | null;
}

export type ValidationResult = ValidationResultA | ValidationResultB;

export async function validateSetup(
  imageBase64: string,
  mimeType: string,
  ticker: string,
  mode: ValidationMode,
  notes?: string
): Promise<ValidationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: AI_MODELS.setupValidation });

  const notesText = notes?.trim() || "none";

  if (mode === "levels_drawn") {
    const systemPrompt = `You are a technical analysis validator. The user has provided a chart screenshot with their own analysis drawn on it. Your job is to:
1. Identify the pattern they are analyzing
2. Read their drawn levels (entry, stop, target if visible)
3. Validate whether each level is correctly placed on the price structure
4. Check the R/R ratio
5. Suggest only the changes that are clearly wrong or significantly improvable
6. Do not redraw the whole setup — respond to what the user has drawn

If you cannot clearly read a level from the image, say so explicitly rather than guessing.

Respond in JSON only — no markdown, no code fences:
{
  "ticker": "string — confirmed or corrected from image",
  "pattern_identified": "string — what pattern you see",
  "timeframe": "string — daily / weekly / 4h / 1h etc if readable",
  "direction": "LONG or SHORT",
  "levels_read": {
    "entry": number or null,
    "stop": number or null,
    "target": number or null
  },
  "rr_ratio": number or null,
  "validation": {
    "entry": { "verdict": "Good" or "Adjust" or "Unreadable", "note": "one sentence" },
    "stop": { "verdict": "Good" or "Adjust" or "Unreadable", "note": "one sentence" },
    "target": { "verdict": "Good" or "Adjust" or "Unreadable", "note": "one sentence" }
  },
  "suggested_levels": {
    "entry": number or null,
    "stop": number or null,
    "target": number or null
  },
  "pattern_invalidation_level": number or null,
  "overall_verdict": "Valid" or "Valid with adjustments" or "Invalid",
  "overall_note": "two sentences maximum",
  "confidence": number between 0 and 100,
  "image_quality_issues": "string or null — if any levels were unreadable"
}`;

    const result = await model.generateContent([
      systemPrompt,
      `Ticker: ${ticker}\nUser notes: ${notesText}`,
      { inlineData: { data: imageBase64, mimeType } },
    ]);

    const text = result.response.text();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      mode: "levels_drawn",
      ticker: parsed.ticker || ticker,
      patternIdentified: parsed.pattern_identified || "Unknown",
      timeframe: parsed.timeframe || "Unknown",
      direction: parsed.direction || null,
      levelsRead: {
        entry: parsed.levels_read?.entry ?? null,
        stop: parsed.levels_read?.stop ?? null,
        target: parsed.levels_read?.target ?? null,
      },
      rrRatio: parsed.rr_ratio ?? null,
      validation: {
        entry: parsed.validation?.entry ?? { verdict: "Unreadable", note: "Could not read entry level" },
        stop: parsed.validation?.stop ?? { verdict: "Unreadable", note: "Could not read stop level" },
        target: parsed.validation?.target ?? { verdict: "Unreadable", note: "Could not read target level" },
      },
      suggestedLevels: {
        entry: parsed.suggested_levels?.entry ?? null,
        stop: parsed.suggested_levels?.stop ?? null,
        target: parsed.suggested_levels?.target ?? null,
      },
      patternInvalidationLevel: parsed.pattern_invalidation_level ?? null,
      overallVerdict: parsed.overall_verdict || "Invalid",
      overallNote: parsed.overall_note || "",
      confidence: parsed.confidence ?? 0,
      imageQualityIssues: parsed.image_quality_issues ?? null,
    };
  } else {
    const systemPrompt = `You are a technical analysis expert. The user has provided a chart screenshot and wants you to identify any valid setup present.

Analyze the chart and if a valid setup exists, return the setup details. If no clear setup is present, say so.

Respond in JSON only — no markdown, no code fences:
{
  "ticker": "string",
  "pattern_identified": "string or null",
  "timeframe": "string",
  "direction": "LONG or SHORT or null",
  "setup_found": true or false,
  "entry": number or null,
  "stop": number or null,
  "target": number or null,
  "rr_ratio": number or null,
  "pattern_invalidation_level": number or null,
  "confidence": number between 0 and 100,
  "rationale": "two to three sentences",
  "no_setup_reason": "one sentence if setup_found is false, otherwise null",
  "image_quality_issues": "string or null"
}`;

    const result = await model.generateContent([
      systemPrompt,
      `Ticker: ${ticker}\nUser notes: ${notesText}`,
      { inlineData: { data: imageBase64, mimeType } },
    ]);

    const text = result.response.text();
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      mode: "analyze_only",
      ticker: parsed.ticker || ticker,
      patternIdentified: parsed.pattern_identified ?? null,
      timeframe: parsed.timeframe || "Unknown",
      direction: parsed.direction ?? null,
      setupFound: parsed.setup_found ?? false,
      entry: parsed.entry ?? null,
      stop: parsed.stop ?? null,
      target: parsed.target ?? null,
      rrRatio: parsed.rr_ratio ?? null,
      patternInvalidationLevel: parsed.pattern_invalidation_level ?? null,
      confidence: parsed.confidence ?? 0,
      rationale: parsed.rationale || "",
      noSetupReason: parsed.no_setup_reason ?? null,
      imageQualityIssues: parsed.image_quality_issues ?? null,
    };
  }
}
