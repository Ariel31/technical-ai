// GET  /api/top-picks — return latest cached top picks for the signed-in user
// POST /api/top-picks — save new top picks (called by screen/route.ts after scan)

import sql from "@/lib/db";
import { auth } from "@/auth";
import type { ScreenerResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  try {
    const rows = await sql`
      SELECT result, picked_at
      FROM top_picks
      WHERE user_id = ${userId}
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
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  try {
    const body = await req.json();
    const result: ScreenerResult = body.result;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sql`
      INSERT INTO top_picks (user_id, result, picked_at)
      VALUES (${userId}, ${sql.json(result as any)}, now())
    `;

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[top-picks] POST failed:", err);
    return Response.json({ error: "Failed to save" }, { status: 500 });
  }
}
