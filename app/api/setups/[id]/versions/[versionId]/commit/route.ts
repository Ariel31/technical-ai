// POST /api/setups/[id]/versions/[versionId]/commit
// Sets this version as committed, mirrors prices back to the parent setup row.

import sql from "@/lib/db";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { id, versionId } = await params;

  try {
    // Verify setup belongs to user
    const setup = await sql`SELECT id FROM setups WHERE id = ${id} AND user_id = ${userId} LIMIT 1`;
    if (setup.length === 0) return Response.json({ error: "Not found" }, { status: 404 });

    // Fetch the version to commit
    const versionRows = await sql`
      SELECT * FROM setup_versions WHERE id = ${versionId} AND setup_id = ${id} LIMIT 1
    ` as Record<string, unknown>[];
    if (versionRows.length === 0) return Response.json({ error: "Version not found" }, { status: 404 });
    const v = versionRows[0];

    // Flip committed flag + mirror prices to parent setup
    await sql`UPDATE setup_versions SET is_committed = false WHERE setup_id = ${id}`;
    await sql`UPDATE setup_versions SET is_committed = true  WHERE id = ${versionId}`;
    await sql`
      UPDATE setups SET
        entry_price  = ${Number(v.entry_price)},
        stop_price   = ${Number(v.stop_price)},
        target_price = ${Number(v.target_price)}
      WHERE id = ${id}
    `;

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[setups/versions/commit] POST failed:", err);
    return Response.json({ error: "Commit failed" }, { status: 500 });
  }
}
