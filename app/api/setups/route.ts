// GET /api/setups?status=PENDING,ACTIVE  — fetch tracked setups (all or filtered by status)
//
// Required Supabase SQL (run once):
//   CREATE TABLE setups (
//     id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
//     ticker              TEXT        NOT NULL,
//     company_name        TEXT,
//     pattern             TEXT        NOT NULL,
//     confidence          INTEGER     NOT NULL DEFAULT 0,
//     entry_price         NUMERIC     NOT NULL,
//     stop_price          NUMERIC     NOT NULL,
//     target_price        NUMERIC     NOT NULL,
//     created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
//     status              TEXT        NOT NULL DEFAULT 'PENDING',
//     entry_triggered_at  TIMESTAMPTZ,
//     closed_at           TIMESTAMPTZ,
//     result              TEXT,
//     return_percent      NUMERIC,
//     scan_source         TEXT        NOT NULL DEFAULT 'homepage',
//     setup_score         NUMERIC,
//     opportunity_score   NUMERIC,
//     reasoning           TEXT
//   );

import sql from "@/lib/db";
import { auth } from "@/auth";
import type { TrackedSetup } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rowToSetup(r: Record<string, unknown>): TrackedSetup {
  return {
    id:                 r.id as string,
    ticker:             r.ticker as string,
    companyName:        r.company_name as string | null,
    pattern:            r.pattern as string,
    confidence:         Number(r.confidence),
    entryPrice:         Number(r.entry_price),
    stopPrice:          Number(r.stop_price),
    targetPrice:        Number(r.target_price),
    createdAt:          r.created_at as string,
    status:             r.status as TrackedSetup["status"],
    entryTriggeredAt:   r.entry_triggered_at as string | null,
    closedAt:           r.closed_at as string | null,
    result:             r.result as "WIN" | "LOSS" | null,
    returnPercent:      r.return_percent != null ? Number(r.return_percent) : null,
    scanSource:         r.scan_source as string,
    setupScore:         r.setup_score != null ? Number(r.setup_score) : null,
    opportunityScore:   r.opportunity_score != null ? Number(r.opportunity_score) : null,
    reasoning:          r.reasoning as string | null,
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  try {
    const body = await req.json() as {
      ticker: string;
      companyName?: string;
      pattern: string;
      confidence?: number;
      entryPrice: number;
      stopPrice: number;
      targetPrice: number;
      rationale?: string;
    };

    // Skip if ticker already PENDING or ACTIVE for this user
    const existing = await sql`
      SELECT id FROM setups
      WHERE user_id = ${userId} AND ticker = ${body.ticker} AND status IN ('PENDING', 'ACTIVE')
      LIMIT 1
    `;
    if (existing.length > 0) return Response.json({ ok: true, skipped: true });

    await sql`
      INSERT INTO setups
        (user_id, ticker, company_name, pattern, confidence,
         entry_price, stop_price, target_price, scan_source, reasoning)
      VALUES
        (${userId}, ${body.ticker}, ${body.companyName ?? null}, ${body.pattern},
         ${body.confidence ?? 0}, ${body.entryPrice}, ${body.stopPrice}, ${body.targetPrice},
         'watchlist', ${body.rationale ?? null})
    `;
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[setups] POST failed:", err);
    return Response.json({ error: "Failed to create setup" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json([], { status: 401 });
  const userId = session.user.id;

  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status");

    let rows: Record<string, unknown>[];
    if (statusParam) {
      const statuses = statusParam.split(",").map((s) => s.trim());
      rows = await sql`
        SELECT * FROM setups
        WHERE user_id = ${userId} AND status = ANY(${statuses})
        ORDER BY created_at DESC
      ` as Record<string, unknown>[];
    } else {
      rows = await sql`
        SELECT * FROM setups
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      ` as Record<string, unknown>[];
    }

    return Response.json(rows.map(rowToSetup));
  } catch (err) {
    console.error("[setups] GET failed:", err);
    return Response.json([], { status: 500 });
  }
}
