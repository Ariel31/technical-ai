// POST /api/share-chart — upload chart PNG to Vercel Blob, return public URL

import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { imageData, ticker } = await req.json() as {
      imageData: string; // base64 data URL
      ticker: string;
    };

    if (!imageData || !ticker) {
      return Response.json({ error: "Missing fields" }, { status: 400 });
    }

    // Convert base64 data URL → Buffer
    const base64 = imageData.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    const filename = `charts/${ticker}-${Date.now()}.png`;
    const { url } = await put(filename, buffer, {
      access: "public",
      contentType: "image/png",
    });

    return Response.json({ url });
  } catch (err) {
    console.error("[share-chart] POST failed:", err);
    return Response.json({ error: "Failed to upload chart" }, { status: 500 });
  }
}
