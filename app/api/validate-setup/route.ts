// POST /api/validate-setup
// Accepts a chart screenshot (base64 data URL) + ticker + mode + notes.
// Calls Gemini Vision to validate the setup and returns structured results.

import { auth } from "@/auth";
import { validateSetup, type ValidationMode } from "@/lib/validate-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { imageData: string; ticker: string; mode: ValidationMode; notes?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { imageData, ticker, mode, notes } = body;

  if (!imageData || !ticker || !mode) {
    return Response.json({ error: "imageData, ticker, and mode are required" }, { status: 400 });
  }

  // Extract base64 and mimeType from data URL: "data:image/png;base64,..."
  const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return Response.json({ error: "Invalid image format — expected base64 data URL" }, { status: 400 });
  }
  const [, mimeType, base64] = match;

  if (!mimeType.startsWith("image/")) {
    return Response.json({ error: "Only image files are supported" }, { status: 400 });
  }

  try {
    const result = await validateSetup(base64, mimeType, ticker.toUpperCase(), mode, notes);
    return Response.json(result);
  } catch (err) {
    console.error("[validate-setup] POST failed:", err);
    const msg = err instanceof Error ? err.message : "Validation failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
