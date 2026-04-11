"use client";

import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, Crosshair, Loader2, Sparkles, Send } from "lucide-react";
import { useState } from "react";
import type { AnalysisResult, TechnicalPattern, EntrySignal } from "@/lib/types";
import { cn, formatPrice } from "@/lib/utils";
import PatternCard from "./PatternCard";
import { useSetupVersions } from "@/hooks/useSetupVersions";

type CommittedPrices = { entry: number; stop: number; target: number; direction: "long" | "short" };

interface AnalysisPanelProps {
  analysis: AnalysisResult;
  activePatternIds: Set<string>;
  onTogglePattern: (id: string) => void;
  onToggleAll: (visible: boolean) => void;
  onToggleKeyLevels: (visible: boolean) => void;
  showKeyLevels: boolean;
  currency?: string;
  setupId?: string | null;
  setupStatus?: string | null;
  onVersionCommit?: (prices: CommittedPrices) => void;
}

const BIAS_CONFIG = {
  bullish: {
    icon: TrendingUp,
    label: "Bullish",
    color: "text-bull",
    bg: "bg-bull/10 border-bull/20",
  },
  bearish: {
    icon: TrendingDown,
    label: "Bearish",
    color: "text-bear",
    bg: "bg-bear/10 border-bear/20",
  },
  neutral: {
    icon: Minus,
    label: "Neutral",
    color: "text-accent",
    bg: "bg-accent/10 border-accent/20",
  },
};

