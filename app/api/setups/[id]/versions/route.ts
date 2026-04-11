// GET  /api/setups/[id]/versions  — list all versions for a setup
// POST /api/setups/[id]/versions  — create a refined version via AI
//
// Required Supabase SQL (run once):
//   CREATE TABLE setup_versions (
//     id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
//     setup_id          UUID        NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
//     version_number    INTEGER     NOT NULL,
//     source            TEXT        NOT NULL DEFAULT 'ai',
//     created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
//     entry_price       NUMERIC     NOT NULL,
//     stop_price        NUMERIC     NOT NULL,
//     target_price      NUMERIC     NOT NULL,
//     rr_ratio          NUMERIC     NOT NULL,
//     changed_fields    JSONB,
//     change_summary    TEXT,
//     technical_warning TEXT,
//     user_input_text   TEXT,
//     is_committed      BOOLEAN     NOT NULL DEFAULT false,
//     below_minimum_rr  BOOLEAN     NOT NULL DEFAULT false,
//     UNIQUE (setup_id, version_number)
//   );

import sql from "@/lib/db";
import { auth } from "@/auth";
import { refineSetup } from "@/lib/refinement-ai";
import type { SetupVersion } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rowToVersion(r: Record<string, unknown>): SetupVersion {
  return {
    id:               r.id as string,
    setupId:          r.setup_id as string,
    versionNumber:    Number(r.version_number),
    source:           r.source as "ai" | "user_refinement",
    createdAt:        r.created_at as string,
    entryPrice:       Number(r.entry_price),
    stopPrice:        Number(r.stop_price),
    targetPrice:      Number(r.target_price),
    rrRatio:          Number(r.rr_ratio),
    changedFields:    r.changed_fields as string[] | null,
    changeSummary:    r.change_summary as string | null,
    technicalWarning: r.technical_warning as string | null,
    userInputText:    r.user_input_text as string | null,
    isCommitted:      Boolean(r.is_committed),
    belowMinimumRr:   Boolean(r.below_minimum_rr),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json([], { status: 401 });
  const userId = session.user.id;
  const { id } = await params;

  const setup = await sql`SELECT id FROM setups WHERE id = ${id} AND user_id = ${userId} LIMIT 1`;
  if (setup.length === 0) return Response.json([], { status: 404 });

  const rows = await sql`
    SELECT * FROM setup_versions
    WHERE setup_id = ${id}
    ORDER BY version_number ASC
  ` as Record<string, unknown>[];

  return Response.json(rows.map(rowToVersion));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;

  try {
    const setupRows = await sql`
      SELECT * FROM setups WHERE id = ${id} AND user_id = ${userId} LIMIT 1
    ` as Record<string, unknown>[];
    if (setupRows.length === 0) return Response.json({ error: "Setup not found" }, { status: 404 });
    const setup = setupRows[0];

    if (setup.status === "ACTIVE") {
      return Response.json(
        { error: "Setup has triggered — levels cannot be modified while in a trade" },
        { status: 400 }
      );
    }

    const body = await req.json() as { userInput: string };
    if (!body.userInput?.trim()) return Response.json({ error: "userInput required" }, { status: 400 });
    if (body.userInput.length > 500) return Response.json({ error: "Input too long (max 500 chars)" }, { status: 400 });

    // Count existing versions (for lazy v1 seeding)
    const countRows = await sql`
      SELECT COUNT(*)::int AS count FROM setup_versions WHERE setup_id = ${id}
    ` as { count: number }[];
    const existingCount = Number(countRows[0].count);

    const direction = (setup.direction as "long" | "short") ?? "long";
    const entryPrice  = Number(setup.entry_price);
    const stopPrice   = Number(setup.stop_price);
    const targetPrice = Number(setup.target_price);

    const aiResult = await refineSetup({
      direction,
      pattern:    setup.pattern as string,
      entryPrice,
      stopPrice,
      targetPrice,
      rrRatio:    Number(setup.entry_price) > 0
        ? Math.abs(direction === "long"
            ? (targetPrice - entryPrice) / (entryPrice - stopPrice)
            : (entryPrice - targetPrice) / (stopPrice - entryPrice))
        : 0,
      rationale:  (setup.reasoning as string) ?? "",
      userInput:  body.userInput,
    });

    // If AI couldn't identify a field → no new version
    if (aiResult.changedFields.length === 0) {
      return Response.json({
        warning: aiResult.technicalWarning ?? aiResult.changeSummary ?? "Please be more specific about which level you'd like to change.",
        noNewVersion: true,
      });
    }

    // Recompute R:R server-side
    const e = aiResult.entryPrice, s = aiResult.stopPrice, t = aiResult.targetPrice;
    const computedRr = +(Math.abs(direction === "long"
      ? (t - e) / (e - s)
      : (e - t) / (s - e)
    )).toFixed(2);
    const belowMinRr = computedRr < 2.0;

    // Lazy seed v1 from parent setup on first refinement
    if (existingCount === 0) {
      const v1Rr = +(Math.abs(direction === "long"
        ? (targetPrice - entryPrice) / (entryPrice - stopPrice)
        : (entryPrice - targetPrice) / (stopPrice - entryPrice)
      )).toFixed(2);
      await sql`
        INSERT INTO setup_versions
          (setup_id, version_number, source, entry_price, stop_price, target_price,
           rr_ratio, change_summary, is_committed)
        VALUES
          (${id}, 1, 'ai', ${entryPrice}, ${stopPrice}, ${targetPrice},
           ${v1Rr}, 'Original AI-generated setup.', true)
      `;
    }

    const nextVersion = existingCount === 0 ? 2 : existingCount + 1;
    const newRows = await sql`
      INSERT INTO setup_versions
        (setup_id, version_number, source, entry_price, stop_price, target_price,
         rr_ratio, changed_fields, change_summary, technical_warning,
         user_input_text, is_committed, below_minimum_rr)
      VALUES
        (${id}, ${nextVersion}, 'user_refinement',
         ${aiResult.entryPrice}, ${aiResult.stopPrice}, ${aiResult.targetPrice},
         ${computedRr}, ${sql.json(aiResult.changedFields)},
         ${aiResult.changeSummary}, ${aiResult.technicalWarning},
         ${body.userInput}, false, ${belowMinRr})
      RETURNING *
    ` as Record<string, unknown>[];

    return Response.json({ ...rowToVersion(newRows[0]), disagreed: aiResult.disagreed });
  } catch (err) {
    console.error("[setups/versions] POST failed:", err);
    return Response.json({ error: "Refinement failed" }, { status: 500 });
  }
}
