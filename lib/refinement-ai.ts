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
    changeSummary: {
      type: SchemaType.STRING,
      description: "1-2 sentences: what changed and why, or why no change was made.",
    },
    technicalWarning: {
      type: SchemaType.STRING,
      description: "Warning if R:R < 2.0 or if the request is too vague. Empty string if none.",
    },
  },
  required: ["changedFields", "entryPrice", "stopPrice", "targetPrice", "rrRatio", "changeSummary", "technicalWarning"],
};

export interface RefinementAIResponse {
  changedFields: string[];
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  rrRatio: number;
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

  const prompt = `You are a trade setup refinement assistant. A user wants to adjust one aspect of an AI-generated trade setup.

Original setup:
- Direction: ${params.direction}
- Pattern: ${params.pattern}
- Entry: ${params.entryPrice}
- Stop: ${params.stopPrice}
- Target: ${params.targetPrice}
- R:R: ${params.rrRatio}
- Rationale: ${params.rationale}

User feedback: "${params.userInput}"

Rules:
1. CRITICAL: Only change the EXACT field(s) the user explicitly mentions. If they say "move target to 95", change ONLY target_price — do NOT touch stop_price or entry_price. If they say "tighten stop to 68", change ONLY stop_price.
2. Never "rebalance" R:R by adjusting a second field. If the user changes one level, the other two stay exactly as given. Just recalculate R:R from the result.
3. If the user gives a specific price, use that exact number. If they say directional (e.g. "a bit lower"), make one small conservative move to that field only.
4. changedFields must list ONLY the fields you actually changed. If you changed only target_price, changedFields = ["target_price"].
5. If you cannot identify which specific field to change, set changedFields=[] and explain in changeSummary. Set technicalWarning asking for more specificity.
6. If new R:R < 2.0, still make the change but set technicalWarning explaining the concern.
7. Never change direction or pattern type.`;

  const result = await model.generateContent(prompt);
  const parsed = JSON.parse(result.response.text());

  return {
    changedFields: Array.isArray(parsed.changedFields) ? parsed.changedFields : [],
    entryPrice:  Number(parsed.entryPrice),
    stopPrice:   Number(parsed.stopPrice),
    targetPrice: Number(parsed.targetPrice),
    rrRatio:     Number(parsed.rrRatio),
    changeSummary:    parsed.changeSummary ?? "",
    technicalWarning: parsed.technicalWarning || null,
  };
}