function EntrySignalCard({
  signal,
  currency,
  setupId,
  setupStatus,
  onVersionCommit,
}: {
  signal: EntrySignal;
  currency: string;
  setupId?: string | null;
  setupStatus?: string | null;
  onVersionCommit?: (prices: CommittedPrices) => void;
}) {
  const isLong      = signal.direction === "long";
  const isTriggered = setupStatus === "ACTIVE";
  const canRefine   = !!(setupId && signal.hasEntry && signal.entryPrice > 0);

  const { versions, committedVersion, isRefining, refinementError, refinementWarning, refinementDisagreed, refine, commit } =
    useSetupVersions(canRefine ? setupId! : null);

  const [userInput, setUserInput] = useState("");
  const [showRefine, setShowRefine] = useState(false);

  const displayEntry  = committedVersion?.entryPrice  ?? signal.entryPrice;
  const displayStop   = committedVersion?.stopPrice   ?? signal.stopLoss;
  const displayTarget = committedVersion?.targetPrice ?? signal.target;
  const displayRr     = committedVersion?.rrRatio     ?? signal.riskRewardRatio;

  const hasVersions = versions.length > 1;
  const committedIdx = versions.findIndex((v) => v.isCommitted);
  const canGoPrev = committedIdx > 0;
  const canGoNext = committedIdx < versions.length - 1 && committedIdx !== -1;

  async function handleRefine() {
    if (!userInput.trim() || isRefining) return;
    const ok = await refine(userInput.trim());
    if (ok) setUserInput("");
  }

  function handleCommit(vId: string, v: typeof versions[number]) {
    commit(vId);
    onVersionCommit?.({ entry: v.entryPrice, stop: v.stopPrice, target: v.targetPrice, direction: signal.direction });
  }

  const accentLine = isLong
    ? "from-bull/70 via-bull/20 to-transparent"
    : "from-bear/70 via-bear/20 to-transparent";

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden",
      isLong ? "border-bull/25" : "border-bear/25",
    )}>
      {/* Top accent bar */}
      <div className={cn("h-[2px] bg-gradient-to-r", accentLine)} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-4 bg-surface/50">
        <Crosshair className={cn("w-4 h-4 shrink-0", isLong ? "text-bull" : "text-bear")} />
        <span className="text-sm font-bold text-foreground">Trade Setup</span>
        <div className="flex-1" />
        <span className={cn(
          "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0",
          signal.hasEntry
            ? isLong
              ? "text-bull border-bull/40 bg-bull/10"
              : "text-bear border-bear/40 bg-bear/10"
            : "text-muted-foreground border-border bg-surface"
        )}>
          {signal.hasEntry ? (isLong ? "▲ LONG" : "▼ SHORT") : "No Entry Yet"}
        </span>
      </div>

      {/* ── Price levels ─────────────────────────────────────────────────── */}
      {signal.hasEntry && (
        <div className="px-4 py-5 space-y-5 border-t border-border/30">
          {/* Version nav — only when multiple versions exist */}
          {hasVersions && (
            <div className="flex items-center justify-between rounded-lg bg-surface-elevated border border-border/60 px-3 py-2">
              <span className="text-xs font-semibold text-foreground/70">
                Version {committedVersion?.versionNumber ?? 1}
                <span className="text-muted-foreground font-normal"> / {versions.length}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => canGoPrev && handleCommit(versions[committedIdx - 1].id, versions[committedIdx - 1])}
                  disabled={!canGoPrev}
                  title={canGoPrev ? (versions[committedIdx - 1].changeSummary ?? undefined) : undefined}
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded border transition-all",
                    canGoPrev
                      ? "border-border/60 text-foreground/70 hover:border-accent/50 hover:text-foreground hover:bg-accent/10 active:scale-95"
                      : "border-border/30 text-border cursor-not-allowed",
                  )}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => canGoNext && handleCommit(versions[committedIdx + 1].id, versions[committedIdx + 1])}
                  disabled={!canGoNext}
                  title={canGoNext ? (versions[committedIdx + 1].changeSummary ?? undefined) : undefined}
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded border transition-all",
                    canGoNext
                      ? "border-border/60 text-foreground/70 hover:border-accent/50 hover:text-foreground hover:bg-accent/10 active:scale-95"
                      : "border-border/30 text-border cursor-not-allowed",
                  )}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            {([
              { label: "Entry",  value: displayEntry,  textCls: "text-foreground", borderCls: "border-border/60" },
              { label: "Stop",   value: displayStop,   textCls: "text-bear",       borderCls: "border-bear/30"   },
              { label: "Target", value: displayTarget, textCls: "text-bull",       borderCls: "border-bull/30"   },
            ] as const).map(({ label, value, textCls, borderCls }) => (
              <div
                key={label}
                className={cn(
                  "rounded-lg border px-2 py-3 transition-all duration-300",
                  borderCls,
                  isRefining ? "animate-pulse bg-surface/30" : "bg-surface/70",
                )}
              >
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
                <p className={cn("text-base font-mono font-bold transition-opacity", textCls, isRefining && "opacity-30")}>
                  {formatPrice(value, currency)}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs text-muted-foreground">Risk / Reward</span>
            <span className={cn(
              "font-mono font-bold text-sm transition-opacity",
              (displayRr ?? 0) >= 2 ? "text-bull" : (displayRr ?? 0) >= 1 ? "text-yellow-400" : "text-bear",
              isRefining && "opacity-30",
            )}>
              1 : {(displayRr ?? 0).toFixed(1)}
            </span>
          </div>

          {canRefine && !isTriggered && (
            <button
              onClick={() => setShowRefine((v) => !v)}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-all",
                showRefine
                  ? "bg-violet-500/30 border-violet-400/70 text-white shadow-[0_0_12px_rgba(139,92,246,0.2)]"
                  : "bg-violet-500/15 border-violet-400/50 text-violet-200 hover:bg-violet-500/25 hover:border-violet-400/70 hover:text-white hover:shadow-[0_0_12px_rgba(139,92,246,0.15)]",
              )}
            >
              <Sparkles className="w-4 h-4" />
              Adjust with AI
            </button>
          )}
        </div>
      )}

      {/* ── AI refinement (collapsible) ───────────────────────────────────── */}
      {canRefine && !isTriggered && showRefine && (
        <div className="border-t border-violet-400/20 px-3 py-3 bg-violet-500/8">
          <div className={cn(
            "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-all",
            "bg-violet-950/40 border-violet-400/40",
            "focus-within:border-violet-300/70 focus-within:ring-2 focus-within:ring-violet-400/30",
          )}>
            <Sparkles className={cn(
              "w-3.5 h-3.5 shrink-0 mt-1 transition-colors",
              isRefining ? "text-violet-200 animate-pulse" : "text-violet-400",
            )} />
            <textarea
              rows={2}
              value={userInput}
              onChange={(e) => setUserInput(e.target.value.slice(0, 500))}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRefine(); } }}
              placeholder='e.g. "tighten the stop" or "entry feels too aggressive, pull back"'
              disabled={isRefining}
              autoFocus
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-violet-300/30 outline-none disabled:opacity-50 resize-none leading-relaxed"
            />
            <button
              onClick={handleRefine}
              disabled={!userInput.trim() || isRefining}
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-md transition-all shrink-0 self-end mb-0.5",
                userInput.trim() && !isRefining
                  ? "bg-violet-500 text-white hover:bg-violet-400 active:scale-95"
                  : "bg-violet-900/50 text-violet-600 cursor-not-allowed",
              )}
            >
              {isRefining
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />
              }
            </button>
          </div>

          {refinementDisagreed && (
            <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/8 px-3 py-2.5">
              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">AI disagreed — adjusted instead</p>
              <p className="text-[11px] text-amber-300/90 leading-snug">{refinementDisagreed}</p>
            </div>
          )}
          {refinementWarning && (
            <p className="text-[11px] text-yellow-500/70 mt-2 px-1 leading-snug">{refinementWarning}</p>
          )}
          {refinementError && (
            <p className="text-[11px] text-bear/80 mt-2 px-1">{refinementError}</p>
          )}
        </div>
      )}

      {isTriggered && (
        <div className="border-t border-border/30 px-4 py-2.5 bg-surface/20">
          <p className="text-[11px] text-muted-foreground italic">Setup triggered — levels locked while in trade.</p>
        </div>
      )}
    </div>
  );
}

