// POST /api/setups/sync — create setup rows for all watchlist stocks that have an entry signal
// Called on track-record page load to ensure setups are up to date

import sql from "@/lib/db";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  // Get all done watchlist items for this user
  const watchlistRows = await sql`
    SELECT ticker, name FROM watchlist
    WHERE user_id = ${userId} AND status = 'done'
  ` as { ticker: string; name: string }[];

  let created = 0;

  await Promise.allSettled(watchlistRows.map(async (row) => {
    try {
      // Load cached analysis
      const analysisRows = await sql`
        SELECT result, meta FROM analyses
        WHERE ticker = ${row.ticker} AND timeframe = '1d'
        LIMIT 1
      ` as { result: Record<string, unknown>; meta: Record<string, unknown> }[];

      if (analysisRows.length === 0) return;

      const { result, meta } = analysisRows[0];
      const sig = (result as Record<string, unknown>)?.entrySignal as Record<string, unknown> | undefined;
      if (!sig?.hasEntry) return;

      // Skip if already PENDING or ACTIVE
      const existing = await sql`
        SELECT id FROM setups
        WHERE user_id = ${userId} AND ticker = ${row.ticker} AND status IN ('PENDING', 'ACTIVE')
        LIMIT 1
      `;
      if (existing.length > 0) return;

      const patterns = (result as Record<string, unknown>)?.patterns as Array<{ type: string; confidenceScore?: number }> | undefined;
      const primaryPattern = patterns?.find(
        (p) => p.type !== "support" && p.type !== "resistance"
      );

      await sql`
        INSERT INTO setups
          (user_id, ticker, company_name, pattern, confidence,
           entry_price, stop_price, target_price, scan_source, reasoning)
        VALUES
          (${userId}, ${row.ticker}, ${(meta as Record<string, unknown>)?.name as string ?? row.name},
           ${primaryPattern?.type ?? "momentum_continuation"},
           ${primaryPattern?.confidenceScore ?? 0},
           ${sig.entryPrice as number}, ${sig.stopLoss as number}, ${sig.target as number},
           'watchlist', ${(sig.rationale as string) ?? null})
      `;
      created++;
    } catch { /* skip individual failures */ }
  }));

  return Response.json({ ok: true, created });
}
