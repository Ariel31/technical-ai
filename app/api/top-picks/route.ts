// GET  /api/top-picks — return latest cached top picks from DB
// POST /api/top-picks — save new top picks (called by screen/route.ts after scan)
//
// Required Supabase SQL (run once):
//   CREATE TABLE top_picks (
//     id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
//     picked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
//     result    JSONB       NOT NULL
//   );

import sql from "@/lib/db";
import type { ScreenerResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await sql`
      SELECT result, picked_at
      FROM top_picks
      ORDER BY picked_at DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      return Response.json({ result: null, pickedAt: null });
    }

    return Response.json({
      result: rows[0].result as ScreenerResult,
      pickedAt: rows[0].picked_at,
    });
  } catch (err) {
    console.error("[top-picks] GET failed:", err);
    return Response.json({ result: null, pickedAt: null });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result: ScreenerResult = body.result;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sql`
      INSERT INTO top_picks (result, picked_at)
      VALUES (${sql.json(result as any)}, now())
    `;

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[top-picks] POST failed:", err);
    return Response.json({ error: "Failed to save" }, { status: 500 });
  }
}
