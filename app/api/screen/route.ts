import { fetchStockData } from "@/lib/yahoo-finance";
import sql from "@/lib/db";
import { auth } from "@/auth";
import {
  SCAN_UNIVERSE,
  computeIndicators,
  computeReversalIndicators,
  computeMarketRegime,
  assignRSRanks,
  getTopCandidates,
} from "@/lib/screener";
import { analyzeScreenerCandidates } from "@/lib/screener-ai";
import { generateSignals } from "@/lib/pipeline";
import type { CandidateSummary, MarketRegime, ScreenerCandidate } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Sequential OHLCV batch size — keeps Yahoo Finance happy (no rate limiting)
const OHLCV_BATCH_SIZE = 20;
// After scoring + RR filter, pass top N to Gemini
const AI_CANDIDATE_COUNT = 20;

const PATTERN_DISPLAY: Record<string, string> = {
  cup_and_handle:              "Cup & Handle",
  double_bottom:               "Double Bottom",
  bull_flag:                   "Bull Flag",
  consolidation_breakout:      "Consolidation Breakout",
  sma_bounce:                  "SMA Bounce",
  momentum_continuation:       "Momentum Continuation",
  falling_wedge:               "Falling Wedge",
  inverse_head_and_shoulders:  "Inverse H&S",
  none:                        "Momentum Setup",
};

function sse(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(_req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

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
        // Keep last 90 bars per passing ticker for mini charts
        const barsMap = new Map<string, Array<{ t: number; o: number; h: number; l: number; c: number }>>();

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
              if (ind) {
                deepCandidates.push(ind);
                barsMap.set(batches[i][j], r.value.bars.slice(-90).map((b) => ({
                  t: b.time, o: b.open, h: b.high, l: b.low, c: b.close,
                })));
              } else {
                // Try reversal patterns for stocks that failed the trend filter
                const rev = computeReversalIndicators(
                  batches[i][j],
                  r.value.meta.name,
                  r.value.bars,
                  spyReturn60d
                );
                if (rev) {
                  deepCandidates.push(rev);
                  barsMap.set(batches[i][j], r.value.bars.slice(-90).map((b) => ({
                    t: b.time, o: b.open, h: b.high, l: b.low, c: b.close,
                  })));
                }
              }
            }
          }
        }

        console.log(`[Screener] Deep analysis complete: ${SCAN_UNIVERSE.length} fetched, ${deepCandidates.length} passed filters`);

        // Assign RS percentile ranks
        assignRSRanks(deepCandidates);

        const allCandidates = getTopCandidates(deepCandidates, 50, 1.5); // wider — for /setups page
        const aiCandidates  = getTopCandidates(deepCandidates, AI_CANDIDATE_COUNT, 1.8);

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

        const rawPicks = await analyzeScreenerCandidates(aiCandidates, effectiveRegime);

        // Merge pipeline scores + algorithmic signals + pattern name into each AI pick
        const candidateMap = new Map(aiCandidates.map((c) => [c.ticker, c]));
        const picks = rawPicks.map((pick) => {
          const c = candidateMap.get(pick.ticker);
          return {
            ...pick,
            primaryPattern:   c ? (PATTERN_DISPLAY[c.pattern] ?? pick.primaryPattern) : pick.primaryPattern,
            setupScore:       c ? Math.round(c.setupScore)       : 0,
            opportunityScore: c ? Math.round(c.opportunityScore) : 0,
            signals:          c ? generateSignals(c)             : [],
            entry:    c ? +c.entry.toFixed(2)       : pick.entry,
            stopLoss: c ? +c.stopLevel.toFixed(2)   : pick.stopLoss,
            target:   c ? +c.targetLevel.toFixed(2) : pick.target,
            riskReward: c ? +c.riskReward.toFixed(2) : pick.riskReward,
            potentialReturn: c ? +((c.targetLevel - c.entry) / c.entry * 100).toFixed(1) : pick.potentialReturn,
            breakoutLevel: c ? +c.breakoutLevel.toFixed(2) : undefined,
            patternKey: c?.pattern,
            bars: barsMap.get(pick.ticker),
          };
        });

        // Re-rank by algorithmic score so #1 is always the strongest setup
        picks.sort((a, b) =>
          (b.setupScore + b.opportunityScore) - (a.setupScore + a.opportunityScore)
        );

        const candidateSummaries: CandidateSummary[] = allCandidates.map((c) => ({
          ticker: c.ticker, name: c.name, price: c.price,
          pattern: c.pattern,
          primaryPattern: PATTERN_DISPLAY[c.pattern] ?? c.pattern,
          score:            +c.score.toFixed(1),
          setupScore:       +c.setupScore.toFixed(1),
          opportunityScore: +c.opportunityScore.toFixed(1),
          rsi14:            +c.rsi14.toFixed(0),
          volumeRatio:      +c.volumeRatio.toFixed(2),
          riskReward:       +c.riskReward.toFixed(2),
          breakoutDistance: +c.breakoutDistance.toFixed(1),
          potentialReturn:  +((c.targetLevel - c.entry) / c.entry * 100).toFixed(1),
          rsRank:           c.rsRank,
          relativeStrength: +c.relativeStrength.toFixed(1),
          change5d:         +c.change5d.toFixed(1),
          change20d:        +c.change20d.toFixed(1),
          isContracting:    c.isContracting,
          aboveSma50:       c.aboveSma50,
          aboveSma200:      c.aboveSma200,
        }));

        const screenerResult = {
          screenedAt: new Date().toISOString(),
          totalScanned: deepCandidates.length,
          filteredCount: allCandidates.length,
          picks,
          allCandidates: candidateSummaries,
        };

        send({ type: "done", result: screenerResult });

        // Save to top_picks cache (per user — delete only this user's old row)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sql`DELETE FROM top_picks WHERE user_id = ${userId}`
          .then(() => sql`INSERT INTO top_picks (user_id, result, picked_at) VALUES (${userId}, ${sql.json(screenerResult as any)}, now())`)
          .catch(() => { /* non-fatal */ });

        // Auto-save picks as tracked setups (skip tickers already PENDING/ACTIVE for this user)
        try {
          const existingRows = await sql`
            SELECT ticker FROM setups WHERE user_id = ${userId} AND status IN ('PENDING', 'ACTIVE')
          `;
          const tracked = new Set((existingRows as unknown as { ticker: string }[]).map((r) => r.ticker));

          for (const pick of picks) {
            if (!tracked.has(pick.ticker)) {
              await sql`
                INSERT INTO setups
                  (user_id, ticker, company_name, pattern, confidence, entry_price, stop_price, target_price,
                   scan_source, setup_score, opportunity_score, reasoning)
                VALUES
                  (${userId}, ${pick.ticker}, ${pick.companyName}, ${pick.primaryPattern},
                   ${pick.confidence}, ${pick.entry}, ${pick.stopLoss}, ${pick.target},
                   'homepage', ${pick.setupScore ?? null}, ${pick.opportunityScore ?? null},
                   ${pick.reasoning ?? null})
              `;
            }
          }
        } catch (err) {
          console.warn("[Screener] Setup tracking insert failed:", err);
        }

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
