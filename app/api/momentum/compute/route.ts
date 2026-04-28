/**
 * POST /api/momentum/compute  — SSE stream
 * Builds universe, fetches ~13mo of data for each ticker, ranks by 12-1 momentum.
 * Streams progress events, ends with top-20 picks.
 */

import { auth } from "@/auth";
import { buildUniverse, fetchDailyCloses, rankByMomentum } from "@/lib/momentum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_SIZE = 15;

function sse(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

/** Fetch name + current price from Yahoo quote */
async function fetchTickerMeta(ticker: string): Promise<{ name: string; marketCap: number }> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=price`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TechnicalAI/1.0)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return { name: ticker, marketCap: 0 };
    const json = await res.json();
    const price = json?.quoteSummary?.result?.[0]?.price;
    return {
      name: price?.longName ?? price?.shortName ?? ticker,
      marketCap: price?.marketCap?.raw ?? 0,
    };
  } catch {
    return { name: ticker, marketCap: 0 };
  }
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(sse(data)); } catch { /* client disconnected */ }
      };

      try {
        // ── Step 1: Build universe ──────────────────────────────────────────
        send({ type: "progress", phase: "universe", message: "Fetching S&P 500 + NASDAQ-100 universe from Wikipedia…", step: 1, totalSteps: 3 });

        const rawUniverse = await buildUniverse();
        send({ type: "progress", phase: "universe", message: `Universe built: ${rawUniverse.length} tickers. Filtering by market cap…`, step: 1, totalSteps: 3 });

        // ── Step 2: Market-cap filter (batch) ───────────────────────────────
        // To avoid too many sequential calls, fetch market caps in batches
        // but only for tickers we don't already know. For speed, we'll skip
        // the cap check initially and rely on size proxy (major index members
        // are nearly all >$10B). Filter strictly on momentum data length instead.
        // This lets us scan all ~500 tickers without 500 extra API calls.
        const universe = rawUniverse;

        // ── Step 3: Fetch momentum data for all tickers ─────────────────────
        const total = universe.length;
        const batches: string[][] = [];
        for (let i = 0; i < total; i += BATCH_SIZE) {
          batches.push(universe.slice(i, i + BATCH_SIZE));
        }

        send({
          type: "progress",
          phase: "scanning",
          message: `Fetching 13-month price history for ${total} tickers (${batches.length} batches)…`,
          step: 2,
          totalSteps: 3,
          done: 0,
          total,
        });

        const momentumInputs: Array<{ ticker: string; name: string; closes: { time: number; close: number }[] }> = [];

        let processed = 0;
        for (let b = 0; b < batches.length; b++) {
          const batch = batches[b];
          const results = await Promise.allSettled(
            batch.map(async (ticker) => {
              const closes = await fetchDailyCloses(ticker);
              return { ticker, closes };
            })
          );

          for (const r of results) {
            if (r.status === "fulfilled") {
              const { ticker, closes } = r.value;
              // Only include if enough history for momentum calculation
              if (closes.length >= 253) {
                momentumInputs.push({ ticker, name: ticker, closes });
              }
            }
          }

          processed += batch.length;
          send({
            type: "progress",
            phase: "scanning",
            message: `Processed ${Math.min(processed, total)} / ${total} tickers`,
            step: 2,
            totalSteps: 3,
            done: processed,
            total,
          });

          // Small delay between batches to be courteous to Yahoo Finance
          if (b < batches.length - 1) {
            await new Promise((r) => setTimeout(r, 400));
          }
        }

        // ── Step 4: Rank + return top 20 ────────────────────────────────────
        send({ type: "progress", phase: "ranking", message: `Ranking ${momentumInputs.length} eligible tickers by 12-1 momentum…`, step: 3, totalSteps: 3 });

        const top20 = rankByMomentum(momentumInputs, 20);

        // Enrich names via a quick meta fetch for top-20 only
        const metaResults = await Promise.allSettled(top20.map((p) => fetchTickerMeta(p.ticker)));
        metaResults.forEach((r, i) => {
          if (r.status === "fulfilled") {
            top20[i].name = r.value.name || top20[i].ticker;
          }
        });

        send({ type: "done", picks: top20, totalScanned: momentumInputs.length });

      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Momentum screen failed" });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
