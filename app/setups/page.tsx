"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import AppHeader from "@/components/ui/AppHeader";
import {
  ArrowLeft,
  ArrowUpDown,
  Activity,
  BarChart2,
  Zap,
  ChevronRight,
  Loader2,
  AlertCircle,
  FileStack,
  Check,
} from "lucide-react";
import type { CandidateSummary, ScreenerResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { addToDraftStorage } from "@/hooks/useDraft";

// ─── Sort options ─────────────────────────────────────────────────────────────

type SortKey = "score" | "rsi14" | "riskReward" | "volumeRatio" | "breakoutDistance" | "potentialReturn";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "score",            label: "Score" },
  { key: "riskReward",       label: "R/R" },
  { key: "potentialReturn",  label: "Upside" },
  { key: "breakoutDistance", label: "Breakout" },
  { key: "volumeRatio",      label: "Volume" },
  { key: "rsi14",            label: "RSI" },
];

// ─── Pattern colours ──────────────────────────────────────────────────────────

const PATTERN_COLORS: Record<string, string> = {
  cup_and_handle:             "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  double_bottom:              "bg-sky-500/15 text-sky-400 border-sky-500/30",
  bull_flag:                  "bg-violet-500/15 text-violet-400 border-violet-500/30",
  consolidation_breakout:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  sma_bounce:                 "bg-orange-500/15 text-orange-400 border-orange-500/30",
  momentum_continuation:      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  falling_wedge:              "bg-rose-500/15 text-rose-400 border-rose-500/30",
  inverse_head_and_shoulders: "bg-teal-500/15 text-teal-400 border-teal-500/30",
};

// ─── Unique patterns in dataset ───────────────────────────────────────────────

