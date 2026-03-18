"use client";

import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, ChevronDown, Crosshair, ShieldAlert, Target, TrendingDown as ShortIcon } from "lucide-react";
import { useState } from "react";
import type { AnalysisResult, TechnicalPattern, EntrySignal } from "@/lib/types";
import { cn, formatPrice } from "@/lib/utils";
import PatternCard from "./PatternCard";

interface AnalysisPanelProps {
  analysis: AnalysisResult;
  activePatternIds: Set<string>;
  onTogglePattern: (id: string) => void;
  onToggleAll: (visible: boolean) => void;
  onToggleKeyLevels: (visible: boolean) => void;
  showKeyLevels: boolean;
  currency?: string;
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

function EntrySignalCard({ signal, currency }: { signal: EntrySignal; currency: string }) {
  const isLong = signal.direction === "long";
  const color  = isLong ? "bull" : "bear";

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3",
      isLong ? "border-bull/30 bg-bull/5" : "border-bear/30 bg-bear/5"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crosshair className={cn("w-4 h-4", isLong ? "text-bull" : "text-bear")} />
          <span className="text-sm font-bold text-foreground">Trade Setup</span>
        </div>
        <div className="flex items-center gap-2">
          {signal.hasEntry ? (
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border",
              isLong ? "text-bull border-bull/40 bg-bull/10" : "text-bear border-bear/40 bg-bear/10"
            )}>
              {isLong ? "▲ LONG" : "▼ SHORT"}
            </span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border text-muted-foreground border-border bg-surface">
              No Entry Yet
            </span>
          )}
        </div>
      </div>

      {/* Price levels */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-surface/80 border border-border px-2 py-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Entry</p>
          <p className="text-sm font-mono font-bold text-foreground">{formatPrice(signal.entryPrice, currency)}</p>
        </div>
        <div className="rounded-lg bg-surface/80 border border-bear/20 px-2 py-2">
          <p className="text-[10px] uppercase tracking-widest text-bear/80 mb-1">Stop</p>
          <p className="text-sm font-mono font-bold text-bear">{formatPrice(signal.stopLoss, currency)}</p>
        </div>
        <div className="rounded-lg bg-surface/80 border border-bull/20 px-2 py-2">
          <p className="text-[10px] uppercase tracking-widest text-bull/80 mb-1">Target</p>
          <p className="text-sm font-mono font-bold text-bull">{formatPrice(signal.target, currency)}</p>
        </div>
      </div>

      {/* R:R ratio */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Risk / Reward</span>
        <span className={cn(
          "font-mono font-bold",
          signal.riskRewardRatio >= 2 ? "text-bull" : signal.riskRewardRatio >= 1 ? "text-yellow-400" : "text-bear"
        )}>
          1 : {signal.riskRewardRatio.toFixed(1)}
        </span>
      </div>

      {/* Rationale */}
      <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-2">
        {signal.rationale}
      </p>
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
        <EntrySignalCard signal={analysis.entrySignal} currency={currency} />
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
