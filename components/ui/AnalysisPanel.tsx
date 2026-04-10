"use client";

import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown, Crosshair, Loader2, Check, Sparkles, Send, ArrowUp, ArrowDown } from "lucide-react";
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

// Maps DB field names to short display labels for version diff badges
const FIELD_LABELS: Record<string, string> = {
  entry_price: "EP",
  stop_price:  "SL",
  target_price: "TP",
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

  const { versions, committedVersion, isRefining, refinementError, refinementWarning, refine, commit } =
    useSetupVersions(canRefine ? setupId! : null);

  const [userInput, setUserInput] = useState("");

  const displayEntry  = committedVersion?.entryPrice  ?? signal.entryPrice;
  const displayStop   = committedVersion?.stopPrice   ?? signal.stopLoss;
  const displayTarget = committedVersion?.targetPrice ?? signal.target;
  const displayRr     = committedVersion?.rrRatio     ?? signal.riskRewardRatio;

  const hasVersions = versions.length > 0;

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
      <div className="flex items-center gap-2 px-4 py-3 bg-surface/50">
        <Crosshair className={cn("w-4 h-4 shrink-0", isLong ? "text-bull" : "text-bear")} />
        <span className="text-sm font-bold text-foreground">Trade Setup</span>

        {/* AI badge — shows when refinement is available */}
        {canRefine && (
          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/25 text-[10px] font-bold text-violet-400 select-none">
            <Sparkles className="w-2.5 h-2.5" />
            AI
          </span>
        )}

        <div className="flex-1" />

        {/* Direction badge */}
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

      {/* ── Version switcher ─────────────────────────────────────────────── */}
      {hasVersions && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-t border-border/30 bg-surface/20 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mr-1">
            Version
          </span>
          {versions.map((v) => {
            const isActive = v.isCommitted;
            const diffFields = v.changedFields ?? [];
            return (
              <button
                key={v.id}
                onClick={() => !isActive && handleCommit(v.id, v)}
                disabled={isActive}
                title={v.changeSummary ?? (v.source === "ai" ? "AI original" : undefined)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all border",
                  isActive
                    ? "bg-accent text-white border-accent cursor-default"
                    : "bg-surface border-border text-muted-foreground hover:border-accent/50 hover:text-foreground active:scale-95"
                )}
              >
                v{v.versionNumber}
                {isActive && <Check className="w-2.5 h-2.5" />}
                {/* Changed-field diff badges */}
                {!isActive && diffFields.map((f) => {
                  const label = FIELD_LABELS[f];
                  if (!label) return null;
                  // Determine direction: compare with previous version or signal
                  const prevVersion = versions[v.versionNumber - 2];
                  const prevVal = f === "entry_price" ? (prevVersion?.entryPrice ?? signal.entryPrice)
                    : f === "stop_price" ? (prevVersion?.stopPrice ?? signal.stopLoss)
                    : (prevVersion?.targetPrice ?? signal.target);
                  const newVal = f === "entry_price" ? v.entryPrice
                    : f === "stop_price" ? v.stopPrice
                    : v.targetPrice;
                  const went = newVal > prevVal ? "up" : newVal < prevVal ? "down" : null;
                  return (
                    <span key={f} className="flex items-center gap-0.5 text-violet-400/80">
                      {label}
                      {went === "up" && <ArrowUp className="w-2 h-2" />}
                      {went === "down" && <ArrowDown className="w-2 h-2" />}
                    </span>
                  );
                })}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Price levels ─────────────────────────────────────────────────── */}
      {signal.hasEntry && (
        <div className="px-4 py-3 space-y-2.5 border-t border-border/30">
          <div className="grid grid-cols-3 gap-2 text-center">
            {([
              { label: "Entry",  value: displayEntry,  textCls: "text-foreground", borderCls: "border-border/60" },
              { label: "Stop",   value: displayStop,   textCls: "text-bear",       borderCls: "border-bear/30"   },
              { label: "Target", value: displayTarget, textCls: "text-bull",       borderCls: "border-bull/30"   },
            ] as const).map(({ label, value, textCls, borderCls }) => (
              <div
                key={label}
                className={cn(
                  "rounded-lg border px-2 py-2.5 transition-all duration-300",
                  borderCls,
                  isRefining ? "animate-pulse bg-surface/30" : "bg-surface/70",
                )}
              >
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
                <p className={cn("text-base font-mono font-bold transition-opacity", textCls, isRefining && "opacity-30")}>
                  {formatPrice(value, currency)}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs px-0.5">
            <span className="text-muted-foreground">Risk / Reward</span>
            <span className={cn(
              "font-mono font-bold text-sm transition-opacity",
              (displayRr ?? 0) >= 2 ? "text-bull" : (displayRr ?? 0) >= 1 ? "text-yellow-400" : "text-bear",
              isRefining && "opacity-30",
            )}>
              1 : {(displayRr ?? 0).toFixed(1)}
            </span>
          </div>
        </div>
      )}

      {/* ── Rationale ────────────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-t border-border/30">
        <p className="text-xs text-muted-foreground leading-relaxed">{signal.rationale}</p>
      </div>

      {/* ── AI prompt bar ────────────────────────────────────────────────── */}
      {canRefine && !isTriggered && (
        <div className="border-t border-border/30 px-3 py-2.5 bg-violet-500/[0.03]">
          <div className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 transition-all",
            "bg-surface/80 border-border/60",
            "focus-within:border-violet-500/50 focus-within:bg-surface focus-within:ring-1 focus-within:ring-violet-500/15",
          )}>
            <Sparkles className={cn(
              "w-3.5 h-3.5 shrink-0 transition-colors",
              isRefining ? "text-violet-400 animate-pulse" : "text-violet-500/50",
            )} />
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value.slice(0, 500))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleRefine(); } }}
              placeholder={`Adjust levels… e.g. "move target to ${Math.round((displayTarget || 0) * 1.05)}"`}
              disabled={isRefining}
              className="flex-1 min-w-0 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/35 outline-none disabled:opacity-50"
            />
            <button
              onClick={handleRefine}
              disabled={!userInput.trim() || isRefining}
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-md transition-all shrink-0",
                userInput.trim() && !isRefining
                  ? "bg-violet-500 text-white hover:bg-violet-400 active:scale-95"
                  : "bg-surface-elevated text-muted-foreground/30 cursor-not-allowed",
              )}
            >
              {isRefining
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Send className="w-3.5 h-3.5" />
              }
            </button>
          </div>

          {refinementWarning && (
            <p className="text-[11px] text-yellow-500/80 mt-2 px-1 leading-snug">{refinementWarning}</p>
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

      {/* Summary */}
      <div className="px-1">
        <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary}</p>
      </div>

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
