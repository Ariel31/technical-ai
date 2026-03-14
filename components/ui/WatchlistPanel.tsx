"use client";

import { useState, useRef, useEffect } from "react";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  X,
  AlertCircle,
  Plus,
  Search,
  TrendingUp,
} from "lucide-react";
import type { WatchlistItem } from "@/lib/types";
import { cn } from "@/lib/utils";

interface WatchlistPanelProps {
  watchlist: WatchlistItem[];
  activeTicker?: string;
  onSelect: (ticker: string) => void;
  onAddToWatchlist: (ticker: string, name: string) => void;
  onRemove: (ticker: string) => void;
  onReanalyze: (ticker: string) => void;
}

export default function WatchlistPanel({
  watchlist,
  activeTicker,
  onSelect,
  onAddToWatchlist,
  onRemove,
  onReanalyze,
}: WatchlistPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addResults, setAddResults] = useState<
    Array<{ symbol: string; name: string; exchange: string }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounced ticker search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = addValue.trim();
    if (q.length < 1) {
      setAddResults([]);
      setIsDropdownOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const list = data.results ?? [];
        setAddResults(list);
        setIsDropdownOpen(list.length > 0);
      } catch {
        setAddResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 280);
  }, [addValue]);

  // Close dropdown on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function handleAdd(symbol: string, name: string) {
    onAddToWatchlist(symbol, name);
    setAddValue("");
    setAddResults([]);
    setIsDropdownOpen(false);
  }

  function handleSubmitAdd(e: React.FormEvent) {
    e.preventDefault();
    const ticker = addValue.trim().toUpperCase();
    if (ticker && !watchlist.some((item) => item.ticker === ticker)) {
      handleAdd(ticker, ticker);
    }
  }

  // ── Collapsed (icon strip) ───────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div className="w-12 shrink-0 border-r border-border bg-surface/50 flex flex-col items-center py-3 gap-2">
        <button
          onClick={() => setCollapsed(false)}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
          title="Open watchlist"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="w-6 h-px bg-border" />
        <div className="flex flex-col gap-1 flex-1 overflow-y-auto w-full px-1.5">
          {watchlist.map((item) => (
            <button
              key={item.ticker}
              onClick={() => item.status === "done" ? onSelect(item.ticker) : undefined}
              disabled={item.status !== "done"}
              title={item.ticker}
              className={cn(
                "w-full flex items-center justify-center h-8 rounded-lg text-[10px] font-mono font-bold transition-colors",
                item.status === "done" && item.ticker === activeTicker
                  ? "bg-accent/20 text-accent"
                  : item.status === "done"
                  ? "text-foreground hover:bg-surface-elevated"
                  : item.status === "analyzing"
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : "text-bear/70 cursor-not-allowed"
              )}
            >
              {item.status === "analyzing" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : item.status === "error" ? (
                <AlertCircle className="w-3 h-3 text-bear" />
              ) : (
                item.ticker.slice(0, 4)
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Expanded ─────────────────────────────────────────────────────────────────
  return (
    <div className="w-64 shrink-0 border-r border-border bg-surface/50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-foreground">Watchlist</span>
          {watchlist.length > 0 && (
            <span className="text-xs text-muted-foreground bg-surface-elevated px-1.5 py-0.5 rounded-full">
              {watchlist.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
          title="Collapse"
          suppressHydrationWarning
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Add stock search */}
      <div ref={wrapperRef} className="relative px-3 py-2 border-b border-border">
        <form onSubmit={handleSubmitAdd} className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={addValue}
              onChange={(e) => setAddValue(e.target.value.toUpperCase())}
              placeholder="Add ticker…"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              suppressHydrationWarning
              className={cn(
                "w-full pl-7 pr-2 py-1.5 rounded-lg border text-xs font-mono",
                "bg-surface border-border text-foreground placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent",
                "transition-all duration-150"
              )}
            />
            {isSearching && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground animate-spin" />
            )}
          </div>
          <button
            type="submit"
            disabled={!addValue.trim()}
            className={cn(
              "p-1.5 rounded-lg shrink-0",
              "bg-accent/20 text-accent border border-accent/30",
              "hover:bg-accent/30 disabled:opacity-40 disabled:cursor-not-allowed",
              "transition-colors"
            )}
            title="Add to watchlist"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </form>

        {/* Autocomplete dropdown */}
        {isDropdownOpen && addResults.length > 0 && (
          <div className="absolute top-full mt-1 left-3 right-3 z-50 rounded-xl border border-border bg-surface/95 backdrop-blur-md shadow-2xl overflow-hidden">
            {addResults.map((r) => {
              const alreadyAdded = watchlist.some((item) => item.ticker === r.symbol);
              return (
                <button
                  key={r.symbol}
                  type="button"
                  disabled={alreadyAdded}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (!alreadyAdded) handleAdd(r.symbol, r.name);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors",
                    alreadyAdded
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-accent/10"
                  )}
                >
                  <span className="font-mono font-bold text-xs text-foreground w-14 shrink-0">
                    {r.symbol}
                  </span>
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {r.name}
                  </span>
                  {alreadyAdded && (
                    <span className="text-[10px] text-muted-foreground shrink-0">added</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Watchlist items */}
      <div className="flex-1 overflow-y-auto">
        {watchlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 py-8 text-center gap-3">
            <TrendingUp className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              Add stocks to track and instantly reload their analysis
            </p>
          </div>
        ) : (
          <div className="p-2 flex flex-col gap-1">
            {watchlist.map((item) => (
              <WatchlistItemCard
                key={item.ticker}
                item={item}
                isActive={item.ticker === activeTicker}
                onSelect={() => item.status === "done" && onSelect(item.ticker)}
                onRemove={() => onRemove(item.ticker)}
                onReanalyze={() => onReanalyze(item.ticker)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WatchlistItemCard({
  item,
  isActive,
  onSelect,
  onRemove,
  onReanalyze,
}: {
  item: WatchlistItem;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onReanalyze: () => void;
}) {
  const isDone = item.status === "done";
  const isAnalyzing = item.status === "analyzing";
  const isError = item.status === "error";

  return (
    <div
      onClick={isDone ? onSelect : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 px-2.5 py-2 rounded-lg border transition-all",
        isDone && isActive
          ? "bg-accent/10 border-accent/30"
          : isDone
          ? "bg-surface-elevated/50 border-border/50 hover:bg-surface-elevated hover:border-border cursor-pointer"
          : isError
          ? "bg-bear/5 border-bear/20"
          : "bg-surface/30 border-border/30 opacity-60"
      )}
    >
      {/* Status indicator */}
      <div className="shrink-0">
        {isAnalyzing && <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />}
        {isDone && (
          <div
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isActive ? "bg-accent" : "bg-bull"
            )}
          />
        )}
        {isError && <AlertCircle className="w-3.5 h-3.5 text-bear" />}
      </div>

      {/* Ticker + name + entry signal */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "font-mono font-bold text-xs",
              isDone
                ? isActive
                  ? "text-accent"
                  : "text-foreground"
                : "text-muted-foreground"
            )}
          >
            {item.ticker}
          </span>
          {isAnalyzing && (
            <span className="text-[10px] text-muted-foreground/60">analyzing…</span>
          )}
          {isDone && item.entrySignal && (
            <span
              className={cn(
                "text-[9px] font-bold px-1 py-px rounded tracking-widest shrink-0",
                item.entrySignal.direction === "long"
                  ? "bg-bull/15 text-bull"
                  : "bg-bear/15 text-bear"
              )}
            >
              {item.entrySignal.direction === "long" ? "LONG" : "SHORT"}
            </span>
          )}
        </div>
        {item.name && item.name !== item.ticker && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">{item.name}</p>
        )}
        {isDone && item.entrySignal && (
          <div className="grid grid-cols-3 gap-x-1 mt-1.5">
            {[
              { label: "Entry", value: item.entrySignal.entryPrice, cls: "text-foreground" },
              { label: "Stop",  value: item.entrySignal.stopLoss,   cls: "text-bear" },
              { label: "Tgt",   value: item.entrySignal.target,      cls: "text-bull" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="flex flex-col">
                <span className="text-[8px] text-muted-foreground/60 uppercase tracking-wider leading-none">{label}</span>
                <span className={cn("text-[10px] font-mono font-semibold leading-tight", cls)}>
                  ${value.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
        {isError && item.errorMessage && (
          <p className="text-[10px] text-bear truncate mt-0.5">{item.errorMessage}</p>
        )}
      </div>

      {/* Action buttons (visible on hover) */}
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
          title="Remove"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
