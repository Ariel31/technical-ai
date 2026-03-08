import { NextRequest, NextResponse } from "next/server";
import { analyzeChart } from "@/lib/gemini";
import type { AnalyzeRequest, ApiError } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Maps internal/technical error messages to user-readable ones. */
function toFriendlyError(raw: string): string {
  const msg = raw.toLowerCase();

  if (msg.includes("gemini_api_key") || msg.includes("api key not configured")) {
    return "AI analysis isn't set up. Please configure a Gemini API key.";
  }
  if (msg.includes("429") || msg.includes("quota") || msg.includes("limit: 0") || msg.includes("rate limit")) {
    return "The AI service is over capacity right now. Please wait a moment and try again.";
  }
  if (msg.includes("model not found") || msg.includes("404") || msg.includes("not found")) {
    return "The AI model is temporarily unavailable. Please try again shortly.";
  }
  if (msg.includes("timeout") || msg.includes("deadline")) {
    return "The AI took too long to respond. Please try again.";
  }
  if (msg.includes("network") || msg.includes("enotfound") || msg.includes("fetch")) {
    return "Couldn't reach the AI service. Check your connection and try again.";
  }
  if (msg.includes("json") || msg.includes("parse")) {
    return "The AI returned an unexpected response. Please try again.";
  }
  return "AI analysis couldn't be completed. Please try again.";
}

export async function POST(request: NextRequest) {
  let body: AnalyzeRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiError>({ error: "Invalid request." }, { status: 400 });
  }

  const { ticker, bars, indicators } = body;

  if (!ticker || !Array.isArray(bars) || bars.length === 0) {
    return NextResponse.json<ApiError>(
      { error: "Ticker and price data are required." },
      { status: 400 }
    );
  }

  if (bars.length < 20) {
    return NextResponse.json<ApiError>(
      { error: "Not enough price history to analyze. Please try a different ticker." },
      { status: 422 }
    );
  }

  try {
    const result = await analyzeChart({ ticker, bars, indicators });
    return NextResponse.json(result);
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Analysis failed";
    const friendly = toFriendlyError(raw);

    const status =
      raw.toLowerCase().includes("429") || raw.toLowerCase().includes("quota") ? 429
      : raw.toLowerCase().includes("api key") ? 503
      : 500;

    return NextResponse.json<ApiError>({ error: friendly }, { status });
  }
}
