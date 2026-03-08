"use client";

import {
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Search, TrendingUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

interface TickerInputProps {
  onAnalyze: (ticker: string) => void;
  isLoading: boolean;
}

export default function TickerInput({ onAnalyze, isLoading }: TickerInputProps) {
  const [value, setValue] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  const wrapperRef  = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Debounced search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        const list = data.results ?? [];
        setResults(list);
        setIsOpen(list.length > 0);
        setHighlightedIdx(-1);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 280);
  }, [value]);

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function handleSelect(symbol: string) {
    setValue(symbol);
    setIsOpen(false);
    setResults([]);
    onAnalyze(symbol);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (highlightedIdx >= 0 && results[highlightedIdx]) {
      handleSelect(results[highlightedIdx].symbol);
      return;
    }
    const ticker = value.trim().toUpperCase();
    if (ticker) {
      setIsOpen(false);
      onAnalyze(ticker);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen && results.length) setIsOpen(true);
      setHighlightedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setHighlightedIdx(-1);
    }
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4 pointer-events-none" />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setIsOpen(true)}
            placeholder="Search ticker or company..."
            disabled={isLoading}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            suppressHydrationWarning
            className={cn(
              "w-full pl-10 pr-9 py-3 rounded-xl border text-sm font-mono",
              "bg-surface border-border text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-all duration-200"
            )}
          />
          {isSearching && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground animate-spin" />
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          suppressHydrationWarning
          className={cn(
            "flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold shrink-0",
            "bg-accent text-accent-foreground",
            "hover:opacity-90 active:scale-[0.98]",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-all duration-200 shadow-lg shadow-accent/20",
            "animate-pulse-glow"
          )}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <TrendingUp className="w-4 h-4" />
          )}
          {isLoading ? "Analyzing..." : "Analyze"}
        </button>
      </form>

      {/* Autocomplete dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-1.5 left-0 right-[88px] z-50 rounded-xl border border-border bg-surface/95 backdrop-blur-md shadow-2xl overflow-hidden">
          {results.map((result, idx) => (
            <button
              key={result.symbol}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(result.symbol); }}
              onMouseEnter={() => setHighlightedIdx(idx)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                idx === highlightedIdx
                  ? "bg-accent/10 border-l-2 border-accent"
                  : "hover:bg-surface-elevated border-l-2 border-transparent"
              )}
            >
              <span className="font-mono font-bold text-sm text-foreground w-[70px] shrink-0">
                {result.symbol}
              </span>
              <span className="text-xs text-muted-foreground truncate flex-1">
                {result.name}
              </span>
              <span className="text-xs text-muted-foreground/50 shrink-0 font-mono">
                {result.exchange}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
