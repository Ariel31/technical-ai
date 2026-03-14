/**
 * Daily AI scan script — runs the full screener pipeline and saves the results
 * to the `top_picks` table as the special "system" user (shared by all users).
 *
 * Run locally:
 *   DATABASE_URL=... GEMINI_API_KEY=... npx tsx scripts/run-scan.ts
 *
 * In production this is triggered by GitHub Actions on a daily schedule.
 */

import { fetchStockData } from "../lib/yahoo-finance";
import sql from "../lib/db";
import {
  SCAN_UNIVERSE,
  computeIndicators,
  computeReversalIndicators,
  computeMarketRegime,
  assignRSRanks,
  getTopCandidates,
} from "../lib/screener";
import { analyzeScreenerCandidates } from "../lib/screener-ai";
import { generateSignals } from "../lib/pipeline";
import type { MarketRegime, ScreenerCandidate } from "../lib/types";

const OHLCV_BATCH_SIZE = 20;
const AI_CANDIDATE_COUNT = 20;
const SYSTEM_USER_ID = "system";

const PATTERN_DISPLAY: Record<string, string> = {
  cup_and_handle:             "Cup & Handle",
  double_bottom:              "Double Bottom",
  bull_flag:                  "Bull Flag",
  consolidation_breakout:     "Consolidation Breakout",
  sma_bounce:                 "SMA Bounce",
  momentum_continuation:      "Momentum Continuation",
  falling_wedge:              "Falling Wedge",
  inverse_head_and_shoulders: "Inverse H&S",
  none:                       "Momentum Setup",
};

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function main() {
  log(`Starting daily scan of ${SCAN_UNIVERSE.length} stocks…`);

  // ── Phase 1: Market regime (SPY) ──────────────────────────────────────────
  let regime: MarketRegime | null = null;
  try {
    const spyData = await fetchStockData({ ticker: "SPY", timeframe: "1d", bars: 200 });
    regime = computeMarketRegime(spyData.bars);
    if (regime) log(`Market regime: ${regime.note}`);
  } catch (err) {
    console.warn("SPY fetch failed:", err);
  }

  const spyReturn60d = regime?.return60d ?? 0;

  // ── Phase 2: OHLCV for all stocks ─────────────────────────────────────────
  const deepCandidates: ScreenerCandidate[] = [];
  const barsMap = new Map<string, Array<{ t: number; o: number; h: number; l: number; c: number }>>();

  const batches: string[][] = [];
  for (let i = 0; i < SCAN_UNIVERSE.length; i += OHLCV_BATCH_SIZE) {
    batches.push(SCAN_UNIVERSE.slice(i, i + OHLCV_BATCH_SIZE));
  }

  for (let i = 0; i < batches.length; i++) {
    log(`Batch ${i + 1}/${batches.length}: stocks ${i * OHLCV_BATCH_SIZE + 1}–${Math.min((i + 1) * OHLCV_BATCH_SIZE, SCAN_UNIVERSE.length)}`);

    const results = await Promise.allSettled(
      batches[i].map((ticker) =>
        fetchStockData({ ticker, timeframe: "1d", bars: 200 })
      )
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled") {
        const ind = computeIndicators(batches[i][j], r.value.meta.name, r.value.bars, spyReturn60d);
        if (ind) {
          deepCandidates.push(ind);
          barsMap.set(batches[i][j], r.value.bars.slice(-90).map((b) => ({
            t: b.time, o: b.open, h: b.high, l: b.low, c: b.close,
          })));
        } else {
          const rev = computeReversalIndicators(batches[i][j], r.value.meta.name, r.value.bars, spyReturn60d);
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

  log(`Deep analysis complete: ${deepCandidates.length} candidates passed filters`);

  assignRSRanks(deepCandidates);
  const aiCandidates = getTopCandidates(deepCandidates, AI_CANDIDATE_COUNT, 1.8);

  // ── Phase 3: AI ranking ───────────────────────────────────────────────────
  log(`AI ranking top ${aiCandidates.length} setups…`);

  const effectiveRegime: MarketRegime = regime ?? {
    spyPrice: 0, spySma200: 0, aboveSma200: true,
    trend: "sideways", return60d: 0, note: "Market regime unavailable",
  };

  const rawPicks = await analyzeScreenerCandidates(aiCandidates, effectiveRegime);

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

  picks.sort((a, b) => (b.setupScore + b.opportunityScore) - (a.setupScore + a.opportunityScore));

  const screenerResult = {
    screenedAt:    new Date().toISOString(),
    totalScanned:  deepCandidates.length,
    filteredCount: aiCandidates.length,
    picks,
  };

  // ── Save to DB ────────────────────────────────────────────────────────────
  log("Saving results to database…");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql`DELETE FROM top_picks WHERE user_id = ${SYSTEM_USER_ID}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql`INSERT INTO top_picks (user_id, result, picked_at) VALUES (${SYSTEM_USER_ID}, ${sql.json(screenerResult as any)}, now())`;

  log(`Done. Saved ${picks.length} picks (${picks.map((p) => p.ticker).join(", ")})`);

  // Close the DB connection so the process exits cleanly
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Scan failed:", err);
  process.exit(1);
});
