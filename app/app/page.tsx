"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Brain, Loader2, Bookmark, BookmarkCheck } from "lucide-react";
import type { AnalysisResult, AppStatus, OHLCVBar, StockDataResponse } from "@/lib/types";
import TickerInput from "@/components/ui/TickerInput";
import AnalysisPanel from "@/components/ui/AnalysisPanel";
import StatusOverlay from "@/components/ui/StatusOverlay";
import WatchlistPanel from "@/components/ui/WatchlistPanel";
import AppHeader from "@/components/ui/AppHeader";
import { useWatchlist } from "@/hooks/useWatchlist";
import { cn } from "@/lib/utils";

// TradingChart uses browser APIs — load client-side only
const TradingChart = dynamic(() => import("@/components/chart/TradingChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#0a0a0f] rounded-xl animate-pulse" />,
});

function AppContent() {
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<AppStatus>("idle");
  const [error, setError] = useState<string | undefined>();
  const [ticker, setTicker] = useState<string>("");
  const [bars, setBars] = useState<OHLCVBar[]>([]);
  const [meta, setMeta] = useState<StockDataResponse["meta"] | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [activePatternIds, setActivePatternIds] = useState<Set<string>>(new Set());
  const [showKeyLevels, setShowKeyLevels] = useState(true);

  const { watchlist, addToWatchlist, removeFromWatchlist, reanalyze, loadCachedAnalysis } =
    useWatchlist();

  const isInWatchlist = watchlist.some((item) => item.ticker === ticker);

  // Guard against React StrictMode double-invocation — refs survive the unmount/remount cycle
  const initialLoadDone = useRef(false);

  // Auto-analyze ticker passed from landing page (?ticker=AAPL)
  // Try cache first for instant results; only run fresh AI analysis on cache miss.
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const t = searchParams.get("ticker");
    if (!t) return;
    const upper = t.toUpperCase();

    setTicker(upper);
    setStatus("fetching_data");
    // Check Pro-model cache first; only run fresh if no cached analysis exists
    loadCachedAnalysis(upper).then((cached) => {
      if (cached) {
        setBars(cached.bars);
        setMeta(cached.meta);
        applyAnalysisResult(cached.result);
      } else {
        handleAnalyze(upper);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function applyAnalysisResult(result: AnalysisResult) {
    const srIds = result.patterns
      .filter((p) => p.type === "support" || p.type === "resistance")
      .map((p) => p.id);
    const nonSR = result.patterns.filter(
      (p) => p.type !== "support" && p.type !== "resistance"
    );
    const bestNonSR =
      nonSR.find((p) => p.reliability === "high") ??
      nonSR.find((p) => p.reliability === "medium") ??
      nonSR[0];
    setActivePatternIds(new Set([...srIds, ...(bestNonSR ? [bestNonSR.id] : [])]));
    setAnalysis(result);
    setStatus("done");
  }

  // ── Main analysis flow ────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async (inputTicker: string) => {
    setTicker(inputTicker);
    setError(undefined);
    setAnalysis(null);
    setActivePatternIds(new Set());

    // Step 1: Fetch OHLCV
    setStatus("fetching_data");
    let stockData: StockDataResponse;

    try {
      const res = await fetch(
        `/api/stock-data?ticker=${encodeURIComponent(inputTicker)}&timeframe=1d&bars=200`
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to fetch stock data");
      }
      stockData = await res.json();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to fetch stock data");
      return;
    }

    setBars(stockData.bars);
    setMeta(stockData.meta);

    // Step 2: AI Analysis
    setStatus("analyzing");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: inputTicker, bars: stockData.bars, indicators: [] }),
      });

      if (!res.ok) {
        let errorMsg = "AI analysis couldn't be completed. Please try again.";
        try {
          const body = await res.json();
          if (body.error) errorMsg = body.error;
        } catch { /* non-JSON error body — keep default message */ }
        throw new Error(errorMsg);
      }

      let result: AnalysisResult;
      try {
        result = await res.json();
      } catch {
        throw new Error("The AI returned an unexpected response. Please try again.");
      }

      applyAnalysisResult(result);

      // Save to DB in background so watchlist can load it instantly later
      fetch(`/api/analysis/${encodeURIComponent(inputTicker)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bars: stockData.bars, result, meta: stockData.meta }),
      }).catch(() => { /* non-fatal */ });

    } catch (err) {
      setStatus("done");
      setError(err instanceof Error ? err.message : "AI analysis failed");
    }
  }, []);

  // ── Load cached analysis from watchlist item click ────────────────────────────

  const handleWatchlistSelect = useCallback(
    async (t: string) => {
      setTicker(t);
      setError(undefined);
      setAnalysis(null);
      setActivePatternIds(new Set());
      setStatus("fetching_data");

      const cached = await loadCachedAnalysis(t);
      if (!cached) {
        handleAnalyze(t);
        return;
      }

      setBars(cached.bars);
      setMeta(cached.meta);
      applyAnalysisResult(cached.result);
    },
    [loadCachedAnalysis, handleAnalyze]
  );

  // ── Pattern toggle handlers ───────────────────────────────────────────────────

  function handleTogglePattern(id: string) {
    setActivePatternIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleAll(visible: boolean) {
    if (!analysis) return;
    setActivePatternIds(
      visible ? new Set(analysis.patterns.map((p) => p.id)) : new Set()
    );
  }

  function handleToggleKeyLevels(visible: boolean) {
    setShowKeyLevels(visible);
  }

  const showFullOverlay =
    status === "idle" ||
    status === "fetching_data" ||
    (status === "error" && bars.length === 0);
  const showAnalysisGlass = status === "analyzing" && bars.length > 0;

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      {/* ── Top Nav ──────────────────────────────────────────────────────────── */}
      <AppHeader
        activePage="chart"
        centerSlot={
          <TickerInput
            onAnalyze={handleAnalyze}
            isLoading={status === "fetching_data" || status === "analyzing"}
          />
        }
        rightSlot={
          <>
            {meta && (status === "done" || status === "analyzing") && (
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-semibold text-foreground">{ticker}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[140px]">{meta.name}</span>
              </div>
            )}
            {status === "done" && ticker && meta && (
              <button
                onClick={() => !isInWatchlist && addToWatchlist(ticker, meta.name)}
                disabled={isInWatchlist}
                title={isInWatchlist ? "Already in watchlist" : "Add to watchlist"}
                className={cn(
                  "p-2 rounded-lg border transition-colors",
                  isInWatchlist
                    ? "border-accent/30 text-accent bg-accent/10 cursor-default"
                    : "border-border text-muted-foreground hover:text-accent hover:border-accent/50"
                )}
              >
                {isInWatchlist ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              </button>
            )}
          </>
        }
      />

      {/* ── Main Layout ──────────────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full max-w-[1800px] mx-auto flex">

          {/* Watchlist Left Sidebar */}
          <WatchlistPanel
            watchlist={watchlist}
            activeTicker={ticker || undefined}
            onSelect={handleWatchlistSelect}
            onAddToWatchlist={addToWatchlist}
            onRemove={removeFromWatchlist}
            onReanalyze={reanalyze}
          />

          {/* Chart Area */}
          <div className="flex-1 relative p-3 min-w-0 min-h-0 flex flex-col">
            <div className="relative flex-1 min-h-0 rounded-xl border border-border overflow-hidden">

              {bars.length > 0 && (
                <TradingChart
                  bars={bars}
                  analysis={analysis}
                  activePatternIds={activePatternIds}
                  keyLevels={analysis?.keyLevels ?? null}
                  showKeyLevels={showKeyLevels}
                />
              )}

              {showFullOverlay && (
                <StatusOverlay status={status} error={error} />
              )}

              {showAnalysisGlass && (
                <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[3px] bg-background/25">
                  <div className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl border border-white/10 bg-surface/70 backdrop-blur-md shadow-2xl">
                    <div className="relative flex items-center justify-center">
                      <Loader2 className="absolute w-14 h-14 text-accent/20 animate-spin" />
                      <Brain className="w-7 h-7 text-accent" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">Analyzing chart patterns...</p>
                      <p className="text-xs text-muted-foreground mt-1">AI is scanning for technical setups</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono px-3 py-1.5 rounded-lg border border-border/60 bg-surface/80">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      Gemini 2.5 Pro
                    </div>
                  </div>
                </div>
              )}

              {status === "done" && error && bars.length > 0 && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-4 py-2 rounded-full border border-bear/30 bg-bear/10 backdrop-blur-sm text-xs text-bear font-medium whitespace-nowrap">
                  {error}
                </div>
              )}

              {(status === "done" || status === "analyzing") && bars.length > 0 && (
                <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface/80 backdrop-blur-sm border border-border">
                  <div className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
                  <span className="text-xs font-mono font-semibold text-foreground">{ticker}</span>
                  {meta && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      • {meta.exchange} • {meta.currency}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Analysis Sidebar */}
          {analysis && status === "done" && (
            <aside className="w-80 shrink-0 border-l border-border overflow-y-auto bg-surface/50 backdrop-blur-sm p-4 animate-fade-in">
              <AnalysisPanel
                analysis={analysis}
                activePatternIds={activePatternIds}
                onTogglePattern={handleTogglePattern}
                onToggleAll={handleToggleAll}
                onToggleKeyLevels={handleToggleKeyLevels}
                showKeyLevels={showKeyLevels}
                currency={meta?.currency ?? "USD"}
              />
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

// Wrap in Suspense because useSearchParams() requires it in App Router
export default function AppPage() {
  return (
    <Suspense>
      <AppContent />
    </Suspense>
  );
}
