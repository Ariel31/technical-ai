"use client";

import { Eye, EyeOff, ChevronDown, ChevronUp, Target, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { TechnicalPattern } from "@/lib/types";
import { cn, formatPrice, PATTERN_LABELS } from "@/lib/utils";

interface PatternCardProps {
  pattern: TechnicalPattern;
  isVisible: boolean;
  onToggleVisibility: (id: string) => void;
  currency?: string;
}

const SENTIMENT_STYLES = {
  bullish: {
    badge: "bg-bull/20 text-bull border-bull/30",
    indicator: "bg-bull",
    ring: "ring-bull/30",
  },
  bearish: {
    badge: "bg-bear/20 text-bear border-bear/30",
    indicator: "bg-bear",
    ring: "ring-bear/30",
  },
  neutral: {
    badge: "bg-accent/20 text-accent border-accent/30",
    indicator: "bg-accent",
    ring: "ring-accent/30",
  },
};

const RELIABILITY_STYLES = {
  high:   { text: "text-bull",       dot: "bg-bull",       label: "High" },
  medium: { text: "text-yellow-400", dot: "bg-yellow-400", label: "Med"  },
  low:    { text: "text-bear",       dot: "bg-bear",       label: "Low"  },
};

export default function PatternCard({
  pattern,
  isVisible,
  onToggleVisibility,
  currency = "USD",
}: PatternCardProps) {
  const [expanded, setExpanded] = useState(false);
  const styles = SENTIMENT_STYLES[pattern.sentiment];

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface transition-all duration-200",
        isVisible ? `border-border ring-1 ${styles.ring}` : "border-border/50 opacity-60"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        {/* Sentiment indicator dot */}
        <div className={cn("w-2 h-2 rounded-full shrink-0", styles.indicator)} />

        {/* Pattern info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground truncate">
              {PATTERN_LABELS[pattern.type] ?? pattern.label}
            </span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide",
                styles.badge
              )}
            >
              {pattern.sentiment}
            </span>
            <span className={cn("flex items-center gap-1 text-[10px] font-medium ml-auto", RELIABILITY_STYLES[pattern.reliability].text)}>
              <span className={cn("w-1.5 h-1.5 rounded-full", RELIABILITY_STYLES[pattern.reliability].dot)} />
              {RELIABILITY_STYLES[pattern.reliability].label}
            </span>
          </div>
        </div>

        {/* Confidence score */}
        {pattern.confidenceScore != null && (
          <div className="flex flex-col items-end gap-0.5 shrink-0 mr-1">
            <span className={cn("text-[10px] font-mono font-bold", RELIABILITY_STYLES[pattern.reliability].text)}>
              {pattern.confidenceScore}%
            </span>
            <div className="w-10 h-1 rounded-full bg-surface-elevated overflow-hidden">
              <div
                className={cn("h-full rounded-full", RELIABILITY_STYLES[pattern.reliability].dot)}
                style={{ width: `${pattern.confidenceScore}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onToggleVisibility(pattern.id)}
            className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
            title={isVisible ? "Hide on chart" : "Show on chart"}
          >
            {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-surface-elevated text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3 animate-fade-in">
          <p className="text-xs text-muted-foreground leading-relaxed">{pattern.description}</p>

          {(pattern.priceTarget != null || pattern.stopLoss != null) && (
            <div className="flex gap-3">
              {pattern.priceTarget != null && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Target className="w-3.5 h-3.5 text-bull" />
                  <span className="text-muted-foreground">Target:</span>
                  <span className="font-mono text-bull font-semibold">
                    {formatPrice(pattern.priceTarget, currency)}
                  </span>
                </div>
              )}
              {pattern.stopLoss != null && (
                <div className="flex items-center gap-1.5 text-xs">
                  <ShieldAlert className="w-3.5 h-3.5 text-bear" />
                  <span className="text-muted-foreground">Stop:</span>
                  <span className="font-mono text-bear font-semibold">
                    {formatPrice(pattern.stopLoss, currency)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
