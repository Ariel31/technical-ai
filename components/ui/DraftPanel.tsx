"use client";

import {
  Loader2,
  RefreshCw,
  X,
  AlertCircle,
  BookmarkPlus,
  FileStack,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import type { DraftItem } from "@/hooks/useDraft";
import { cn } from "@/lib/utils";
import { useState } from "react";
import Tooltip from "@/components/ui/Tooltip";

interface DraftPanelProps {
  draft: DraftItem[];
  activeTicker?: string;
  onSelect: (ticker: string) => void;
  onPromoteToWatchlist: (ticker: string, name: string) => void;
  onRemove: (ticker: string) => void;
  onReanalyze: (ticker: string) => void;
}

export default function DraftPanel({
  draft,
  activeTicker,
  onSelect,
  onPromoteToWatchlist,
  onRemove,
  onReanalyze,
}: DraftPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const analyzingCount = draft.filter((i) => i.status === "analyzing").length;
  const doneCount      = draft.filter((i) => i.status === "done").length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden border-t border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 hover:bg-surface-elevated/50 transition-colors">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          <FileStack className="w-4 h-4 text-accent/70" />
          <span className="text-sm font-semibold text-foreground">Draft queue</span>
          {draft.length > 0 && (
            <span className="text-xs text-muted-foreground bg-surface-elevated px-1.5 py-0.5 rounded-full">
              {draft.length}
            </span>
          )}
          {doneCount > 0 && (
            <span className="text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full">
              {doneCount} ready
            </span>
          )}
          {analyzingCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-accent font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              {analyzingCount}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip content="Temporary analysis queue. Add stocks from the screener to pre-analyze them in the background. Click a ready stock to view its chart, or use the bookmark icon to save it permanently to your Watchlist." side="top">
            <Info className="w-3.5 h-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help transition-colors" />
          </Tooltip>
          <button onClick={() => setExpanded((v) => !v)} className="p-0.5">
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Items list */}
      {expanded && (
        <div className="flex-1 overflow-y-auto">
          {draft.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-6 text-center gap-2">
              <FileStack className="w-6 h-6 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Add stocks from the screener to pre-analyze them here
              </p>
            </div>
          ) : (
            <div className="p-2 flex flex-col gap-1">
              {draft.map((item) => (
                <DraftItemCard
                  key={item.ticker}
                  item={item}
                  isActive={item.ticker === activeTicker}
                  onSelect={() => item.status === "done" && onSelect(item.ticker)}
                  onPromote={() => onPromoteToWatchlist(item.ticker, item.name)}
                  onRemove={() => onRemove(item.ticker)}
                  onReanalyze={() => onReanalyze(item.ticker)}
                />
              ))}
              {draft.length > 0 && (
                <p className="text-[10px] text-muted-foreground/40 text-center pt-1 pb-0.5 select-none">
                  ← → to navigate · ☆ to watchlist
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DraftItemCard({
  item,
  isActive,
  onSelect,
  onPromote,
  onRemove,
  onReanalyze,
}: {
  item: DraftItem;
  isActive: boolean;
  onSelect: () => void;
  onPromote: () => void;
  onRemove: () => void;
  onReanalyze: () => void;
}) {
  const isDone      = item.status === "done";
  const isAnalyzing = item.status === "analyzing";
  const isError     = item.status === "error";

  return (
    <div
      onClick={isDone ? onSelect : undefined}
      className={cn(
        "group relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-l-2 transition-all",
        isDone && isActive
          ? "bg-accent/10 border-accent/30 border-l-emerald-500/50"
          : isDone
          ? "bg-surface-elevated/50 border-border/50 hover:bg-surface-elevated hover:border-border cursor-pointer border-l-emerald-500/50"
          : isError
          ? "bg-bear/5 border-bear/20 border-l-rose-500/50"
          : "bg-surface/30 border-border/30 opacity-60 border-l-amber-500/30"
      )}
    >
      {/* Status dot */}
      <div className="shrink-0">
        {isAnalyzing && <Loader2 className="w-3 h-3 text-accent animate-spin" />}
        {isDone && (
          <div className={cn("w-1.5 h-1.5 rounded-full", isActive ? "bg-accent" : "bg-bull")} />
        )}
        {isError && <AlertCircle className="w-3 h-3 text-bear" />}
      </div>

      {/* Ticker + direction badge */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "font-mono font-bold text-xs",
              isDone ? (isActive ? "text-accent" : "text-foreground") : "text-muted-foreground"
            )}
          >
            {item.ticker}
          </span>
          {isAnalyzing && (
            <span className="text-[10px] text-muted-foreground">analyzing…</span>
          )}
          {isDone && item.entrySignal && (
            <span
              className={cn(
                "text-[10px] font-bold px-1 py-px rounded tracking-widest shrink-0",
                item.entrySignal.direction === "long"
                  ? "bg-bull/15 text-bull"
                  : "bg-bear/15 text-bear"
              )}
            >
              {item.entrySignal.direction === "long" ? "L" : "S"}
            </span>
          )}
        </div>
        {item.name && item.name !== item.ticker && (
          <p className="text-[10px] text-muted-foreground truncate leading-tight">{item.name}</p>
        )}
        {isError && item.errorMessage && (
          <p className="text-[10px] text-bear truncate">{item.errorMessage}</p>
        )}
      </div>

      {/* Action buttons (visible on hover) */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {isDone && (
          <button
            onClick={(e) => { e.stopPropagation(); onPromote(); }}
            className="p-1 rounded text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
            title="Save to watchlist"
          >
            <BookmarkPlus className="w-3 h-3" />
          </button>
        )}
        {(isDone || isError) && (
          <button
            onClick={(e) => { e.stopPropagation(); onReanalyze(); }}
            className="p-1 rounded text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors"
            title="Re-analyze"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1 rounded text-muted-foreground hover:text-bear hover:bg-bear/10 transition-colors"
          title="Remove from draft"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