function uniquePatterns(candidates: CandidateSummary[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (!seen.has(c.pattern)) { seen.add(c.pattern); out.push(c.pattern); }
  }
  return out;
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-[10px] font-medium text-foreground">{Math.round(value)}%</span>
      </div>
      <div className="h-1 rounded-full bg-surface-elevated overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Signal bullets derived from candidate data ───────────────────────────────

function buildSignals(c: CandidateSummary): string[] {
  const s: string[] = [];

  if (c.isContracting)            s.push("Volatility squeeze — coiling for a move");
  if (c.breakoutDistance <= 0)    s.push("Breaking out now");
  else if (c.breakoutDistance < 2) s.push(`${c.breakoutDistance.toFixed(1)}% from breakout level`);
  else if (c.breakoutDistance < 5) s.push(`${c.breakoutDistance.toFixed(1)}% away from breakout`);

  if (c.volumeRatio >= 2)         s.push(`Volume ${c.volumeRatio.toFixed(1)}× above 50-day avg`);
  else if (c.volumeRatio >= 1.4)  s.push(`Volume ${c.volumeRatio.toFixed(1)}× above average`);

  if (c.rsRank >= 90)             s.push(`Top 10% relative strength (rank ${c.rsRank})`);
  else if (c.rsRank >= 75)        s.push(`Top 25% relative strength (rank ${c.rsRank})`);

  if (c.rsi14 >= 52 && c.rsi14 <= 70) s.push(`RSI ${Math.round(c.rsi14)} — momentum zone`);
  else if (c.rsi14 > 70)          s.push(`RSI ${Math.round(c.rsi14)} — extended, watch for pullback`);
  else if (c.rsi14 < 35)          s.push(`RSI ${Math.round(c.rsi14)} — oversold, reversal potential`);

  if (c.change5d >= 4)            s.push(`+${c.change5d.toFixed(1)}% this week`);
  else if (c.change20d >= 8)      s.push(`+${c.change20d.toFixed(1)}% this month`);

  return s.slice(0, 3);
}

// ─── Candidate card ───────────────────────────────────────────────────────────

function CandidateCard({ c }: { c: CandidateSummary }) {
  const patternColor = PATTERN_COLORS[c.pattern] ?? "bg-surface-elevated text-muted-foreground border-border";
  const signals = buildSignals(c);
  const [draftState, setDraftState] = useState<"idle" | "added">("idle");

  function handleAddToDraft() {
    addToDraftStorage(c.ticker, c.name);
    setDraftState("added");
  }

  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4 flex flex-col gap-3 hover:border-accent/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-foreground">{c.ticker}</span>
            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold border", patternColor)}>
              {c.primaryPattern}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-muted-foreground">Score</p>
          <p className="text-xl font-bold text-foreground">{Math.round(c.score)}</p>
        </div>
      </div>

      {/* Score bars */}
      <div className="space-y-1.5">
        <ScoreBar label="Setup Quality" value={c.setupScore} color="bg-accent" />
        <ScoreBar label="Opportunity" value={c.opportunityScore} color="bg-bull" />
      </div>

      {/* Why this stock */}
      {signals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {signals.map((sig) => (
            <span key={sig} className="text-[11px] px-2 py-0.5 rounded bg-surface-elevated text-muted-foreground border border-border/60">
              {sig}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border mt-auto">
        <span className="text-xs text-muted-foreground">${c.price.toFixed(2)}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddToDraft}
            className={cn(
              "flex items-center gap-1 text-xs font-medium border px-3 py-1.5 rounded-lg transition-all flex-1 justify-center",
              draftState === "added"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 cursor-default"
                : "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
            )}
            title={draftState === "added" ? "Added to draft" : "Add to draft"}
          >
            {draftState === "added" ? <Check className="w-3 h-3" /> : <FileStack className="w-3 h-3" />}
            {draftState === "added" ? "Added" : "Add to Draft"}
          </button>
          <Link
            href={`/app?ticker=${c.ticker}`}
            className="flex items-center gap-1 text-xs font-medium border border-border px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            Analyze Chart →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SetupsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScreenerResult | null>(null);
  const [pickedAt, setPickedAt] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [patternFilter, setPatternFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/top-picks")
      .then((r) => r.json())
      .then(({ result, pickedAt }) => {
        setResult(result);
        setPickedAt(pickedAt);
      })
      .catch(() => setError("Failed to load setups"))
      .finally(() => setLoading(false));
  }, []);

  const candidates = (result?.allCandidates ?? []).filter((c) => c.score >= 70);
  const patterns = useMemo(() => uniquePatterns(candidates), [candidates]);

  const sorted = useMemo(() => {
    const filtered = patternFilter
      ? candidates.filter((c) => c.pattern === patternFilter)
      : candidates;

    return [...filtered].sort((a, b) => {
      if (sortKey === "breakoutDistance") return a[sortKey] - b[sortKey]; // lower = closer
      return b[sortKey] - a[sortKey];
    });
  }, [candidates, sortKey, patternFilter]);

  const dateLabel = pickedAt
    ? new Date(pickedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader activePage="home" />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Home
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 rounded-xl bg-accent/10 border border-accent/20">
                <BarChart2 className="w-5 h-5 text-accent" />
              </div>
              All Setups
            </h1>
            {dateLabel && (
              <p className="text-sm text-muted-foreground mt-1 ml-14">
                Scanned {dateLabel} · {result?.totalScanned ?? 0} stocks · {candidates.length} setups
              </p>
            )}
          </div>

          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Zap className="w-4 h-4 text-accent" />
            View Top 3 Picks
          </Link>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading setups…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <AlertCircle className="w-8 h-8" />
            <p>{error}</p>
            <Link href="/" className="text-accent text-sm hover:underline">Back to home</Link>
          </div>
        )}

        {/* No data */}
        {!loading && !error && candidates.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="p-3 rounded-full border border-border bg-surface">
              <Activity className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-1">No setups cached yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                The home page will automatically run a fresh scan and populate this page.
              </p>
            </div>
            <Link
              href="/"
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-accent/30 bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
            >
              <Zap className="w-4 h-4" /> Go to Home Page
            </Link>
          </div>
        )}

        {/* Controls + grid */}
        {!loading && candidates.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {/* Sort */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <ArrowUpDown className="w-3.5 h-3.5" /> Sort:
                </span>
                {SORT_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setSortKey(key)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                      sortKey === key
                        ? "bg-accent/20 border-accent/40 text-accent"
                        : "bg-surface border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Pattern filter */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground shrink-0">Pattern:</span>
                <button
                  onClick={() => setPatternFilter(null)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                    patternFilter === null
                      ? "bg-accent/20 border-accent/40 text-accent"
                      : "bg-surface border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated",
                  )}
                >
                  All
                </button>
                {patterns.map((p) => {
                  const label = candidates.find((c) => c.pattern === p)?.primaryPattern ?? p;
                  return (
                    <button
                      key={p}
                      onClick={() => setPatternFilter(p === patternFilter ? null : p)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                        patternFilter === p
                          ? cn("border", PATTERN_COLORS[p] ?? "bg-accent/20 border-accent/40 text-accent")
                          : "bg-surface border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-muted-foreground -mt-2">
              Showing {sorted.length} of {candidates.length} setups
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sorted.map((c) => (
                <CandidateCard key={c.ticker} c={c} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
