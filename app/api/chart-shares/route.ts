// POST /api/chart-shares — save a chart snapshot and return a share ID
// GET  /api/chart-shares?id=xxx — retrieve a saved chart snapshot

import sql from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { ticker, imageData } = await req.json() as {
      ticker: string;
      imageData: string; // base64 data URL (image/png)
    };

    if (!ticker || !imageData) {
      return Response.json({ error: "Missing fields" }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO chart_shares (ticker, image_data)
      VALUES (${ticker}, ${imageData})
      RETURNING id
    ` as { id: string }[];

    return Response.json({ id: rows[0].id });
  } catch (err) {
    console.error("[chart-shares] POST failed:", err);
    return Response.json({ error: "Failed to save share" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

    const rows = await sql`
      SELECT ticker, image_data, created_at
      FROM chart_shares
      WHERE id = ${id}
      LIMIT 1
    ` as { ticker: string; image_data: string; created_at: string }[];

    if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });

    return Response.json({
      ticker:    rows[0].ticker,
      imageData: rows[0].image_data,
      createdAt: rows[0].created_at,
    });
  } catch (err) {
    console.error("[chart-shares] GET failed:", err);
    return Response.json({ error: "Failed to retrieve share" }, { status: 500 });
  }
}
