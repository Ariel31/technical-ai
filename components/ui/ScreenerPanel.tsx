"use client";

import { useState, useCallback } from "react";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Target,
  ShieldAlert,
  BarChart2,
  ChevronRight,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import type { ScreenerResult, ScreenerPick, ScreenerStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const UNIVERSE_COUNT = 600; // approximate — matches STOCK_UNIVERSE in lib/screener.ts

const SECTORS = [
  { name: "Technology",   count: 90,  examples: "AAPL · MSFT · NVDA · AMD · CRWD" },
  { name: "Finance",      count: 80,  examples: "JPM · GS · BLK · V · COIN" },
  { name: "Healthcare",   count: 80,  examples: "JNJ · LLY · ISRG · TMO · CRSP" },
  { name: "Energy",       count: 60,  examples: "XOM · CVX · SLB · LNG · OXY" },
  { name: "Industrials",  count: 70,  examples: "CAT · GE · LMT · UPS · ODFL" },
  { name: "Consumer",     count: 80,  examples: "AMZN · HD · MCD · COST · NKE" },
  { name: "Materials",    count: 35,  examples: "LIN · SHW · NEM · NUE · ALB" },
  { name: "Utilities",    count: 25,  examples: "NEE · DUK · AWK · AES · BEP" },
  { name: "REITs",        count: 40,  examples: "AMT · PLD · EQIX · EXR · VICI" },
  { name: "ETFs",         count: 35,  examples: "SPY · QQQ · SMH · IBB · GLD" },
];

interface Props {
  onAnalyze: (ticker: string) => void;
}

export default function ScreenerPanel({ onAnalyze }: Props) {
  const [status, setStatus] = useState<ScreenerStatus>("idle");
  const [progressData, setProgressData] = useState({
    message: "",
    step: 0,
    totalSteps: 3,
    batch: 0,
    totalBatches: 0,
    scannedCount: 0,
  });
  const [result, setResult] = useState<ScreenerResult | null>(null);
  const [error, setError] = useState("");

  const runScreener = useCallback(async () => {
    setStatus("scanning");
    setProgressData({ message: "Initializing scanner…", step: 0, totalSteps: 3, batch: 0, totalBatches: 0, scannedCount: 0 });
    setResult(null);
    setError("");

    try {
      const resp = await fetch("/api/screen", { method: "POST" });
      if (!resp.ok || !resp.body) throw new Error("Request failed");

      const reader = resp.body.getReader();
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
              setProgressData((prev) => ({
                message:      ev.message      ?? prev.message,
                step:         ev.step         ?? prev.step,
                totalSteps:   ev.totalSteps   ?? prev.totalSteps,
                batch:        ev.batch        ?? prev.batch,
                totalBatches: ev.totalBatches ?? prev.totalBatches,
                scannedCount: ev.scannedCount ?? prev.scannedCount,
              }));
            } else if (ev.type === "done") {
              setResult(ev.result);
              setStatus("done");
            } else if (ev.type === "error") {
              setError(ev.message);
              setStatus("error");
            }
          } catch {
            // Ignore malformed SSE frames
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screener failed");
      setStatus("error");
    }
  }, []);

  return (
    <div className="min-h-full p-6 md:p-8 flex flex-col gap-8 max-w-6xl mx-auto w-full">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-xl bg-accent/10 border border-accent/20">
              <Zap className="w-5 h-5 text-accent" />
            </div>
            Smart Screener
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 ml-14">
            Scans ~{UNIVERSE_COUNT} liquid US stocks — bulk quote filter + deep SMA/RSI analysis + Gemini AI top 3
          </p>
        </div>

        {(status === "done" || status === "error") && (
          <button
            onClick={runScreener}
            className="shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Rescan
          </button>
        )}
      </div>

      {/* ── States ──────────────────────────────────────────────────────────── */}
      {status === "idle"      && <IdleView onScan={runScreener} />}
      {(status === "scanning" || status === "analyzing") && (
        <ScanningView status={status} data={progressData} />
      )}
      {status === "error"     && <ErrorView error={error} onRetry={runScreener} />}
      {status === "done" && result && <ResultsView result={result} onAnalyze={onAnalyze} />}
    </div>
  );
}

// ─── Idle ──────────────────────────────────────────────────────────────────────

