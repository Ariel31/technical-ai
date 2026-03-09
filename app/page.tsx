"use client";

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import { Activity, Github, Brain, Loader2, Zap, Bookmark, BookmarkCheck } from "lucide-react";
import type { AnalysisResult, AppStatus, OHLCVBar, StockDataResponse } from "@/lib/types";
import TickerInput from "@/components/ui/TickerInput";
import AnalysisPanel from "@/components/ui/AnalysisPanel";
import StatusOverlay from "@/components/ui/StatusOverlay";
import ScreenerPanel from "@/components/ui/ScreenerPanel";
import WatchlistPanel from "@/components/ui/WatchlistPanel";
import { useWatchlist } from "@/hooks/useWatchlist";
import { cn } from "@/lib/utils";

// TradingChart uses browser APIs — load client-side only
const TradingChart = dynamic(() => import("@/components/chart/TradingChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#0a0a0f] rounded-xl animate-pulse" />,
});

type Tab = "chart" | "screener";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("chart");

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
      setActiveTab("chart");
      setTicker(t);
      setError(undefined);
      setAnalysis(null);
      setActivePatternIds(new Set());
      setStatus("fetching_data");

      const cached = await loadCachedAnalysis(t);
      if (!cached) {
        // Cache miss — fall back to live analysis
        handleAnalyze(t);
        return;
      }

      setBars(cached.bars);
      setMeta(cached.meta);
      applyAnalysisResult(cached.result);
    },
    [loadCachedAnalysis, handleAnalyze]
  );

  // ── Screener → Chart ──────────────────────────────────────────────────────────

  function handleAnalyzeFromScreener(t: string) {
    setActiveTab("chart");
    handleAnalyze(t);
  }

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
      <header className="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md z-20">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/20">
              <Activity className="w-5 h-5 text-accent" />
            </div>
            <div>
              <span className="font-bold text-foreground tracking-tight">TechnicalAI</span>
              <span className="hidden sm:inline ml-1.5 text-xs text-muted-foreground">
                AI Pattern Analysis
              </span>
            </div>
          </div>

          {/* Tab switcher */}
          <nav className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-surface/60 shrink-0">
            <button
              onClick={() => setActiveTab("chart")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                activeTab === "chart"
                  ? "bg-accent/20 text-accent"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Activity className="w-3.5 h-3.5" />
              Chart Analysis
            </button>
            <button
              onClick={() => setActiveTab("screener")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                activeTab === "screener"
                  ? "bg-accent/20 text-accent"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Zap className="w-3.5 h-3.5" />
              Smart Screener
            </button>
          </nav>

          {/* Ticker input — only visible in chart tab */}
          {activeTab === "chart" && (
            <div className="flex-1 max-w-xl">
              <TickerInput
                onAnalyze={handleAnalyze}
                isLoading={status === "fetching_data" || status === "analyzing"}
              />
            </div>
          )}

          {/* Spacer when screener tab hides ticker input */}
          {activeTab === "screener" && <div className="flex-1" />}

          {/* Right side */}
          <div className="flex items-center gap-3 shrink-0">
            {activeTab === "chart" && meta && (status === "done" || status === "analyzing") && (
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-semibold text-foreground">{ticker}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[140px]">{meta.name}</span>
              </div>
            )}

            {/* Add to Watchlist button — shown when analysis is done */}
            {activeTab === "chart" && status === "done" && ticker && meta && (
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
                {isInWatchlist ? (
                  <BookmarkCheck className="w-4 h-4" />
                ) : (
                  <Bookmark className="w-4 h-4" />
                )}
              </button>
            )}

            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      {/* ── Main Layout ──────────────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-hidden">

        {/* ── Chart Tab ──────────────────────────────────────────────────────── */}
        {activeTab === "chart" && (
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
                        Gemini 2.0 Flash
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
        )}

        {/* ── Screener Tab ────────────────────────────────────────────────────── */}
        {activeTab === "screener" && (
          <div className="h-full overflow-y-auto">
            <ScreenerPanel onAnalyze={handleAnalyzeFromScreener} />
          </div>
        )}
      </main>
    </div>
  );
}
