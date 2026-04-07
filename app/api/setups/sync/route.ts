// POST /api/setups/sync — ensure every watchlist stock has a setup row.
// - Stocks with an entry signal → PENDING (with real prices)
// - Stocks without a signal    → WATCHING (placeholder, awaiting AI signal)
// - Upgrades existing WATCHING rows → PENDING when a signal is now found.
// Called on track-record page load.

import sql from "@/lib/db";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  // All watchlist stocks for this user
  const watchlistRows = await sql`
    SELECT ticker, name FROM watchlist
    WHERE user_id = ${userId}
  ` as { ticker: string; name: string }[];

  let created = 0;
  let upgraded = 0;

  await Promise.allSettled(watchlistRows.map(async (row) => {
    try {
      // Check cached analysis in DB (no age restriction — we just need the signal)
      const analysisRows = await sql`
        SELECT result, meta FROM analyses
        WHERE ticker = ${row.ticker} AND timeframe = '1d'
        LIMIT 1
      ` as { result: Record<string, unknown>; meta: Record<string, unknown> }[];

      const analysis   = analysisRows[0];
      const sig        = analysis
        ? (analysis.result?.entrySignal as Record<string, unknown> | undefined)
        : undefined;
      const hasEntry   = sig?.hasEntry === true;

      // Check if there's an existing setup that's already being tracked (beyond WATCHING)
      const existingRows = await sql`
        SELECT id, status FROM setups
        WHERE user_id = ${userId} AND ticker = ${row.ticker}
          AND status IN ('PENDING', 'ACTIVE', 'TARGET_HIT', 'STOP_HIT', 'EXPIRED', 'VOIDED')
        LIMIT 1
      ` as { id: string; status: string }[];
      if (existingRows.length > 0) return; // already has a real tracked setup

      // Check for an existing WATCHING row
      const watchingRows = await sql`
        SELECT id FROM setups
        WHERE user_id = ${userId} AND ticker = ${row.ticker} AND status = 'WATCHING'
        LIMIT 1
      ` as { id: string }[];

      if (hasEntry && watchingRows.length > 0) {
        // Upgrade WATCHING → PENDING with real prices
        const patterns = analysis.result?.patterns as Array<{ type: string; confidenceScore?: number }> | undefined;
        const primaryPattern = patterns?.find((p) => p.type !== "support" && p.type !== "resistance");
        await sql`
          UPDATE setups SET
            status       = 'PENDING',
            pattern      = ${primaryPattern?.type ?? "momentum_continuation"},
            confidence   = ${primaryPattern?.confidenceScore ?? 0},
            entry_price  = ${sig!.entryPrice as number},
            stop_price   = ${sig!.stopLoss as number},
            target_price = ${sig!.target as number},
            reasoning    = ${(sig!.rationale as string) ?? null},
            company_name = ${(analysis.meta?.name as string) ?? row.name}
          WHERE id = ${watchingRows[0].id}
        `;
        upgraded++;
      } else if (hasEntry && watchingRows.length === 0) {
        // No existing row at all — insert as PENDING
        const patterns = analysis!.result?.patterns as Array<{ type: string; confidenceScore?: number }> | undefined;
        const primaryPattern = patterns?.find((p) => p.type !== "support" && p.type !== "resistance");
        await sql`
          INSERT INTO setups
            (user_id, ticker, company_name, pattern, confidence,
             entry_price, stop_price, target_price, scan_source, reasoning)
          VALUES
            (${userId}, ${row.ticker},
             ${(analysis!.meta?.name as string) ?? row.name},
             ${primaryPattern?.type ?? "momentum_continuation"},
             ${primaryPattern?.confidenceScore ?? 0},
             ${sig!.entryPrice as number}, ${sig!.stopLoss as number}, ${sig!.target as number},
             'watchlist', ${(sig!.rationale as string) ?? null})
        `;
        created++;
      } else if (!hasEntry && watchingRows.length === 0) {
        // No signal yet and no row — insert as WATCHING
        await sql`
          INSERT INTO setups
            (user_id, ticker, company_name, pattern, confidence,
             entry_price, stop_price, target_price, scan_source, status)
          VALUES
            (${userId}, ${row.ticker}, ${row.name},
             'watching', 0, 0, 0, 0, 'watchlist', 'WATCHING')
        `;
        created++;
      }
    } catch { /* skip individual failures */ }
  }));

  return Response.json({ ok: true, created, upgraded });
}
