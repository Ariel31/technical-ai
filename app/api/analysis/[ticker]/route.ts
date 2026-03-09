import sql from "@/lib/db";
import type { CachedAnalysis } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();

  const rows = await sql`
    SELECT ticker, timeframe, analyzed_at, bars, result, meta
    FROM analyses
    WHERE ticker = ${ticker} AND timeframe = '1d'
    LIMIT 1
  `;

  if (rows.length === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const row = rows[0];
  return Response.json({
    ticker: row.ticker,
    timeframe: row.timeframe,
    analyzedAt: row.analyzed_at,
    bars: row.bars,
    result: row.result,
    meta: row.meta,
  } satisfies CachedAnalysis);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();

  const body = await req.json();
  const { timeframe = "1d", bars, result, meta } = body;

  await sql`
    INSERT INTO analyses (ticker, timeframe, bars, result, meta, analyzed_at)
    VALUES (${ticker}, ${timeframe}, ${sql.json(bars)}, ${sql.json(result)}, ${sql.json(meta)}, now())
    ON CONFLICT (ticker, timeframe)
    DO UPDATE SET
      bars        = EXCLUDED.bars,
      result      = EXCLUDED.result,
      meta        = EXCLUDED.meta,
      analyzed_at = now()
  `;

  return Response.json({ ok: true });
}
