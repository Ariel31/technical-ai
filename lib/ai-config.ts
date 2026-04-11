/**
 * AI model configuration — automatically selects cheap models in development
 * and the best models in production. Override per-feature via env vars.
 *
 * Dev  → gemini-2.5-flash-lite  (fastest + cheapest stable model)
 * Prod → per-feature best fit   (highest quality output)
 */

const isDev = process.env.NODE_ENV === "development";

export const AI_MODELS = {
  /**
   * Chart pattern analysis — the most demanding AI task in the app.
   * Requires spatial reasoning: polygon anchor coordinates, trend line
   * endpoints, precise timestamps, and multi-pattern JSON with overlays.
   *
   * Prod: gemini-2.5-pro        — best reasoning, handles complex coordinate logic
   * Dev:  gemini-2.5-flash-lite — fastest + cheapest stable model
   */
  chartAnalysis: process.env.GEMINI_MODEL_CHART ?? (isDev ? "gemini-2.5-flash-lite" : "gemini-2.5-pro"),

  /**
   * Screener candidate ranking — structured JSON selection task.
   * Reads pre-scored candidates and picks the top 3 setups based on rules.
   * Less spatially complex than chart analysis; flash is fully capable.
   *
   * Prod: gemini-2.5-flash      — fast, cost-efficient, sufficient for ranking
   * Dev:  gemini-2.5-flash-lite — cheapest
   */
  screenerRanking: process.env.GEMINI_MODEL_SCREENER ?? (isDev ? "gemini-2.5-flash-lite" : "gemini-2.5-flash"),

  /**
   * Setup refinement — minimal structured edit task (no spatial reasoning).
   * Reads one setup + one user sentence, returns a price diff JSON.
   *
   * Prod: gemini-2.5-flash      — fast and sufficient for this constrained task
   * Dev:  gemini-2.5-flash-lite — cheapest
   */
  setupRefinement: process.env.GEMINI_MODEL_REFINEMENT ?? (isDev ? "gemini-2.5-flash-lite" : "gemini-2.5-flash"),

  /**
   * Setup validation — vision task: reads a chart screenshot, validates user-drawn levels.
   * Requires multimodal (image) input + spatial reasoning.
   *
   * Prod: gemini-2.5-pro        — best vision + reasoning for level validation
   * Dev:  gemini-2.5-flash-lite — cheapest with vision support
   */
  setupValidation: process.env.GEMINI_MODEL_VALIDATION ?? (isDev ? "gemini-2.5-flash-lite" : "gemini-2.5-pro"),
} as const;
