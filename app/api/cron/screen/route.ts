// GET /api/cron/screen
// Called by Vercel Cron daily after market close (Mon–Fri).
// Protected by CRON_SECRET — Vercel automatically sends:
//   Authorization: Bearer <CRON_SECRET>
// Runs the full screener scan and saves results to top_picks under user_id='system'.

import sql from "@/lib/db";
import { fetchStockData } from "@/lib/yahoo-finance";
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

const OHLCV_BATCH_SIZE = 20;
const AI_CANDIDATE_COUNT = 20;

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

export async function GET(request: Request) {
  const isDev = process.env.NODE_ENV === "development";
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!isDev && (!cronSecret || authHeader !== `Bearer ${cronSecret}`)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── Market regime ──────────────────────────────────────────────────────────
    let regime: MarketRegime | null = null;
    try {
      const spyData = await fetchStockData({ ticker: "SPY", timeframe: "1d", bars: 200 });
      regime = computeMarketRegime(spyData.bars);
    } catch { /* skip — non-fatal */ }

    const spyReturn60d = regime?.return60d ?? 0;

    // ── OHLCV scan ─────────────────────────────────────────────────────────────
    const deepCandidates: ScreenerCandidate[] = [];
    const barsMap = new Map<string, Array<{ t: number; o: number; h: number; l: number; c: number }>>();

    const batches: string[][] = [];
    for (let i = 0; i < SCAN_UNIVERSE.length; i += OHLCV_BATCH_SIZE) {
      batches.push(SCAN_UNIVERSE.slice(i, i + OHLCV_BATCH_SIZE));
    }

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map((ticker) => fetchStockData({ ticker, timeframe: "1d", bars: 200 }))
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status !== "fulfilled") continue;
        const ind = computeIndicators(batch[j], r.value.meta.name, r.value.bars, spyReturn60d);
        if (ind) {
          deepCandidates.push(ind);
          barsMap.set(batch[j], r.value.bars.slice(-90).map((b) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close })));
        } else {
          const rev = computeReversalIndicators(batch[j], r.value.meta.name, r.value.bars, spyReturn60d);
          if (rev) {
            deepCandidates.push(rev);
            barsMap.set(batch[j], r.value.bars.slice(-90).map((b) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close })));
          }
        }
      }
    }

    assignRSRanks(deepCandidates);
    const allCandidates = getTopCandidates(deepCandidates, 50, 1.5);
    const aiCandidates  = getTopCandidates(deepCandidates, AI_CANDIDATE_COUNT, 1.8);

    // ── AI ranking ─────────────────────────────────────────────────────────────
    const effectiveRegime: MarketRegime = regime ?? {
      spyPrice: 0, spySma200: 0, aboveSma200: true, trend: "sideways", return60d: 0,
      note: "Market regime unavailable",
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
        entry:            c ? +c.entry.toFixed(2)            : pick.entry,
        stopLoss:         c ? +c.stopLevel.toFixed(2)        : pick.stopLoss,
        target:           c ? +c.targetLevel.toFixed(2)      : pick.target,
        riskReward:       c ? +c.riskReward.toFixed(2)       : pick.riskReward,
        potentialReturn:  c ? +((c.targetLevel - c.entry) / c.entry * 100).toFixed(1) : pick.potentialReturn,
        breakoutLevel:    c ? +c.breakoutLevel.toFixed(2)    : undefined,
        patternKey:       c?.pattern,
        bars:             barsMap.get(pick.ticker),
      };
    });

    picks.sort((a, b) => (b.setupScore + b.opportunityScore) - (a.setupScore + a.opportunityScore));

    const candidateSummaries: CandidateSummary[] = allCandidates.map((c) => ({
      ticker: c.ticker, name: c.name, price: c.price,
      pattern: c.pattern,
      primaryPattern:   PATTERN_DISPLAY[c.pattern] ?? c.pattern,
      score:            +c.score.toFixed(1),
      setupScore:       +c.setupScore.toFixed(1),
      opportunityScore: +c.opportunityScore.toFixed(1),
      rsi14:            +c.rsi14.toFixed(0),
      volumeRatio:      +c.volumeRatio.toFixed(2),
      entry:            +c.entry.toFixed(2),
      stopLoss:         +c.stopLevel.toFixed(2),
      target:           +c.targetLevel.toFixed(2),
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
      screenedAt:   new Date().toISOString(),
      totalScanned: deepCandidates.length,
      filteredCount: allCandidates.length,
      picks,
      allCandidates: candidateSummaries,
    };

    // ── Save to DB under 'system' user ────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sql`DELETE FROM top_picks WHERE user_id = 'system'`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sql`INSERT INTO top_picks (user_id, result, picked_at) VALUES ('system', ${sql.json(screenerResult as any)}, now())`;

    console.log(`[cron/screen] Done. ${picks.length} picks saved. ${deepCandidates.length} stocks scanned.`);
    return Response.json({ ok: true, picks: picks.length, scanned: deepCandidates.length });
  } catch (err) {
    console.error("[cron/screen] Failed:", err);
    return Response.json({ error: "Scan failed" }, { status: 500 });
  }
}
