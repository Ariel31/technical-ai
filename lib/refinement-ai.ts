import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerationConfig,
  type Schema,
} from "@google/generative-ai";
import { AI_MODELS } from "./ai-config";

const refinementSchema = {
  type: SchemaType.OBJECT,
  properties: {
    changedFields: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Which price fields changed: subset of ['entry_price','stop_price','target_price']. Empty array if no specific field could be identified.",
    },
    entryPrice:  { type: SchemaType.NUMBER, description: "Entry price (updated or unchanged)" },
    stopPrice:   { type: SchemaType.NUMBER, description: "Stop price (updated or unchanged)" },
    targetPrice: { type: SchemaType.NUMBER, description: "Target price (updated or unchanged)" },
    rrRatio: {
      type: SchemaType.NUMBER,
      description: "Recalculated R:R. Longs: (target-entry)/(entry-stop). Shorts: (entry-target)/(stop-entry).",
    },
    disagreed: {
      type: SchemaType.BOOLEAN,
      description: "true if the AI disagrees with the user's request and is counter-proposing different levels instead.",
    },
    changeSummary: {
      type: SchemaType.STRING,
      description: "1-3 sentences explaining what changed and why. If disagreeing, explain the technical reason and what was done instead. Be direct and specific — cite the pattern, key levels, or R:R.",
    },
    technicalWarning: {
      type: SchemaType.STRING,
      description: "Warning if R:R < 2.0 or if the request is too vague. Empty string if none.",
    },
  },
  required: ["changedFields", "entryPrice", "stopPrice", "targetPrice", "rrRatio", "disagreed", "changeSummary", "technicalWarning"],
};

export interface RefinementAIResponse {
  changedFields: string[];
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  rrRatio: number;
  disagreed: boolean;
  changeSummary: string;
  technicalWarning: string | null;
}

export async function refineSetup(params: {
  direction: "long" | "short";
  pattern: string;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  rrRatio: number;
  rationale: string;
  userInput: string;
}): Promise<RefinementAIResponse> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: AI_MODELS.setupRefinement,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: refinementSchema as unknown as Schema,
      temperature: 0.2,
    } as GenerationConfig,
  });

  const prompt = `You are a professional trading coach reviewing a trade setup with a user. The user is sharing their perspective on the levels — your job is to engage honestly, like a real trading partner would.

Original setup:
- Direction: ${params.direction}
- Pattern: ${params.pattern}
- Entry: ${params.entryPrice}
- Stop: ${params.stopPrice}
- Target: ${params.targetPrice}
- R:R: ${params.rrRatio}
- Rationale: ${params.rationale}

User's input: "${params.userInput}"

Your behavior:

AGREE & EXECUTE — If the user's request makes technical sense (respects key levels, maintains reasonable R:R, aligns with the pattern), make the change. Set disagreed=false.

DISAGREE & COUNTER — If the user's request would:
  - Destroy the R:R below 1.5
  - Place a stop inside noise/chop where it would get swept before the pattern plays out
  - Put a target below a major resistance level that would likely cap the move
  - Contradict the core pattern logic (e.g. "aggressive entry" on a pattern that needs confirmation)
...then SET disagreed=true, DO NOT blindly apply what they asked, and instead apply the technically correct version. In changeSummary, explain clearly WHY you're overriding: cite the pattern, the problematic level, or the R:R math. Offer what you did instead.

GREY AREA — If you partially agree, apply the reasonable part and explain the tradeoff.

Execution rules:
1. Only change the field(s) the user explicitly mentions. Never "rebalance" by adjusting a second field.
2. If the user gives a specific price and it's technically sound, use that exact number.
3. If vague (e.g. "tighten"), make one small conservative move.
4. changedFields = only fields actually changed.
5. Never change direction or pattern type.
6. changeSummary must be direct and specific — no filler phrases like "Great idea!". If disagreeing, be honest but constructive.`;

  const result = await model.generateContent(prompt);
  const parsed = JSON.parse(result.response.text());

  return {
    changedFields: Array.isArray(parsed.changedFields) ? parsed.changedFields : [],
    entryPrice:  Number(parsed.entryPrice),
    stopPrice:   Number(parsed.stopPrice),
    targetPrice: Number(parsed.targetPrice),
    rrRatio:     Number(parsed.rrRatio),
    disagreed:        Boolean(parsed.disagreed),
    changeSummary:    parsed.changeSummary ?? "",
    technicalWarning: parsed.technicalWarning || null,
  };
}