function PatternGroup({
  label,
  dot,
  patterns,
  activePatternIds,
  onTogglePattern,
  currency,
  defaultCollapsed = false,
}: {
  label: string;
  dot: string;
  patterns: TechnicalPattern[];
  activePatternIds: Set<string>;
  onTogglePattern: (id: string) => void;
  currency: string;
  defaultCollapsed?: boolean;
}) {
  const [open, setOpen] = useState(!defaultCollapsed);
  if (patterns.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full mb-2 group"
      >
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
          {label} · {patterns.length}
        </span>
        <ChevronDown className={cn("w-3 h-3 text-muted-foreground ml-auto transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 mb-3">
          {patterns.map((pattern) => (
            <PatternCard
              key={pattern.id}
              pattern={pattern}
              isVisible={activePatternIds.has(pattern.id)}
              onToggleVisibility={onTogglePattern}
              currency={currency}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalysisPanel({
  analysis,
  activePatternIds,
  onTogglePattern,
  onToggleAll,
  onToggleKeyLevels,
  showKeyLevels,
  currency = "USD",
  setupId,
  setupStatus,
  onVersionCommit,
}: AnalysisPanelProps) {
  const [showLevels, setShowLevels] = useState(true);
  const bias = BIAS_CONFIG[analysis.overallBias];
  const BiasIcon = bias.icon;

  const allVisible = analysis.patterns.every((p) => activePatternIds.has(p.id));

  // Separate key-level patterns (support/resistance) from technical patterns
  const nonSR = analysis.patterns.filter((p) => p.type !== "support" && p.type !== "resistance");

  const highPatterns   = nonSR.filter((p) => p.reliability === "high");
  const mediumPatterns = nonSR.filter((p) => p.reliability === "medium");
  const lowPatterns    = nonSR.filter((p) => p.reliability === "low");

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Header / Bias */}
      <div className={cn("flex items-center gap-3 p-4 rounded-xl border", bias.bg)}>
        <div className={cn("p-2 rounded-lg bg-surface")}>
          <BiasIcon className={cn("w-5 h-5", bias.color)} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
              AI Overall Bias
            </span>
          </div>
          <p className={cn("text-lg font-bold mt-0.5", bias.color)}>{bias.label}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>{analysis.ticker}</p>
          <p className="font-mono">
            {new Date(analysis.analyzedAt).toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Summary — split into scannable bullets */}
      <ul className="space-y-2 px-1">
        {analysis.summary
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((sentence, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-accent/50 shrink-0" />
              <span className="text-sm text-foreground/75 leading-relaxed">{sentence}</span>
            </li>
          ))}
      </ul>

      {/* Entry Signal */}
      {analysis.entrySignal && (
        <EntrySignalCard signal={analysis.entrySignal} currency={currency} setupId={setupId} setupStatus={setupStatus} onVersionCommit={onVersionCommit} />
      )}

      {/* Key Levels accordion */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/0">
          <button
            onClick={() => setShowLevels((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-foreground/80 transition-colors"
          >
            Key Levels
            <ChevronDown className={cn("w-4 h-4 transition-transform", showLevels && "rotate-180")} />
          </button>
          <button
            onClick={() => onToggleKeyLevels(!showKeyLevels)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide transition-all",
              showKeyLevels
                ? "bg-accent/20 border-accent/50 text-accent hover:bg-accent/30"
                : "bg-surface-elevated border-border/60 text-muted-foreground hover:text-foreground"
            )}
          >
            {showKeyLevels ? "Visible" : "Hidden"}
          </button>
        </div>

        {showLevels && (
          <div className="px-4 pb-4 grid grid-cols-2 gap-4 border-t border-border animate-fade-in">
            <div>
              <p className="text-xs font-medium text-bull uppercase tracking-widest mb-2">
                Support
              </p>
              <div className="space-y-1">
                {analysis.keyLevels.supports.map((level, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-bull" />
                    <span className="text-xs font-mono text-foreground">
                      {formatPrice(level, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-bear uppercase tracking-widest mb-2">
                Resistance
              </p>
              <div className="space-y-1">
                {analysis.keyLevels.resistances.map((level, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-bear" />
                    <span className="text-xs font-mono text-foreground">
                      {formatPrice(level, currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Patterns list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            Detected Patterns
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              ({nonSR.length})
            </span>
          </h3>
          <button
            onClick={() => onToggleAll(!allVisible)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all",
              allVisible
                ? "bg-surface-elevated border-border text-muted-foreground hover:text-foreground hover:border-accent/40"
                : "bg-accent/15 border-accent/40 text-accent hover:bg-accent/25"
            )}
          >
            <RefreshCw className="w-3 h-3" />
            {allVisible ? "Hide all" : "Show all"}
          </button>
        </div>

        <PatternGroup
          label="High confidence"
          dot="bg-bull"
          patterns={highPatterns}
          activePatternIds={activePatternIds}
          onTogglePattern={onTogglePattern}
          currency={currency}
        />
        <PatternGroup
          label="Medium confidence"
          dot="bg-yellow-400"
          patterns={mediumPatterns}
          activePatternIds={activePatternIds}
          onTogglePattern={onTogglePattern}
          currency={currency}
        />
        <PatternGroup
          label="Lower confidence"
          dot="bg-bear"
          patterns={lowPatterns}
          activePatternIds={activePatternIds}
          onTogglePattern={onTogglePattern}
          currency={currency}
        />
      </div>
    </div>
  );
}
