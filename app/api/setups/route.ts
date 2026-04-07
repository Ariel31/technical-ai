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
    id:                         r.id as string,
    ticker:                     r.ticker as string,
    companyName:                r.company_name as string | null,
    pattern:                    r.pattern as string,
    confidence:                 Number(r.confidence),
    entryPrice:                 Number(r.entry_price),
    stopPrice:                  Number(r.stop_price),
    targetPrice:                Number(r.target_price),
    createdAt:                  r.created_at as string,
    status:                     r.status as TrackedSetup["status"],
    entryTriggeredAt:           r.entry_triggered_at as string | null,
    closedAt:                   r.closed_at as string | null,
    result:                     r.result as "WIN" | "LOSS" | "VOIDED" | null,
    returnPercent:              r.return_percent != null ? Number(r.return_percent) : null,
    scanSource:                 r.scan_source as string,
    setupScore:                 r.setup_score != null ? Number(r.setup_score) : null,
    opportunityScore:           r.opportunity_score != null ? Number(r.opportunity_score) : null,
    reasoning:                  r.reasoning as string | null,
    direction:                  (r.direction as "long" | "short") ?? "long",
    fittedPrice:                r.fitted_price != null ? Number(r.fitted_price) : null,
    patternInvalidationLevel:   r.pattern_invalidation_level != null ? Number(r.pattern_invalidation_level) : null,
    keyLevels:                  r.key_levels ? (r.key_levels as { supports: number[]; resistances: number[] }) : null,
    validityState:              (r.validity_state as import("@/lib/types").ValidityState) ?? "Active",
    aiValidationNote:           r.ai_validation_note as string | null,
    lastCheckedAt:              r.last_checked_at as string | null,
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
      direction?: "long" | "short";
      fittedPrice?: number;
      patternInvalidationLevel?: number;
      keyLevels?: { supports: number[]; resistances: number[] };
    };

    // If ACTIVE or closed, skip entirely
    const closedExisting = await sql`
      SELECT id FROM setups
      WHERE user_id = ${userId} AND ticker = ${body.ticker}
        AND status IN ('ACTIVE', 'TARGET_HIT', 'STOP_HIT', 'EXPIRED', 'VOIDED')
      LIMIT 1
    `;
    if (closedExisting.length > 0) return Response.json({ ok: true, skipped: true });

    // If PENDING and we have a new signal, keep prices in sync with latest AI analysis
    const pendingExisting = await sql`
      SELECT id FROM setups
      WHERE user_id = ${userId} AND ticker = ${body.ticker} AND status = 'PENDING'
      LIMIT 1
    ` as { id: string }[];
    const hasSignal = body.entryPrice && body.entryPrice > 0;

    if (pendingExisting.length > 0 && hasSignal) {
      await sql`
        UPDATE setups SET
          entry_price  = ${body.entryPrice},
          stop_price   = ${body.stopPrice},
          target_price = ${body.targetPrice},
          pattern      = ${body.pattern},
          confidence   = ${body.confidence ?? 0},
          reasoning    = ${body.rationale ?? null},
          company_name = COALESCE(${body.companyName ?? null}, company_name),
          direction    = ${body.direction ?? 'long'},
          fitted_price = ${body.fittedPrice ?? null},
          pattern_invalidation_level = ${body.patternInvalidationLevel ?? null},
          key_levels   = ${body.keyLevels ? sql.json(body.keyLevels) : null}
        WHERE id = ${pendingExisting[0].id}
      `;
      return Response.json({ ok: true, synced: true });
    }

    if (pendingExisting.length > 0 && !hasSignal) {
      // Lost the signal — downgrade back to WATCHING
      await sql`
        UPDATE setups SET status = 'WATCHING', entry_price = 0, stop_price = 0, target_price = 0
        WHERE id = ${pendingExisting[0].id}
      `;
      return Response.json({ ok: true, downgraded: true });
    }

    // If body has a real entry signal, check if we should upgrade a WATCHING row
    const watchingExisting = await sql`
      SELECT id FROM setups
      WHERE user_id = ${userId} AND ticker = ${body.ticker} AND status = 'WATCHING'
      LIMIT 1
    ` as { id: string }[];

    if (watchingExisting.length > 0 && hasSignal) {
      // Upgrade WATCHING → PENDING
      await sql`
        UPDATE setups SET
          status       = 'PENDING',
          pattern      = ${body.pattern},
          confidence   = ${body.confidence ?? 0},
          entry_price  = ${body.entryPrice},
          stop_price   = ${body.stopPrice},
          target_price = ${body.targetPrice},
          reasoning    = ${body.rationale ?? null},
          company_name = ${body.companyName ?? null},
          direction    = ${body.direction ?? 'long'},
          fitted_price = ${body.fittedPrice ?? null},
          pattern_invalidation_level = ${body.patternInvalidationLevel ?? null},
          key_levels   = ${body.keyLevels ? sql.json(body.keyLevels) : null}
        WHERE id = ${watchingExisting[0].id}
      `;
      return Response.json({ ok: true, upgraded: true });
    }

    if (watchingExisting.length > 0 && !hasSignal) {
      // Still no signal — keep WATCHING as is
      return Response.json({ ok: true, skipped: true });
    }

    // No existing row — insert (WATCHING if no signal, PENDING if signal)
    const status = hasSignal ? 'PENDING' : 'WATCHING';
    await sql`
      INSERT INTO setups
        (user_id, ticker, company_name, pattern, confidence,
         entry_price, stop_price, target_price, scan_source, reasoning,
         direction, fitted_price, pattern_invalidation_level, key_levels, status)
      VALUES
        (${userId}, ${body.ticker}, ${body.companyName ?? null}, ${body.pattern ?? 'watching'},
         ${body.confidence ?? 0}, ${body.entryPrice ?? 0}, ${body.stopPrice ?? 0}, ${body.targetPrice ?? 0},
         'watchlist', ${body.rationale ?? null},
         ${body.direction ?? 'long'}, ${body.fittedPrice ?? null},
         ${body.patternInvalidationLevel ?? null},
         ${body.keyLevels ? sql.json(body.keyLevels) : null},
         ${status})
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

    // Only return setups for tickers currently in the user's watchlist —
    // removing a stock from the watchlist removes it from the track record too.
    let rows: Record<string, unknown>[];
    if (statusParam) {
      const statuses = statusParam.split(",").map((s) => s.trim());
      rows = await sql`
        SELECT s.* FROM setups s
        INNER JOIN watchlist w ON w.user_id = s.user_id AND w.ticker = s.ticker
        WHERE s.user_id = ${userId} AND s.scan_source = 'watchlist' AND s.status = ANY(${statuses})
        ORDER BY s.created_at DESC
      ` as Record<string, unknown>[];
    } else {
      rows = await sql`
        SELECT s.* FROM setups s
        INNER JOIN watchlist w ON w.user_id = s.user_id AND w.ticker = s.ticker
        WHERE s.user_id = ${userId} AND s.scan_source = 'watchlist'
        ORDER BY s.created_at DESC
      ` as Record<string, unknown>[];
    }

    return Response.json(rows.map(rowToSetup));
  } catch (err) {
    console.error("[setups] GET failed:", err);
    return Response.json([], { status: 500 });
  }
}
