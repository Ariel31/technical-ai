"use client";

import dynamic from "next/dynamic";
import React, { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Brain, Loader2, Bookmark, BookmarkCheck, Share2, PanelRightClose, PanelRightOpen } from "lucide-react";
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
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [watchlistAdded, setWatchlistAdded] = useState(false);
  const [currentSetupId, setCurrentSetupId] = useState<string | null>(null);
  const [currentSetupStatus, setCurrentSetupStatus] = useState<string | null>(null);
  const [committedPrices, setCommittedPrices] = useState<{ entry: number; stop: number; target: number; direction: "long" | "short" } | null>(null);

  const chartRef = useRef<TradingChartHandle>(null);
  const activeTickerRef = useRef<string>("");
  const committedPricesRef = useRef<typeof committedPrices>(null);
  const currentTickerRef = useRef<string>("");

  // Keep refs in sync with state for use inside memoized callbacks
  useEffect(() => { committedPricesRef.current = committedPrices; }, [committedPrices]);
  useEffect(() => { currentTickerRef.current = ticker; }, [ticker]);

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
        // Sync setup so refine feature is available
        const es = cached.result.entrySignal;
        if (es) {
          const primaryPattern = cached.result.patterns.find(
            (p) => p.type !== "support" && p.type !== "resistance"
          );
          fetch("/api/setups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticker: upper,
              companyName: cached.meta?.name ?? upper,
              pattern: primaryPattern?.type ?? "momentum_continuation",
              confidence: primaryPattern?.confidenceScore ?? 0,
              entryPrice: es.hasEntry ? es.entryPrice : 0,
              stopPrice:  es.hasEntry ? es.stopLoss   : 0,
              targetPrice: es.hasEntry ? es.target    : 0,
              rationale: es.rationale ?? null,
              direction: es.direction,
            }),
          })
            .then(() => fetchSetupForTicker(upper))
            .catch(() => fetchSetupForTicker(upper));
        } else {
          fetchSetupForTicker(upper);
        }
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

  function fetchSetupForTicker(t: string) {
    fetch(`/api/setups?ticker=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((rows: { id: string; status: string }[]) => {
        setCurrentSetupId(rows[0]?.id ?? null);
        setCurrentSetupStatus(rows[0]?.status ?? null);
      })
      .catch(() => { /* non-fatal */ });
  }

  // ── Main analysis flow ────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async (inputTicker: string) => {
    // Capture committed setup before clearing state — used if re-analyzing same ticker
    const previousCommitted = currentTickerRef.current === inputTicker ? committedPricesRef.current : null;

    activeTickerRef.current = inputTicker;

    setTicker(inputTicker);
    setError(undefined);
    setAnalysis(null);
    setActivePatternIds(new Set());
    setCurrentSetupId(null);
    setCurrentSetupStatus(null);
    setCommittedPrices(null);

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
        body: JSON.stringify({
          ticker: inputTicker,
          bars: stockData.bars,
          indicators: [],
          ...(previousCommitted ? {
            existingSetup: {
              entryPrice: previousCommitted.entry,
              stopLoss:   previousCommitted.stop,
              target:     previousCommitted.target,
              direction:  previousCommitted.direction,
            },
          } : {}),
        }),
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

      // Create/sync setup row so refine feature is available immediately
      if (result.entrySignal) {
        const primaryPattern = result.patterns.find(
          (p) => p.type !== "support" && p.type !== "resistance"
        );
        const es = result.entrySignal;
        fetch("/api/setups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: inputTicker,
            companyName: stockData.meta?.name ?? inputTicker,
            pattern: primaryPattern?.type ?? "momentum_continuation",
            confidence: primaryPattern?.confidenceScore ?? 0,
            entryPrice: es.hasEntry ? es.entryPrice : 0,
            stopPrice:  es.hasEntry ? es.stopLoss   : 0,
            targetPrice: es.hasEntry ? es.target    : 0,
            rationale: es.rationale ?? null,
            direction: es.direction,
          }),
        })
          .then(() => fetchSetupForTicker(inputTicker))
          .catch(() => fetchSetupForTicker(inputTicker));
      } else {
        fetchSetupForTicker(inputTicker);
      }

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
      setCurrentSetupId(null);
      setCurrentSetupStatus(null);
      setCommittedPrices(null);
      setStatus("fetching_data");

      const cached = await loadCachedAnalysis(t);
      if (!cached) {
        handleAnalyze(t);
        return;
      }

      setBars(cached.bars);
      setMeta(cached.meta);
      applyAnalysisResult(cached.result);
      const es = cached.result.entrySignal;
      if (es) {
        const primaryPattern = cached.result.patterns.find(
          (p) => p.type !== "support" && p.type !== "resistance"
        );
        fetch("/api/setups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticker: t,
            companyName: cached.meta?.name ?? t,
            pattern: primaryPattern?.type ?? "momentum_continuation",
            confidence: primaryPattern?.confidenceScore ?? 0,
            entryPrice: es.hasEntry ? es.entryPrice : 0,
            stopPrice:  es.hasEntry ? es.stopLoss   : 0,
            targetPrice: es.hasEntry ? es.target    : 0,
            rationale: es.rationale ?? null,
            direction: es.direction,
          }),
        })
          .then(() => fetchSetupForTicker(t))
          .catch(() => fetchSetupForTicker(t));
      } else {
        fetchSetupForTicker(t);
      }
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
                onClick={() => {
                  if (isInWatchlist) return;
                  addToWatchlist(ticker, meta.name);
                  setWatchlistAdded(true);
                  setTimeout(() => setWatchlistAdded(false), 2500);
                }}
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
          <div className="flex-1 relative p-3 min-w-0 min-h-0 flex flex-col">
            <div className="relative flex-1 min-h-0 rounded-xl border border-border overflow-hidden">

              {bars.length > 0 && (
                <TradingChart
                  ref={chartRef}
                  bars={bars}
                  analysis={analysis}
                  activePatternIds={activePatternIds}
                  keyLevels={analysis?.keyLevels ?? null}
                  showKeyLevels={showKeyLevels}
                  setupBox={committedPrices ? {
                    entry: committedPrices.entry,
                    stopLoss: committedPrices.stop,
                    target: committedPrices.target,
                    direction: committedPrices.direction,
                    hasEntry: true,
                  } : analysis?.entrySignal ? {
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

              {/* Share button — top-right chart overlay */}
              {status === "done" && bars.length > 0 && (
                <div className="absolute top-3 right-3 z-10">
                  <button
                    onClick={handleShare}
                    disabled={shareToast === "uploading"}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-all duration-200 backdrop-blur-sm disabled:opacity-50",
                      shareToast === "copied"
                        ? "bg-bull/15 border-bull/40 text-bull"
                        : shareToast === "error"
                          ? "bg-bear/15 border-bear/40 text-bear"
                          : "bg-surface/90 border-white/20 text-white/70 hover:text-white hover:border-white/40"
                    )}
                  >
                    {shareToast === "uploading" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : shareToast === "copied" ? (
                      <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <Share2 className="w-4 h-4" />
                    )}
                    {shareToast === "uploading" ? "Uploading…" : shareToast === "copied" ? "Copied!" : shareToast === "error" ? "Failed" : "Share"}
                  </button>
                </div>
              )}

            </div>
          </div>

          {/* Analysis Sidebar — shown during analysis (skeleton) and when done */}
          {((analysis && status === "done") || (status === "analyzing" && bars.length > 0)) && (
            <aside className={cn(
              "shrink-0 border-l border-border bg-surface/50 backdrop-blur-sm flex flex-col h-full overflow-hidden transition-all duration-200",
              rightCollapsed ? "w-10" : "w-80"
            )}>
              {/* Collapse toggle */}
              <div className={cn(
                "flex shrink-0 border-b border-border/50",
                rightCollapsed ? "justify-center py-2.5" : "justify-end px-2 py-2"
              )}>
                <button
                  onClick={() => setRightCollapsed((v) => !v)}
                  title={rightCollapsed ? "Expand analysis" : "Collapse analysis"}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
                >
                  {rightCollapsed
                    ? <PanelRightOpen className="w-4 h-4" />
                    : <PanelRightClose className="w-4 h-4" />
                  }
                </button>
              </div>

              {!rightCollapsed && (
                <div className="flex-1 overflow-y-auto scrollbar-prominent">
                  {status === "analyzing" && !analysis ? (
                    /* Skeleton while AI is working */
                    <div className="p-4 space-y-4 animate-pulse">
                      <div className="h-16 rounded-xl bg-surface-elevated" />
                      <div className="space-y-2 px-1">
                        <div className="h-3 rounded-full bg-surface-elevated w-full" />
                        <div className="h-3 rounded-full bg-surface-elevated w-4/5" />
                        <div className="h-3 rounded-full bg-surface-elevated w-2/3" />
                      </div>
                      <div className="h-32 rounded-xl bg-surface-elevated" />
                      <div className="h-4 rounded-full bg-surface-elevated w-1/3 mt-2" />
                      <div className="h-16 rounded-xl bg-surface-elevated" />
                      <div className="h-16 rounded-xl bg-surface-elevated" />
                    </div>
                  ) : analysis ? (
                    <div className="p-4 pb-16 animate-fade-in">
                      <AnalysisPanel
                        analysis={analysis}
                        activePatternIds={activePatternIds}
                        onTogglePattern={handleTogglePattern}
                        onToggleAll={handleToggleAll}
                        onToggleKeyLevels={handleToggleKeyLevels}
                        showKeyLevels={showKeyLevels}
                        currency={meta?.currency ?? "USD"}
                        setupId={currentSetupId}
                        setupStatus={currentSetupStatus}
                        onVersionCommit={setCommittedPrices}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </aside>
          )}
        </div>
      </main>

      {/* Watchlist added toast */}
      {watchlistAdded && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-accent/30 bg-surface shadow-lg text-sm font-medium text-foreground animate-fade-in pointer-events-none">
          <BookmarkCheck className="w-4 h-4 text-accent" />
          Added to watchlist
        </div>
      )}
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