function IdleView({ onScan }: { onScan: () => void }) {
  return (
    <div className="flex flex-col items-center gap-10 py-6">
      {/* Scan button */}
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={onScan}
          className="group relative flex items-center gap-3 px-10 py-5 rounded-2xl border border-accent/30 bg-accent/10 hover:bg-accent/20 hover:border-accent/60 text-accent font-bold text-lg transition-all duration-200 shadow-lg shadow-accent/5 hover:shadow-accent/15"
        >
          <Zap className="w-6 h-6 group-hover:animate-pulse" />
          Scan Market
        </button>
        <p className="text-xs text-muted-foreground text-center max-w-md">
          Runs SMA, RSI, and volume indicators on every stock, filters the best setups, then asks Gemini AI for the 3 highest-confidence trade ideas.
        </p>
      </div>

      {/* How it works */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-2xl">
        {[
          { label: "SMA Analysis", desc: "20 / 50 day alignment" },
          { label: "RSI Filter",   desc: "Momentum & oversold zones" },
          { label: "Volume Surge", desc: "Abnormal activity detection" },
          { label: "AI Ranking",   desc: "Gemini 2.5 Flash picks" },
        ].map(({ label, desc }) => (
          <div key={label} className="p-3.5 rounded-xl border border-border bg-surface/60">
            <p className="text-xs font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
          </div>
        ))}
      </div>

      {/* Sector breakdown */}
      <div className="w-full max-w-3xl">
        <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-widest">
          ~{UNIVERSE_COUNT} stocks across 10 sectors
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SECTORS.map(({ name, count, examples }) => (
            <div key={name} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-surface/40">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold text-foreground w-24">{name}</span>
                <span className="text-[10px] font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">{count}</span>
              </div>
              <span className="text-[10px] text-muted-foreground truncate">{examples}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Scanning / Analyzing ─────────────────────────────────────────────────────

function ScanningView({
  status,
  data,
}: {
  status: ScreenerStatus;
  data: { message: string; step: number; totalSteps: number; batch: number; totalBatches: number; scannedCount: number };
}) {
  // Overall progress across all 3 steps
  const stepPct = data.totalSteps > 0
    ? ((data.step - 1) / data.totalSteps) * 100 + (data.totalBatches > 0 ? (data.batch / data.totalBatches) * (100 / data.totalSteps) : 0)
    : 0;

  const STEPS = [
    { label: "Bulk quote fetch",  desc: `~${UNIVERSE_COUNT} stocks` },
    { label: "Deep SMA · RSI",    desc: "Top 30 candidates" },
    { label: "AI ranking",        desc: "Gemini 2.5 Flash" },
  ];

  return (
    <div className="flex flex-col items-center gap-10 py-12">
      {/* Spinner */}
      <div className="relative w-20 h-20 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-accent/15 border-t-accent animate-spin" />
        {status === "analyzing" ? (
          <Sparkles className="w-8 h-8 text-accent" />
        ) : (
          <BarChart2 className="w-8 h-8 text-accent" />
        )}
      </div>

      {/* Message + overall bar */}
      <div className="flex flex-col items-center gap-3 w-full max-w-sm">
        <p className="text-base font-semibold text-foreground text-center">{data.message}</p>
        <div className="w-full h-1.5 rounded-full bg-surface-elevated overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${Math.min(stepPct, 99)}%` }}
          />
        </div>
        {data.scannedCount > 0 && (
          <p className="text-xs text-muted-foreground font-mono">
            {data.scannedCount} stocks scanned
          </p>
        )}
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-3">
        {STEPS.map((s, i) => {
          const stepNum = i + 1;
          const isDone    = data.step > stepNum;
          const isActive  = data.step === stepNum;
          return (
            <div key={s.label} className="flex items-center gap-2">
              <div className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-colors",
                isDone   ? "border-accent/40 bg-accent/10 text-accent" :
                isActive ? "border-accent/60 bg-accent/15 text-accent" :
                           "border-border text-muted-foreground"
              )}>
                <span className="text-[10px] font-bold uppercase tracking-wider">{s.label}</span>
                <span className="text-[9px] opacity-70">{s.desc}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("w-4 h-px", isDone ? "bg-accent/50" : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Error ────────────────────────────────────────────────────────────────────

function ErrorView({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 py-16">
      <div className="p-3 rounded-full border border-bear/30 bg-bear/10">
        <AlertCircle className="w-6 h-6 text-bear" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-foreground">Screener failed</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{error}</p>
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-sm font-medium rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}

// ─── Results ──────────────────────────────────────────────────────────────────

function ResultsView({
  result,
  onAnalyze,
}: {
  result: ScreenerResult;
  onAnalyze: (t: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3 rounded-xl border border-border bg-surface/50 text-sm">
        <span className="text-muted-foreground">
          Scanned <span className="text-foreground font-semibold">{result.totalScanned}</span> stocks
        </span>
        <span className="text-muted-foreground">
          Filtered to top <span className="text-foreground font-semibold">{result.filteredCount}</span> by score
        </span>
        <span className="text-muted-foreground">
          AI selected <span className="text-accent font-semibold">{result.picks.length} setups</span>
        </span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">
          {new Date(result.screenedAt).toLocaleTimeString()}
        </span>
      </div>

      {/* Pick cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {result.picks.map((pick, i) => (
          <PickCard key={pick.ticker} pick={pick} rank={i + 1} onAnalyze={onAnalyze} />
        ))}
      </div>
    </div>
  );
}

// ─── Pick Card ────────────────────────────────────────────────────────────────

function PickCard({
  pick,
  rank,
  onAnalyze,
}: {
  pick: ScreenerPick;
  rank: number;
  onAnalyze: (t: string) => void;
}) {
  const isLong = pick.direction === "long";
  const accentColor = isLong ? "bull" : "bear";

  const confColor =
    pick.confidence >= 75
      ? "text-bull"
      : pick.confidence >= 55
      ? "text-yellow-400"
      : "text-muted-foreground";

  return (
    <div
      className={cn(
        "flex flex-col gap-4 p-5 rounded-2xl border bg-surface/80 backdrop-blur-sm",
        "transition-all duration-200",
        isLong ? "border-bull/20 hover:border-bull/40" : "border-bear/20 hover:border-bear/40"
      )}
    >
      {/* ── Header: rank / direction / ticker / confidence ─────────────────── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-muted-foreground font-mono shrink-0">#{rank}</span>
          <span
            className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-md border tracking-widest shrink-0",
              isLong
                ? "bg-bull/10 border-bull/25 text-bull"
                : "bg-bear/10 border-bear/25 text-bear"
            )}
          >
            {isLong ? "LONG" : "SHORT"}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-foreground text-lg leading-none">{pick.ticker}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{pick.companyName}</p>
          </div>
        </div>

        {/* Confidence */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn("text-2xl font-bold font-mono leading-none", confColor)}>
            {pick.confidence}%
          </span>
          <div className="w-14 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                isLong ? "bg-bull" : "bg-bear"
              )}
              style={{ width: `${pick.confidence}%` }}
            />
          </div>
          <span className="text-[9px] text-muted-foreground tracking-wider uppercase">confidence</span>
        </div>
      </div>

      {/* ── Pattern ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/70 bg-surface/50">
        <BarChart2 className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="text-sm font-semibold text-foreground">{pick.primaryPattern}</span>
      </div>

      {/* ── Price levels ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            label: "Entry",
            value: pick.entry,
            Icon: Target,
            cls: "text-foreground",
          },
          {
            label: "Target",
            value: pick.target,
            Icon: TrendingUp,
            cls: "text-bull",
          },
          {
            label: "Stop",
            value: pick.stopLoss,
            Icon: ShieldAlert,
            cls: "text-bear",
          },
        ].map(({ label, value, Icon, cls }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border border-border/60 bg-surface/40"
          >
            <div className={cn("flex items-center gap-0.5 text-[9px] uppercase tracking-wider", cls)}>
              <Icon className="w-2.5 h-2.5" />
              {label}
            </div>
            <span className={cn("text-sm font-bold font-mono", cls)}>
              ${value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* ── Potential return + R/R ─────────────────────────────────────────── */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3 rounded-xl border",
          isLong ? "border-bull/15 bg-bull/5" : "border-bear/15 bg-bear/5"
        )}
      >
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Potential</p>
          <p
            className={cn(
              "text-3xl font-bold font-mono leading-tight",
              `text-${accentColor}`
            )}
          >
            {pick.potentialReturn > 0 ? "+" : ""}
            {pick.potentialReturn.toFixed(1)}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk / Reward</p>
          <p className="text-2xl font-bold font-mono text-foreground leading-tight">
            {pick.riskReward.toFixed(1)}<span className="text-sm text-muted-foreground">:1</span>
          </p>
        </div>
      </div>

      {/* ── Trigger badges ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {pick.triggers.map((t) => (
          <span
            key={t}
            className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-accent/20 bg-accent/10 text-accent"
          >
            {t}
          </span>
        ))}
      </div>

      {/* ── Reasoning ─────────────────────────────────────────────────────── */}
      <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/60 pt-3">
        {pick.reasoning}
      </p>

      {/* ── Analyze button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => onAnalyze(pick.ticker)}
        className={cn(
          "flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all",
          isLong
            ? "bg-bull/10 hover:bg-bull/20 border border-bull/25 hover:border-bull/50 text-bull"
            : "bg-bear/10 hover:bg-bear/20 border border-bear/25 hover:border-bear/50 text-bear"
        )}
      >
        <BarChart2 className="w-4 h-4" />
        Analyze Chart
        <ChevronRight className="w-3.5 h-3.5 ml-auto" />
      </button>
    </div>
  );
}
