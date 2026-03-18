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
} from "lucide-react";
import { useSession } from "next-auth/react";
import type { ScreenerPick, ScreenerResult, ScreenerStatus, TrackRecordStats } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const [status, setStatus]     = useState<ScreenerStatus>("idle");
  const [progress, setProgress] = useState<ScanProgress>({ message: "", step: 0, totalSteps: 3, batch: 0, totalBatches: 0 });
  const [scanResult, setScanResult] = useState<ScreenerResult | null>(null);
  const [scanPickedAt, setScanPickedAt] = useState<string | null>(null);
  const [error, setError]       = useState("");

  // React Query cache for top-picks — loads instantly on revisit
  const { data: cached } = useQuery({
    queryKey: ["top-picks"],
    queryFn: async () => {
      const res  = await fetch("/api/top-picks");
      const data = await res.json();
      return data as { result: ScreenerResult | null; pickedAt: string | null };
    },
    staleTime: 60 * 60 * 1000, // 1 hour — top picks only change once daily
  });

  // Hydrate status from cache on first load
  useEffect(() => {
    if (cached?.result && cached?.pickedAt && status === "idle") {
      setStatus("done");
    } else if (cached !== undefined && !cached?.result && status === "idle") {
      setStatus("empty" as ScreenerStatus);
    }
  }, [cached, status]);

  const runScan = useCallback(async () => {
    setStatus("scanning");
    setProgress({ message: "Initializing scanner…", step: 0, totalSteps: 3, batch: 0, totalBatches: 0 });
    setScanResult(null);
    setError("");

    try {
      const resp = await fetch("/api/screen", { method: "POST" });
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
              setStatus(ev.phase === "analyzing" ? "analyzing" : "scanning");
              setProgress((prev) => ({
                message:      ev.message      ?? prev.message,
                step:         ev.step         ?? prev.step,
                totalSteps:   ev.totalSteps   ?? prev.totalSteps,
                batch:        ev.batch        ?? prev.batch,
                totalBatches: ev.totalBatches ?? prev.totalBatches,
              }));
            } else if (ev.type === "done") {
              const now = new Date().toISOString();
              setScanResult(ev.result);
              setScanPickedAt(now);
              setStatus("done");
              // Update the React Query cache so the result is reused on next visit
              queryClient.setQueryData(["top-picks"], { result: ev.result, pickedAt: now });
            } else if (ev.type === "error") {
              setError(ev.message);
              setStatus("error");
            }
          } catch { /* malformed SSE frame — skip */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
      setStatus("error");
    }
  }, [queryClient]);

  const result   = scanResult   ?? cached?.result   ?? null;
  const pickedAt = scanPickedAt ?? cached?.pickedAt ?? null;

  return { status, progress, result, pickedAt, error, runScan };
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

        {/* Confidence */}
        <div className="flex flex-col items-end gap-0.5 shrink-0">
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
        <div className="flex flex-col gap-1.5">
          {pick.signals.map((s) => (
            <div key={s} className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className={cn("w-1 h-1 rounded-full shrink-0", isLong ? "bg-bull" : "bg-bear")} />
              {s}
            </div>
          ))}
        </div>
      )}

      {/* Reasoning */}
      <p className="text-sm text-muted-foreground leading-relaxed border-t border-border/60 pt-3 line-clamp-3">
        {pick.reasoning}
      </p>

      {/* Analyze CTA */}
      <Link
        href={`/app?ticker=${pick.ticker}`}
        className={cn(
          "flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all border",
          isLong
            ? "bg-bull/10 hover:bg-bull/20 border-bull/25 hover:border-bull/50 text-bull"
            : "bg-bear/10 hover:bg-bear/20 border-bear/25 hover:border-bear/50 text-bear",
        )}
      >
        <BarChart2 className="w-4 h-4" />
        Analyze Chart
        <ChevronRight className="w-3.5 h-3.5 ml-auto" />
      </Link>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { status, progress, result, pickedAt, error, runScan } = useScan();
  const { data: session } = useSession();
  const isAdmin = session?.user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  const { data: trackStats } = useQuery<TrackRecordStats, Error, TrackRecordStats | undefined>({
    queryKey: ["setups-stats"],
    queryFn: () => fetch("/api/setups/stats").then((r) => r.json()),
    select: (s) => (s.totalSetups > 0 ? s : undefined),
  });

  const isLoading = status === "scanning" || status === "analyzing";
  const picks = result?.picks?.slice(0, 3) ?? [];

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

          {/* Meta when done */}
          {status === "done" && result && (
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              {pickedAt && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Updated {timeAgo(pickedAt)}
                </div>
              )}
              <span className="w-px h-3.5 bg-border hidden sm:block" />
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                {result.totalScanned} stocks scanned
              </div>
              <span className="w-px h-3.5 bg-border hidden sm:block" />
              <Link
                href="/setups"
                className="flex items-center gap-1.5 hover:text-accent transition-colors group"
              >
                <Zap className="w-3.5 h-3.5" />
                {result.filteredCount} setups found
                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>

              {isAdmin && (
                <button
                  onClick={runScan}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 ml-2 px-3 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors disabled:opacity-40"
                >
                  <RefreshCw className="w-3 h-3" />
                  Rescan
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 pb-16 flex-1">

        {/* Scanning / Analyzing */}
        {isLoading && <ScanningView status={status} progress={progress} />}

        {/* Error */}
        {status === "error" && (
          <div className="flex flex-col items-center gap-5 py-16">
            <div className="p-3 rounded-full border border-bear/30 bg-bear/10">
              <AlertCircle className="w-6 h-6 text-bear" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">Scan failed</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">{error}</p>
            </div>
            <button
              onClick={runScan}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {status === "done" && picks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-fade-in">
            {picks.map((pick, i) => (
              <PickCard key={pick.ticker} pick={pick} rank={i + 1} />
            ))}
          </div>
        )}

        {/* Initial loading (checking cache) */}
        {status === "idle" && (
          <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Loading…</p>
          </div>
        )}

        {/* No picks yet — scan runs automatically after market close */}
        {(status as string) === "empty" && (
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
                onClick={runScan}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-accent/40 bg-accent/10 text-accent text-sm font-semibold hover:bg-accent/20 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Run Scan Now
              </button>
            )}
          </div>
        )}

        {/* AI Performance strip */}
        {status === "done" && trackStats && (
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
