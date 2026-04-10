"use client";

import dynamic from "next/dynamic";
import React, { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Brain, Loader2, Bookmark, BookmarkCheck, Share2, ChevronLeft, ChevronRight } from "lucide-react";
import type { AnalysisResult, AppStatus, OHLCVBar, StockDataResponse } from "@/lib/types";
import type { TradingChartHandle } from "@/components/chart/TradingChart";
import TickerInput from "@/components/ui/TickerInput";
import AnalysisPanel from "@/components/ui/AnalysisPanel";
import StatusOverlay from "@/components/ui/StatusOverlay";
import WatchlistPanel from "@/components/ui/WatchlistPanel";
import DraftPanel from "@/components/ui/DraftPanel";
import AppHeader from "@/components/ui/AppHeader";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useDraft } from "@/hooks/useDraft";
import { cn } from "@/lib/utils";

// TradingChart uses browser APIs — load client-side only
// Cast to preserve forwardRef typings through next/dynamic
const TradingChart = dynamic(() => import("@/components/chart/TradingChart"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#0a0a0f] rounded-xl animate-pulse" />,
}) as React.ComponentType<React.ComponentPropsWithRef<typeof import("@/components/chart/TradingChart").default>>;

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
  const [shareToast, setShareToast] = useState<"idle" | "uploading" | "copied" | "error">("idle");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const chartRef = useRef<TradingChartHandle>(null);
  const activeTickerRef = useRef<string>("");

  const { watchlist, addToWatchlist, removeFromWatchlist, reanalyze, loadCachedAnalysis } =
    useWatchlist();
  const { draft, removeFromDraft, reanalyzeDraft } = useDraft();

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
    activeTickerRef.current = inputTicker;

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
      if (activeTickerRef.current !== inputTicker) return;
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to fetch stock data");
      return;
    }

    if (activeTickerRef.current !== inputTicker) return;
    setBars(stockData.bars);
    setMeta(stockData.meta);

    // Step 2: AI Analysis (SSE)
    setStatus("analyzing");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: inputTicker, bars: stockData.bars, indicators: [] }),
      });

      if (!res.ok || !res.body) throw new Error("AI analysis couldn't be completed. Please try again.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let result: AnalysisResult | null = null;
      let errorMsg: string | null = null;

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === "done")  { result = event.result; break outer; }
          if (event.type === "error") { errorMsg = event.message; break outer; }
        }
      }

      if (errorMsg) throw new Error(errorMsg);
      if (!result)  throw new Error("The AI returned an unexpected response. Please try again.");

      // Always cache — even if user has moved to another ticker
      fetch(`/api/analysis/${encodeURIComponent(inputTicker)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bars: stockData.bars, result, meta: stockData.meta }),
      }).catch(() => { /* non-fatal */ });

      // Only update UI if this is still the active ticker
      if (activeTickerRef.current !== inputTicker) return;
      applyAnalysisResult(result);

    } catch (err) {
      if (activeTickerRef.current !== inputTicker) return;
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

  const handleShare = useCallback(async () => {
    if (!chartRef.current || shareToast === "uploading") return;
    setShareToast("uploading");
    try {
      const dataUrl = await chartRef.current.captureImage();

      // Upload to Vercel Blob → get public URL
      const uploadRes = await fetch("/api/share-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData: dataUrl, ticker }),
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();

      // Copy URL to clipboard
      await navigator.clipboard.writeText(url);
      setShareToast("copied");
    } catch {
      setShareToast("error");
    } finally {
      setTimeout(() => setShareToast("idle"), 3000);
    }
  }, [ticker, shareToast]);

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

          {/* ── Left Sidebar (Watchlist + Draft) ─────────────────────────────── */}
          <div
            className={cn(
              "shrink-0 border-r border-border bg-surface/50 flex flex-col h-full overflow-hidden transition-all duration-200",
              sidebarCollapsed ? "w-12" : "w-64"
            )}
          >
            <WatchlistPanel
              watchlist={watchlist}
              activeTicker={ticker || undefined}
              onSelect={handleWatchlistSelect}
              onAddToWatchlist={addToWatchlist}
              onRemove={removeFromWatchlist}
              onReanalyze={reanalyze}
              collapsed={sidebarCollapsed}
              onCollapsedChange={setSidebarCollapsed}
            />
            {!sidebarCollapsed && (
              <DraftPanel
                draft={draft}
                activeTicker={ticker || undefined}
                onSelect={handleWatchlistSelect}
                onPromoteToWatchlist={(t, name) => {
                  addToWatchlist(t, name);
                  removeFromDraft(t);
                }}
                onRemove={removeFromDraft}
                onReanalyze={reanalyzeDraft}
              />
            )}
          </div>

          {/* Chart Area */}
          <div className="flex-1 relative p-3 min-w-0 min-h-0 flex flex-col gap-2">
            {/* Toolbar */}
            {status === "done" && bars.length > 0 && (
              <div className="flex items-center justify-end shrink-0">
                <button
                  onClick={handleShare}
                  disabled={shareToast === "uploading"}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg border font-medium text-sm transition-all duration-200 disabled:opacity-50",
                    shareToast === "copied"
                      ? "bg-bull/10 border-bull/40 text-bull"
                      : shareToast === "error"
                        ? "bg-bear/10 border-bear/40 text-bear"
                        : "bg-surface border-border text-muted-foreground hover:text-foreground hover:border-accent/50 hover:bg-surface/80"
                  )}
                >
                  {shareToast === "uploading" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : shareToast === "copied" ? (
                    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <Share2 className="w-4 h-4" />
                  )}
                  {shareToast === "uploading" ? "Uploading…" : shareToast === "copied" ? "Link copied!" : shareToast === "error" ? "Failed" : "Share chart"}
                </button>
              </div>
            )}

            <div className="relative flex-1 min-h-0 rounded-xl border border-border overflow-hidden">

              {bars.length > 0 && (
                <TradingChart
                  ref={chartRef}
                  bars={bars}
                  analysis={analysis}
                  activePatternIds={activePatternIds}
                  keyLevels={analysis?.keyLevels ?? null}
                  showKeyLevels={showKeyLevels}
                  setupBox={analysis?.entrySignal ? {
                    entry: analysis.entrySignal.entryPrice,
                    stopLoss: analysis.entrySignal.stopLoss,
                    target: analysis.entrySignal.target,
                    direction: analysis.entrySignal.direction,
                    hasEntry: analysis.entrySignal.hasEntry,
                  } : null}
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
            <aside className="w-80 shrink-0 border-l border-border overflow-y-auto bg-surface/50 backdrop-blur-sm p-4 pb-16 animate-fade-in">
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
