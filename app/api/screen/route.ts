import { fetchStockData } from "@/lib/yahoo-finance";
import {
  SCAN_UNIVERSE,
  computeIndicators,
  computeMarketRegime,
  assignRSRanks,
  getTopCandidates,
} from "@/lib/screener";
import { analyzeScreenerCandidates } from "@/lib/screener-ai";
import type { MarketRegime, ScreenerCandidate } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sequential OHLCV batch size — keeps Yahoo Finance happy (no rate limiting)
const OHLCV_BATCH_SIZE = 12;
// After scoring + RR filter, pass top N to Gemini
const AI_CANDIDATE_COUNT = 12;

function sse(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST() {
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(sse(data)); } catch { /* client disconnected */ }
      };

      try {
        // ── Phase 1: Market regime (SPY) + begin scan notification ────────────
        send({
          type: "progress",
          phase: "scanning",
          message: `Starting scan of ${SCAN_UNIVERSE.length} liquid stocks…`,
          step: 1,
          totalSteps: 3,
        });

        // Fetch SPY in parallel with the first OHLCV batch
        let regime: MarketRegime | null = null;
        try {
          const spyData = await fetchStockData({ ticker: "SPY", timeframe: "1d", bars: 200 });
          regime = computeMarketRegime(spyData.bars);
          if (regime) {
            send({
              type: "progress",
              phase: "scanning",
              message: `Market regime: ${regime.note}`,
              step: 1,
              totalSteps: 3,
            });
          }
        } catch (err) {
          console.warn("[Screener] SPY fetch failed:", err);
        }

        const spyReturn60d = regime?.return60d ?? 0;

        // ── Phase 2: OHLCV for all scan universe stocks ───────────────────────
        const deepCandidates: ScreenerCandidate[] = [];

        const batches: string[][] = [];
        for (let i = 0; i < SCAN_UNIVERSE.length; i += OHLCV_BATCH_SIZE) {
          batches.push(SCAN_UNIVERSE.slice(i, i + OHLCV_BATCH_SIZE));
        }

        for (let i = 0; i < batches.length; i++) {
          send({
            type: "progress",
            phase: "scanning",
            message: `Analysing stocks ${i * OHLCV_BATCH_SIZE + 1}–${Math.min((i + 1) * OHLCV_BATCH_SIZE, SCAN_UNIVERSE.length)} of ${SCAN_UNIVERSE.length}`,
            step: 2,
            totalSteps: 3,
            batch: i + 1,
            totalBatches: batches.length,
          });

          const results = await Promise.allSettled(
            batches[i].map((ticker) =>
              fetchStockData({ ticker, timeframe: "1d", bars: 200 })
            )
          );

          for (let j = 0; j < results.length; j++) {
            const r = results[j];
            if (r.status === "fulfilled") {
              const ind = computeIndicators(
                batches[i][j],
                r.value.meta.name,
                r.value.bars,
                spyReturn60d
              );
              if (ind) deepCandidates.push(ind);
            } else {
              console.warn(`[Screener] OHLCV failed for ${batches[i][j]}:`, r.reason);
            }
          }
        }

        console.log(`[Screener] Deep analysis complete: ${deepCandidates.length}/${SCAN_UNIVERSE.length} stocks`);

        // Assign RS percentile ranks
        assignRSRanks(deepCandidates);

        // Filter RR ≥ 1.8, sort by weighted score, top 12
        const aiCandidates = getTopCandidates(deepCandidates, AI_CANDIDATE_COUNT, 1.8);

        // ── Phase 3: AI picks top 3 ───────────────────────────────────────────
        send({
          type: "progress",
          phase: "analyzing",
          message: `AI ranking top ${aiCandidates.length} setups…`,
          step: 3,
          totalSteps: 3,
        });

        const effectiveRegime: MarketRegime = regime ?? {
          spyPrice: 0,
          spySma200: 0,
          aboveSma200: true,
          trend: "sideways",
          return60d: 0,
          note: "Market regime unavailable",
        };

        const picks = await analyzeScreenerCandidates(aiCandidates, effectiveRegime);

        send({
          type: "done",
          result: {
            screenedAt: new Date().toISOString(),
            totalScanned: deepCandidates.length,
            filteredCount: aiCandidates.length,
            picks,
          },
        });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Screener failed",
        });
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
