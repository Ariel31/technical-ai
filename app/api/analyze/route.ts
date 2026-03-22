import { analyzeChart } from "@/lib/gemini";
import type { AnalyzeRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

function toFriendlyError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes("gemini_api_key") || msg.includes("api key not configured"))
    return "AI analysis isn't set up. Please configure a Gemini API key.";
  if (msg.includes("429") || msg.includes("quota") || msg.includes("limit: 0") || msg.includes("rate limit"))
    return "The AI service is over capacity right now. Please wait a moment and try again.";
  if (msg.includes("model not found") || msg.includes("404") || msg.includes("not found"))
    return "The AI model is temporarily unavailable. Please try again shortly.";
  if (msg.includes("timeout") || msg.includes("deadline"))
    return "The AI took too long to respond. Please try again.";
  if (msg.includes("network") || msg.includes("enotfound") || msg.includes("fetch"))
    return "Couldn't reach the AI service. Check your connection and try again.";
  if (msg.includes("json") || msg.includes("parse"))
    return "The AI returned an unexpected response. Please try again.";
  return "AI analysis couldn't be completed. Please try again.";
}

function sse(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: Request) {
  let body: AnalyzeRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const { ticker, bars, indicators } = body;

  if (!ticker || !Array.isArray(bars) || bars.length === 0) {
    return Response.json({ error: "Ticker and price data are required." }, { status: 400 });
  }
  if (bars.length < 20) {
    return Response.json({ error: "Not enough price history to analyze. Please try a different ticker." }, { status: 422 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(sse({ type: "progress", message: "Analyzing chart patterns…" }));
        const result = await analyzeChart({ ticker, bars, indicators });
        controller.enqueue(sse({ type: "done", result }));
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Analysis failed";
        controller.enqueue(sse({ type: "error", message: toFriendlyError(raw) }));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
