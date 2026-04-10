"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import AppHeader from "@/components/ui/AppHeader";

const MiniChart = dynamic(() => import("@/components/ui/MiniChart"), { ssr: false });
import {
  Activity,
  ArrowRight,
  Zap,
  RefreshCw,
  Clock,
  BarChart2,
  Loader2,
  ChevronRight,
  Sparkles,
  AlertCircle,
  Trophy,
  FileStack,
  Check,
  ListFilter,
  X,
} from "lucide-react";
import { useSession } from "next-auth/react";
import type { HotSectorResult, MarketSentiment, ScreenerPick, ScreenerResult, ScreenerStatus, TrackRecordStats } from "@/lib/types";
import { cn } from "@/lib/utils";
import { addToDraftStorage } from "@/hooks/useDraft";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ago`;
  if (h > 0) return `${h}h ${m}m ago`;
  return m === 0 ? "just now" : `${m}m ago`;
}

// ─── SSE scan hook ────────────────────────────────────────────────────────────

interface ScanProgress {
  message: string;
  step: number;
  totalSteps: number;
  batch: number;
  totalBatches: number;
}

function useScan() {
  const queryClient = useQueryClient();

  // ── Daily scan state ────────────────────────────────────────────────────
  const [dailyStatus,   setDailyStatus]   = useState<ScreenerStatus>("idle");
  const [dailyScanResult, setDailyScanResult] = useState<ScreenerResult | null>(null);
  const [dailyScanPickedAt, setDailyScanPickedAt] = useState<string | null>(null);
  const [dailyError,    setDailyError]    = useState("");

  // ── Custom scan state ───────────────────────────────────────────────────
  const [customStatus,   setCustomStatus]   = useState<ScreenerStatus>("idle");
  const [customResult,   setCustomResult]   = useState<ScreenerResult | null>(null);
  const [customPickedAt, setCustomPickedAt] = useState<string | null>(null);
  const [customError,    setCustomError]    = useState("");

  // Shared progress (only one scan runs at a time)
  const [progress, setProgress] = useState<ScanProgress>({ message: "", step: 0, totalSteps: 3, batch: 0, totalBatches: 0 });

  // React Query cache for daily top-picks — loads instantly on revisit
  const { data: cached } = useQuery({
    queryKey: ["top-picks"],
    queryFn: async () => {
      const res  = await fetch("/api/top-picks");
      const data = await res.json();
      return data as { result: ScreenerResult | null; pickedAt: string | null };
    },
    staleTime: 60 * 60 * 1000,
  });

  useEffect(() => {
    if (cached?.result && dailyStatus === "idle") {
      setDailyStatus("done");
    } else if (cached !== undefined && !cached?.result && dailyStatus === "idle") {
      setDailyStatus("empty" as ScreenerStatus);
    }
  }, [cached, dailyStatus]);

  // Core SSE runner — shared logic for both scan types
  const runScan = useCallback(async (universe?: string[]) => {
    const isCustom = !!universe;
    setProgress({ message: "Initializing scanner…", step: 0, totalSteps: 3, batch: 0, totalBatches: 0 });

    if (isCustom) {
      setCustomStatus("scanning");
      setCustomResult(null);
      setCustomError("");
    } else {
      setDailyStatus("scanning");
      setDailyScanResult(null);
      setDailyError("");
    }

    const updateStatus = (s: ScreenerStatus) => isCustom ? setCustomStatus(s) : setDailyStatus(s);
    const updateError  = (e: string)          => isCustom ? setCustomError(e)  : setDailyError(e);

    try {
      const resp = await fetch("/api/screen", {
        method: "POST",
        headers: universe ? { "Content-Type": "application/json" } : {},
        body:    universe ? JSON.stringify({ universe }) : undefined,
      });
      if (!resp.ok || !resp.body) throw new Error("Screener request failed");

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "progress") {
              updateStatus(ev.phase === "analyzing" ? "analyzing" : "scanning");
              setProgress((prev) => ({
                message:      ev.message      ?? prev.message,
                step:         ev.step         ?? prev.step,
                totalSteps:   ev.totalSteps   ?? prev.totalSteps,
                batch:        ev.batch        ?? prev.batch,
                totalBatches: ev.totalBatches ?? prev.totalBatches,
              }));
            } else if (ev.type === "done") {
              const now = new Date().toISOString();
              updateStatus("done");
              if (isCustom) {
                setCustomResult(ev.result);
                setCustomPickedAt(now);
              } else {
                setDailyScanResult(ev.result);
                setDailyScanPickedAt(now);
                queryClient.setQueryData(["top-picks"], { result: ev.result, pickedAt: now });
              }
            } else if (ev.type === "error") {
              updateError(ev.message);
              updateStatus("error");
            }
          } catch { /* malformed SSE frame */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Scan failed";
      updateError(msg);
      updateStatus("error");
    }
  }, [queryClient]);

  const dailyResult   = dailyScanResult   ?? cached?.result   ?? null;
  const dailyPickedAt = dailyScanPickedAt ?? cached?.pickedAt ?? null;

  return {
    dailyStatus, dailyResult, dailyPickedAt, dailyError,
    customStatus, customResult, customPickedAt, customError,
    progress,
    runDailyScan:  () => runScan(),
    runCustomScan: (universe: string[]) => runScan(universe),
  };
}

// ─── Sentiment banner ─────────────────────────────────────────────────────────

function SentimentBanner({ sentiment }: { sentiment: MarketSentiment }) {
  const [expanded, setExpanded] = useState(false);

  const config = {
    Bearish: {
      bar: "bg-rose-950/50 border-rose-800/40 text-rose-300",
      dot: "bg-rose-400",
      detail: "text-rose-400/80",
    },
    Neutral: {
      bar: "bg-surface border-border text-muted-foreground",
      dot: "bg-muted-foreground",
      detail: "text-muted-foreground/70",
    },
    Bullish: {
      bar: "bg-emerald-950/50 border-emerald-800/40 text-emerald-300",
      dot: "bg-emerald-400",
      detail: "text-emerald-400/80",
    },
  }[sentiment.label];

  const spyDesc  = `SPY ${sentiment.spyVs200ma} 200MA`;
  const vixDesc  = `VIX ${sentiment.vix}`;
  const adDesc   = sentiment.adRatio > 1.2
    ? "More stocks advancing"
    : sentiment.adRatio < 0.8
    ? "More stocks declining"
    : "Balanced advance/decline";

  const summary = `${sentiment.label} market · ${spyDesc} · ${vixDesc} · ${adDesc}`;

  return (
    <div
      className={cn("rounded-xl border px-4 py-2 mb-5 cursor-pointer select-none transition-colors", config.bar)}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={cn("w-2 h-2 rounded-full shrink-0", config.dot)} />
          {summary}
        </div>
        <span className={cn("text-xs shrink-0", config.detail)}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && (
        <div className={cn("mt-2 pt-2 border-t border-current/20 grid grid-cols-3 gap-3 text-xs", config.detail)}>
          <div>
            <p className="font-semibold uppercase tracking-wider opacity-70 mb-0.5">SPY vs 200MA</p>
            <p>{sentiment.spyVs200ma === "above" ? "✓ Above — bullish" : sentiment.spyVs200ma === "near" ? "~ Near — neutral" : "✗ Below — bearish"}</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wider opacity-70 mb-0.5">VIX</p>
            <p>{sentiment.vix} — {sentiment.vix > 25 ? "High fear" : sentiment.vix < 18 ? "Low fear" : "Moderate"}</p>
          </div>
          <div>
            <p className="font-semibold uppercase tracking-wider opacity-70 mb-0.5">Advance / Decline</p>
            <p>{sentiment.adRatio.toFixed(2)} ratio — {adDesc}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ children, text, className }: { children: React.ReactNode; text: string; className?: string }) {
  return (
    <span className={cn("relative group/tip inline-flex", className)}>
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-max max-w-[180px] rounded-lg border border-border bg-surface-elevated px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50 text-center leading-snug">
        {text}
      </span>
    </span>
  );
}

// ─── Hot Sector Widget ────────────────────────────────────────────────────────

const SECTOR_ICONS: Record<string, string> = {
  "Energy":                 "⚡",
  "Technology":             "💻",
  "Financials":             "🏦",
  "Healthcare":             "🧬",
  "Industrials":            "⚙️",
  "Consumer Discretionary": "🛍️",
  "Consumer Staples":       "🛒",
  "Materials":              "⛏️",
  "Utilities":              "🔌",
  "Real Estate":            "🏢",
  "Communication Services": "📡",
};

function HotSectorWidget({ hotSector }: { hotSector: HotSectorResult }) {
  const [activeIdx, setActiveIdx] = useState<0 | 1>(0);

  if (hotSector.noLeader) {
    return (
      <div className="rounded-xl border border-border/60 bg-surface/40 px-4 py-3 mb-5 text-sm text-muted-foreground flex items-center gap-2">
        <span className="text-base">〰️</span>
        <span>No clear leading sector today — broad market conditions are mixed.</span>
      </div>
    );
  }

  const sector = activeIdx === 0 ? hotSector.primary : (hotSector.secondary ?? hotSector.primary);
  const setups = activeIdx === 0 ? hotSector.setups : (hotSector.secondarySetups ?? hotSector.setups);
  const rsPositive = sector.rs5d >= 0;

  return (
    <div className="rounded-xl border border-border/60 bg-surface/50 px-5 py-4 mb-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Hot Sector</span>
        {hotSector.secondary && (
          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-border bg-surface">
            {[hotSector.primary, hotSector.secondary].map((s, i) => (
              <button
                key={s.etf}
                onClick={() => setActiveIdx(i as 0 | 1)}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-all",
                  activeIdx === i
                    ? "bg-accent/15 border border-accent/30 text-accent"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {SECTOR_ICONS[s.name]} {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 sm:grid-cols-[3fr_2fr] gap-4 sm:gap-0">
        {/* Left: sector identity + stats */}
        <div className="flex flex-col gap-1 sm:pr-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl leading-none">{SECTOR_ICONS[sector.name] ?? "📊"}</span>
            <span className="text-xl font-semibold text-foreground">{sector.name}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {sector.etf}&nbsp;
            <span className={cn("font-semibold", rsPositive ? "text-bull" : "text-bear")}>
              {rsPositive ? "+" : ""}{sector.rs5d.toFixed(1)}% vs SPY
            </span>
            &nbsp;· 5d
            &nbsp;·&nbsp;
            <span>{sector.breadthPct.toFixed(0)}% above 50MA</span>
            &nbsp;·&nbsp;
            <span>Vol {sector.volumeRatio.toFixed(1)}×</span>
          </p>
        </div>

        {/* Divider */}
        <div className="sm:border-l sm:border-border/60 sm:pl-4">
          {setups.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No setups in this sector today.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {/* Column headers */}
              <div className="flex items-center gap-2 px-0 pb-0.5 mb-0.5 border-b border-border/40">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 w-12 shrink-0">Ticker</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 flex-1">Pattern</span>
                <Tooltip text="Setup Quality + Trade Opportunity (0–200)" className="ml-auto shrink-0">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 cursor-default">Score</span>
                </Tooltip>
              </div>
              {setups.map((s) => (
                <div key={s.ticker} className="flex items-center gap-2 h-7">
                  <span className="text-sm font-bold font-mono text-foreground w-12 shrink-0">{s.ticker}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-elevated text-muted-foreground border border-border/60 truncate max-w-[110px]">
                    {s.primaryPattern}
                  </span>
                  <Tooltip text={`Setup Quality + Trade Opportunity = ${s.score}/200`} className="ml-auto shrink-0">
                    <span className={cn(
                      "text-xs font-bold font-mono cursor-default",
                      s.score >= 140 ? "text-bull" : "text-accent"
                    )}>
                      {s.score}
                    </span>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Scanning progress UI ─────────────────────────────────────────────────────

const STEPS = [
  { label: "Market regime", desc: "SPY analysis" },
  { label: "Deep scan",     desc: "800+ stocks" },
  { label: "AI ranking",    desc: "Gemini picks top 3" },
];

function ScanningView({ status, progress }: { status: ScreenerStatus; progress: ScanProgress }) {
  const stepPct = progress.totalSteps > 0
    ? ((progress.step - 1) / progress.totalSteps) * 100
      + (progress.totalBatches > 0 ? (progress.batch / progress.totalBatches) * (100 / progress.totalSteps) : 0)
    : 0;

  return (
    <div className="flex flex-col items-center gap-10 py-16">
      {/* Spinner */}
      <div className="relative w-20 h-20 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-accent/15 border-t-accent animate-spin" />
        {status === "analyzing"
          ? <Sparkles className="w-8 h-8 text-accent" />
          : <BarChart2 className="w-8 h-8 text-accent" />
        }
      </div>

      {/* Message + bar */}
      <div className="flex flex-col items-center gap-3 w-full max-w-sm">
        <p className="text-base font-semibold text-foreground text-center">{progress.message}</p>
        <div className="w-full h-1.5 rounded-full bg-surface-elevated overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${Math.min(stepPct, 99)}%` }}
          />
        </div>
        {progress.batch > 0 && progress.totalBatches > 0 && (
          <p className="text-xs text-muted-foreground font-mono">
            Batch {progress.batch} / {progress.totalBatches}
          </p>
        )}
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
        {STEPS.map((s, i) => {
          const stepNum = i + 1;
          const isDone   = progress.step > stepNum;
          const isActive = progress.step === stepNum;
          return (
            <div key={s.label} className="flex items-center gap-2">
              <div className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl border transition-colors text-center",
                isDone   ? "border-accent/40 bg-accent/10 text-accent" :
                isActive ? "border-accent/60 bg-accent/15 text-accent" :
                           "border-border text-muted-foreground"
              )}>
                <span className="text-xs font-bold uppercase tracking-wider">{s.label}</span>
                <span className="text-[10px] opacity-80">{s.desc}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("w-3 h-px", isDone ? "bg-accent/50" : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center max-w-xs">
        This runs once a day. Results are cached so future visits load instantly.
      </p>
    </div>
  );
}

// ─── Pick card ────────────────────────────────────────────────────────────────

function PickCard({ pick, rank }: { pick: ScreenerPick; rank: number }) {
  const isLong  = pick.direction === "long";
  const confColor =
    pick.confidence >= 75 ? "text-bull" :
    pick.confidence >= 55 ? "text-yellow-400" :
    "text-muted-foreground";

  const [draftState, setDraftState] = useState<"idle" | "added">("idle");

  function handleAddToDraft() {
    const added = addToDraftStorage(pick.ticker, pick.companyName ?? pick.ticker);
    setDraftState(added ? "added" : "added"); // show "added" even if already existed
  }

  return (
    <div className={cn(
      "relative flex flex-col gap-5 rounded-2xl border bg-surface/60 backdrop-blur-sm p-6",
      "transition-all duration-300 hover:bg-surface/80 hover:-translate-y-0.5",
      isLong ? "border-bull/20 hover:border-bull/40" : "border-bear/20 hover:border-bear/40",
    )}>
      {/* Rank */}
      <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-xs font-bold text-accent">
        {rank}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl font-bold font-mono tracking-tight text-foreground">
              {pick.ticker}
            </span>
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full tracking-widest border",
              isLong
                ? "bg-bull/15 text-bull border-bull/30"
                : "bg-bear/15 text-bear border-bear/30",
            )}>
              {isLong ? "LONG" : "SHORT"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-[200px]">
            {pick.companyName}
          </p>
        </div>

        {/* Confidence + R/R */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn("text-2xl font-bold font-mono leading-none", confColor)}>
            {pick.confidence}%
          </span>
          <div className="w-14 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
            <div
              className={cn("h-full rounded-full", isLong ? "bg-bull" : "bg-bear")}
              style={{ width: `${pick.confidence}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tracking-wider uppercase">confidence</span>
          {pick.riskReward > 0 && (
            <span className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded border",
              pick.riskReward >= 3
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-surface-elevated border-border text-muted-foreground"
            )}>
              R/R {pick.riskReward.toFixed(1)}:1
            </span>
          )}
        </div>
      </div>

      {/* Pattern + current price */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border/70 bg-surface/50">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="text-sm font-semibold text-foreground">{pick.primaryPattern}</span>
        </div>
        <span className="text-sm font-mono text-muted-foreground">${pick.currentPrice.toFixed(2)}</span>
      </div>

      {/* Mini chart */}
      {pick.bars && pick.bars.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-border/40 bg-surface/30">
          <MiniChart
            bars={pick.bars}
            breakoutLevel={pick.breakoutLevel}
            patternKey={pick.patternKey}
            isLong={isLong}
          />
        </div>
      )}

      {/* Pipeline scores */}
      <div className="flex flex-col gap-2">
        {[
          { label: "Setup Quality",     value: pick.setupScore ?? 0 },
          { label: "Trade Opportunity", value: pick.opportunityScore ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-32 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
              <div
                className={cn("h-full rounded-full", isLong ? "bg-bull" : "bg-bear")}
                style={{ width: `${value}%` }}
              />
            </div>
            <span className={cn("text-xs font-bold font-mono w-6 text-right shrink-0", isLong ? "text-bull" : "text-bear")}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Algorithmic signals */}
      {pick.signals?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pick.signals.map((sig) => (
            <span key={sig} className="text-[11px] px-2 py-0.5 rounded bg-surface-elevated text-muted-foreground border border-border/60">
              {sig}
            </span>
          ))}
        </div>
      )}

      {/* Reasoning */}
      <p className="text-sm text-muted-foreground leading-relaxed border-t border-border/60 pt-3 line-clamp-3">
        {pick.reasoning}
      </p>

      {/* CTAs */}
      <div className="flex items-center gap-2">
        {/* Add to Draft */}
        <button
          onClick={handleAddToDraft}
          className={cn(
            "flex items-center gap-1 text-xs font-medium border px-3 py-1.5 rounded-lg transition-all flex-1 justify-center",
            draftState === "added"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 cursor-default"
              : "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
          )}
          title={draftState === "added" ? "Added to draft" : "Add to draft for background analysis"}
        >
          {draftState === "added" ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <FileStack className="w-3.5 h-3.5" />
          )}
          {draftState === "added" ? "Added to Draft" : "Add to Draft"}
        </button>

        {/* Analyze Chart */}
        <Link
          href={`/app?ticker=${pick.ticker}`}
          className="flex items-center gap-1 text-xs font-medium border border-border px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
        >
          Analyze Chart →
        </Link>
      </div>
    </div>
  );
}

// ─── Candidate row (for "Check more stocks" list) ─────────────────────────────

function CandidateRow({ candidate }: { candidate: import("@/lib/types").CandidateSummary }) {
  const [draftState, setDraftState] = useState<"idle" | "added">("idle");
  const isPositive = candidate.change5d >= 0;

  function handleAddToDraft() {
    addToDraftStorage(candidate.ticker, candidate.name);
    setDraftState("added");
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/60 bg-surface/40 hover:bg-surface/70 transition-colors">
      {/* Ticker + name */}
      <div className="w-28 shrink-0">
        <span className="font-mono font-bold text-sm text-foreground">{candidate.ticker}</span>
        <p className="text-xs text-muted-foreground truncate">{candidate.name}</p>
      </div>

      {/* Pattern */}
      <div className="flex-1 min-w-0 hidden sm:block">
        <span className="text-xs text-muted-foreground truncate">{candidate.primaryPattern}</span>
      </div>

      {/* Score */}
      <div className="flex items-center gap-2 w-24 shrink-0">
        <div className="flex-1 h-1 rounded-full bg-surface-elevated overflow-hidden">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.round(candidate.score)}%` }}
          />
        </div>
        <span className="text-xs font-mono font-semibold text-accent w-6 text-right">
          {Math.round(candidate.score)}
        </span>
      </div>

      {/* 5d change */}
      <div className="w-14 shrink-0 text-right">
        <span className={cn("text-xs font-mono font-semibold", isPositive ? "text-bull" : "text-bear")}>
          {isPositive ? "+" : ""}{candidate.change5d.toFixed(1)}%
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={handleAddToDraft}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all",
            draftState === "added"
              ? "bg-accent/15 border-accent/40 text-accent cursor-default"
              : "bg-surface border-border text-muted-foreground hover:text-foreground hover:border-accent/40"
          )}
          title={draftState === "added" ? "Already in draft" : "Add to draft"}
        >
          {draftState === "added" ? <Check className="w-3.5 h-3.5" /> : <FileStack className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{draftState === "added" ? "Added" : "Draft"}</span>
        </button>
        <Link
          href={`/app?ticker=${candidate.ticker}`}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors"
          title="Analyze chart"
        >
          <BarChart2 className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const {
    dailyStatus, dailyResult, dailyPickedAt, dailyError,
    customStatus, customResult, customPickedAt, customError,
    progress,
    runDailyScan, runCustomScan,
  } = useScan();
  const { data: session } = useSession();
  const isAdmin = session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  // ── Tab state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"daily" | "custom">("daily");

  // ── My List input state ──────────────────────────────────────────────────
  const [myListInput, setMyListInput] = useState(() => {
    try { return localStorage.getItem("my_ticker_list") ?? ""; } catch { return ""; }
  });

  function parseTickers(raw: string): string[] {
    return [...new Set(
      raw.split(/[\n,\s]+/)
        .map((t) => t.replace(/^[A-Z]+:/i, "").toUpperCase().trim())
        .filter((t) => /^[A-Z.]{1,7}$/.test(t))
    )];
  }

  function handleRunMyList() {
    const tickers = parseTickers(myListInput);
    if (tickers.length === 0) return;
    try { localStorage.setItem("my_ticker_list", myListInput); } catch { /* ok */ }
    runCustomScan(tickers);
  }

  const { data: trackStats } = useQuery<TrackRecordStats, Error, TrackRecordStats | undefined>({
    queryKey: ["setups-stats"],
    queryFn: () => fetch("/api/setups/stats").then((r) => r.json()),
    select: (s) => (s.totalSetups > 0 ? s : undefined),
  });

  // Per-tab derived state
  const status   = activeTab === "daily" ? dailyStatus   : customStatus;
  const result   = activeTab === "daily" ? dailyResult   : customResult;
  const pickedAt = activeTab === "daily" ? dailyPickedAt : customPickedAt;
  const error    = activeTab === "daily" ? dailyError    : customError;

  const isLoading = status === "scanning" || status === "analyzing";
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [suppressionOverride, setSuppressionOverride] = useState(false);

  const sentiment = result?.sentiment;
  const extremeSuppression = !suppressionOverride && sentiment && (sentiment.score === -3 || sentiment.score === 3);
  const rawPicks = result?.picks?.slice(0, 3) ?? [];
  const picks = extremeSuppression
    ? rawPicks.filter((p) =>
        sentiment!.score === -3 ? p.direction === "short" : p.direction === "long"
      ).concat(
        // if suppression yields zero, fall back to all
        rawPicks.filter((p) =>
          sentiment!.score === -3 ? p.direction === "short" : p.direction === "long"
        ).length === 0 ? rawPicks : []
      ).slice(0, 3)
    : rawPicks;
  const topTickers = new Set(picks.map((p) => p.ticker));
  const moreCandidates = (result?.allCandidates ?? []).filter((c) => !topTickers.has(c.ticker));

  // Helper: render the results for the active tab
  function renderResults() {
    if (isLoading) return <ScanningView status={status} progress={progress} />;

    if (status === "error") return (
      <div className="flex flex-col items-center gap-5 py-16">
        <div className="p-3 rounded-full border border-bear/30 bg-bear/10">
          <AlertCircle className="w-6 h-6 text-bear" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground">Scan failed</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">{error}</p>
        </div>
        <button
          onClick={activeTab === "daily" ? runDailyScan : handleRunMyList}
          className="px-4 py-2 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors"
        >
          Try Again
        </button>
      </div>
    );

    if (status === "idle") return (
      <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Loading…</p>
      </div>
    );

    if ((status as string) === "empty" && activeTab === "daily") return (
      <div className="flex flex-col items-center gap-5 py-16">
        <div className="p-3 rounded-full border border-accent/30 bg-accent/10">
          <Clock className="w-6 h-6 text-accent" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground">Picks update after market close</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Our AI scans 800+ stocks every weekday at 6 PM ET. Check back after market close for today&apos;s top setups.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={runDailyScan}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-accent/40 bg-accent/10 text-accent text-sm font-semibold hover:bg-accent/20 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Run Scan Now
          </button>
        )}
      </div>
    );

    if (status === "done" && picks.length > 0) return (
      <>
        {/* Sentiment banner */}
        {sentiment && <SentimentBanner sentiment={sentiment} />}

        {/* Hot sector widget */}
        {result?.hotSector && <HotSectorWidget hotSector={result.hotSector} />}

        {/* Suppression notice */}
        {extremeSuppression && (
          <div className={cn(
            "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 mb-4 text-xs",
            sentiment!.score === -3
              ? "border-rose-800/40 bg-rose-950/30 text-rose-400"
              : "border-emerald-800/40 bg-emerald-950/30 text-emerald-400"
          )}>
            <span>
              {sentiment!.score === -3
                ? "Bearish market — Top Picks showing short setups and high-RS longs only"
                : "Bullish market — Top Picks showing long setups only"}
            </span>
            <button
              onClick={() => setSuppressionOverride(true)}
              className="shrink-0 underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              Show all anyway
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-fade-in">
          {picks.map((pick, i) => (
            <PickCard key={pick.ticker} pick={pick} rank={i + 1} />
          ))}
        </div>

        {moreCandidates.length > 0 && (
          <div className="mt-8 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setShowAllCandidates((v) => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors group"
              >
                <ChevronRight className={cn("w-4 h-4 transition-transform", showAllCandidates && "rotate-90")} />
                {showAllCandidates ? "Hide" : "More setups"}
                <span className="text-xs font-normal bg-surface-elevated px-1.5 py-0.5 rounded-full">
                  {moreCandidates.length}
                </span>
              </button>
              {activeTab === "daily" && !showAllCandidates && (
                <Link
                  href="/setups"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent transition-colors"
                >
                  View all <ChevronRight className="w-3 h-3" />
                </Link>
              )}
            </div>

            {showAllCandidates && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="w-28 shrink-0">Ticker</span>
                  <span className="flex-1 hidden sm:block">Pattern</span>
                  <span className="w-24 shrink-0">Score</span>
                  <span className="w-14 shrink-0 text-right">5d</span>
                  <span className="w-24 shrink-0" />
                </div>
                {moreCandidates.map((c) => (
                  <CandidateRow key={c.ticker} candidate={c} />
                ))}
              </div>
            )}
          </div>
        )}
      </>
    );

    return null;
  }

  return (
    <div className="min-h-dvh flex flex-col">

      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <AppHeader activePage="home" />

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 pt-14 pb-8">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/30 bg-accent/10 text-accent text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            AI-powered · Updated daily
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground leading-tight">
            Top Breakout Stocks
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent/80 to-bull">
              of the Day
            </span>
          </h1>

          <p className="text-base text-muted-foreground max-w-xl">
            Our AI scans 800+ liquid US equities, ranks them by setup quality and breakout
            potential, then picks the 3 highest-conviction trades.
          </p>
        </div>
      </section>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 pb-6">
        <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-surface w-fit mx-auto">
          <button
            onClick={() => { setActiveTab("daily"); setShowAllCandidates(false); }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === "daily"
                ? "bg-accent/15 border border-accent/30 text-accent"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className="w-3.5 h-3.5" />
            Daily Scan
            {dailyStatus === "done" && dailyResult && (
              <span className="text-[10px] bg-surface-elevated px-1.5 py-0.5 rounded-full font-normal">
                {dailyResult.filteredCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab("custom"); setShowAllCandidates(false); }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === "custom"
                ? "bg-accent/15 border border-accent/30 text-accent"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ListFilter className="w-3.5 h-3.5" />
            My List
            {customStatus === "done" && customResult && (
              <span className="text-[10px] bg-surface-elevated px-1.5 py-0.5 rounded-full font-normal">
                {customResult.filteredCount}
              </span>
            )}
          </button>
        </div>
      </section>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 pb-16 flex-1">

        {/* Daily tab: meta strip */}
        {activeTab === "daily" && dailyStatus === "done" && dailyResult && (
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground mb-6">
            {dailyPickedAt && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Updated {timeAgo(dailyPickedAt)}
              </div>
            )}
            <span className="w-px h-3.5 bg-border hidden sm:block" />
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              {dailyResult.totalScanned} stocks scanned
            </div>
            <span className="w-px h-3.5 bg-border hidden sm:block" />
            <Link href="/setups" className="flex items-center gap-1.5 hover:text-accent transition-colors group">
              <Zap className="w-3.5 h-3.5" />
              {dailyResult.filteredCount} setups found
              <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
            {isAdmin && (
              <button
                onClick={runDailyScan}
                disabled={isLoading}
                className="flex items-center gap-1.5 ml-2 px-3 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors disabled:opacity-40"
              >
                <RefreshCw className="w-3 h-3" />
                Rescan
              </button>
            )}
          </div>
        )}

        {/* My List tab: input area */}
        {activeTab === "custom" && (
          <div className="mb-6 rounded-xl border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold text-foreground">Analyze My List</span>
              <span className="text-xs text-muted-foreground">— paste your TradingView watchlist</span>
            </div>
            <textarea
              value={myListInput}
              onChange={(e) => setMyListInput(e.target.value)}
              placeholder={"AAPL\nMSFT\nNVDA\nor paste TradingView export (NASDAQ:AAPL format works too)"}
              className="w-full h-28 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 font-mono resize-none focus:outline-none focus:border-accent/50"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {parseTickers(myListInput).length > 0
                  ? `${parseTickers(myListInput).length} tickers detected`
                  : "One ticker per line, or comma/space separated"}
              </span>
              <button
                onClick={handleRunMyList}
                disabled={parseTickers(myListInput).length === 0 || isLoading}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-accent/40 bg-accent/10 text-accent text-xs font-semibold hover:bg-accent/20 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
                {isLoading ? "Scanning…" : "Run Analysis"}
              </button>
            </div>
            {customStatus === "done" && customResult && (
              <p className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                {customResult.totalScanned} stocks scanned · {customResult.filteredCount} setups found
                {customPickedAt && <> · {timeAgo(customPickedAt)}</>}
              </p>
            )}
          </div>
        )}

        {renderResults()}

        {/* AI Performance strip — daily tab only */}
        {activeTab === "daily" && dailyStatus === "done" && trackStats && (
          <div className="mt-8 rounded-2xl border border-border bg-surface/40 px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-accent/10 border border-accent/20 shrink-0">
                <Trophy className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">AI Track Record</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {trackStats.totalSetups} setups tracked
                  {trackStats.wins + trackStats.losses > 0 && (
                    <> · Win Rate: <span className="text-emerald-400 font-medium">{trackStats.winRate}%</span>
                    {trackStats.avgReturn !== 0 && (
                      <> · Avg Trade: <span className={cn("font-medium", trackStats.avgReturn > 0 ? "text-emerald-400" : "text-rose-400")}>
                        {trackStats.avgReturn > 0 ? "+" : ""}{trackStats.avgReturn}%
                      </span></>
                    )}</>
                  )}
                </p>
              </div>
            </div>
            <Link
              href="/track-record"
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-accent/30 bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors shrink-0"
            >
              View Full Track Record <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </section>

      {/* ── CTA strip ───────────────────────────────────────────────────────── */}
      {status === "done" && (
        <section className="border-t border-border bg-surface/50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Go deeper</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Analyze any stock with AI pattern detection, or check the full AI track record.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/app"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
              >
                <BarChart2 className="w-4 h-4" />
                Chart Analyzer
              </Link>
              <Link
                href="/track-record"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent/20 hover:bg-accent/30 border border-accent/30 text-accent font-semibold text-sm transition-colors"
              >
                <Trophy className="w-4 h-4" />
                Track Record
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
