"use client";

import { useState, useEffect, useCallback } from "react";
import type { WatchlistItem, CachedAnalysis } from "@/lib/types";

// ── Full analysis pipeline (OHLCV → Gemini) ────────────────────────────────────

async function runFullAnalysis(ticker: string): Promise<{
  bars: CachedAnalysis["bars"];
  result: CachedAnalysis["result"];
  meta: CachedAnalysis["meta"];
}> {
  const stockRes = await fetch(
    `/api/stock-data?ticker=${encodeURIComponent(ticker)}&timeframe=1d&bars=200`
  );
  if (!stockRes.ok) {
    const body = await stockRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to fetch stock data");
  }
  const stockData = await stockRes.json();

  const analyzeRes = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, bars: stockData.bars, indicators: [] }),
  });
  if (!analyzeRes.ok || !analyzeRes.body) throw new Error("AI analysis failed");

  const reader = analyzeRes.body.getReader();
  const decoder = new TextDecoder();
  let result = null;
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
  if (!result)  throw new Error("AI analysis failed");

  return { bars: stockData.bars, result, meta: stockData.meta };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // ── React state helpers ──────────────────────────────────────────────────────

  const updateItem = useCallback((ticker: string, updates: Partial<WatchlistItem>) => {
    setWatchlist((prev) =>
      prev.map((item) => (item.ticker === ticker ? { ...item, ...updates } : item))
    );
  }, []);

  // ── DB helpers ───────────────────────────────────────────────────────────────

  const persistStatus = useCallback(
    (ticker: string, status: "done" | "error", errorMessage?: string) => {
      fetch(`/api/watchlist/${encodeURIComponent(ticker)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, errorMessage }),
      }).catch(() => { /* non-fatal */ });
    },
    []
  );

  // ── Background analysis ──────────────────────────────────────────────────────

  const analyzeInBackground = useCallback(
    async (ticker: string, forceRefresh: boolean) => {
      // Check analysis cache first (unless forced refresh); skip if older than 24h
      if (!forceRefresh) {
        const cacheRes = await fetch(`/api/analysis/${encodeURIComponent(ticker)}`);
        if (cacheRes.ok) {
          const cached = await cacheRes.json();
          const age = Date.now() - new Date(cached.analyzedAt).getTime();
          if (age <= 24 * 60 * 60 * 1000) {
            updateItem(ticker, { status: "done" });
            persistStatus(ticker, "done");
            // Create a setup from cache if a clear entry signal exists
            const sig = cached.result?.entrySignal;
            const primaryPattern = cached.result?.patterns?.find(
              (p: { type: string }) => p.type !== "support" && p.type !== "resistance"
            );
            fetch("/api/setups", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ticker,
                companyName:  cached.meta?.name,
                pattern:      primaryPattern?.type ?? (sig?.hasEntry ? "momentum_continuation" : "watching"),
                confidence:   primaryPattern?.confidenceScore ?? 0,
                entryPrice:   sig?.hasEntry ? sig.entryPrice : 0,
                stopPrice:    sig?.hasEntry ? sig.stopLoss : 0,
                targetPrice:  sig?.hasEntry ? sig.target : 0,
                rationale:    sig?.rationale ?? null,
                direction:    sig?.hasEntry ? sig.direction : "long",
              }),
            }).catch(() => {});
            return;
          }
        }
      }

      try {
        const { bars, result, meta } = await runFullAnalysis(ticker);

        // Save analysis result to DB
        fetch(`/api/analysis/${encodeURIComponent(ticker)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bars, result, meta }),
        }).catch(() => { /* non-fatal */ });

        const es = result.entrySignal?.hasEntry ? {
          direction:       result.entrySignal.direction,
          entryPrice:      result.entrySignal.entryPrice,
          stopLoss:        result.entrySignal.stopLoss,
          target:          result.entrySignal.target,
          riskRewardRatio: result.entrySignal.riskRewardRatio,
        } : undefined;
        updateItem(ticker, { status: "done", entrySignal: es });
        persistStatus(ticker, "done");

        // Always create/update a setup row — PENDING if signal found, WATCHING otherwise
        {
          const primaryPattern = result.patterns.find(
            (p) => p.type !== "support" && p.type !== "resistance"
          );
          const lastBar = bars[bars.length - 1];
          fetch("/api/setups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticker,
              companyName: meta?.name ?? ticker,
              pattern: primaryPattern?.type ?? (es ? "momentum_continuation" : "watching"),
              confidence: primaryPattern?.confidenceScore ?? 0,
              entryPrice: es?.entryPrice ?? 0,
              stopPrice: es?.stopLoss ?? 0,
              targetPrice: es?.target ?? 0,
              rationale: result.entrySignal?.rationale ?? null,
              direction: es?.direction ?? "long",
              fittedPrice: lastBar?.close ?? null,
              patternInvalidationLevel: es?.stopLoss ?? null,
              keyLevels: result.keyLevels ?? null,
            }),
          }).catch(() => { /* non-fatal */ });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Analysis failed";
        updateItem(ticker, { status: "error", errorMessage });
        persistStatus(ticker, "error", errorMessage);
      }
    },
    [updateItem, persistStatus]
  );

  // ── Load watchlist from DB on mount ──────────────────────────────────────────

  useEffect(() => {
    fetch("/api/watchlist")
      .then((res) => res.json())
      .then((rows: Array<{
        ticker: string;
        name: string;
        status: string;
        added_at: string;
        error_message: string | null;
      }>) => {
        const items: WatchlistItem[] = rows.map((row) => ({
          ticker:       row.ticker,
          name:         row.name,
          // 'pending' items in DB haven't finished analysis — treat as analyzing
          status:       row.status === "pending" ? "analyzing" : (row.status as WatchlistItem["status"]),
          addedAt:      new Date(row.added_at).getTime(),
          errorMessage: row.error_message ?? undefined,
        }));
        setWatchlist(items);

        // Load entry signals for already-done items (parallel, non-blocking)
        rows
          .filter((row) => row.status === "done")
          .forEach(async (row) => {
            try {
              const res = await fetch(`/api/analysis/${encodeURIComponent(row.ticker)}`);
              if (!res.ok) return;
              const data = await res.json();
              const sig = data.result?.entrySignal;
              if (sig?.hasEntry) {
                setWatchlist((prev) =>
                  prev.map((item) =>
                    item.ticker === row.ticker
                      ? {
                          ...item,
                          entrySignal: {
                            direction:       sig.direction,
                            entryPrice:      sig.entryPrice,
                            stopLoss:        sig.stopLoss,
                            target:          sig.target,
                            riskRewardRatio: sig.riskRewardRatio,
                          },
                        }
                      : item
                  )
                );
                // Always create/update setup row (PENDING if signal, WATCHING otherwise)
                {
                  const primaryPattern = data.result?.patterns?.find(
                    (p: { type: string }) => p.type !== "support" && p.type !== "resistance"
                  );
                  fetch("/api/setups", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ticker:       row.ticker,
                      companyName:  data.meta?.name,
                      pattern:      primaryPattern?.type ?? (sig?.hasEntry ? "momentum_continuation" : "watching"),
                      confidence:   primaryPattern?.confidenceScore ?? 0,
                      entryPrice:   sig?.hasEntry ? sig.entryPrice : 0,
                      stopPrice:    sig?.hasEntry ? sig.stopLoss : 0,
                      targetPrice:  sig?.hasEntry ? sig.target : 0,
                      rationale:    sig?.rationale ?? null,
                      direction:    sig?.hasEntry ? sig.direction : "long",
                    }),
                  }).catch(() => {});
                }
              }
            } catch { /* non-fatal */ }
          });

        // Auto-resume analysis for any items that were pending (never finished)
        rows
          .filter((row) => row.status === "pending")
          .forEach((row) => analyzeInBackground(row.ticker, false));
      })
      .catch(() => { /* DB unavailable — start with empty list */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  // ── Public API ───────────────────────────────────────────────────────────────

  const addToWatchlist = useCallback(
    async (ticker: string, name: string) => {
      // Optimistic UI update
      setWatchlist((prev) => {
        if (prev.some((item) => item.ticker === ticker)) return prev;
        return [
          ...prev,
          { ticker, name, status: "analyzing" as const, addedAt: Date.now() },
        ];
      });

      // Persist to DB
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, name }),
      }).catch(() => { /* non-fatal */ });

      analyzeInBackground(ticker, false);
    },
    [analyzeInBackground]
  );

  const removeFromWatchlist = useCallback((ticker: string) => {
    setWatchlist((prev) => prev.filter((item) => item.ticker !== ticker));
    fetch(`/api/watchlist/${encodeURIComponent(ticker)}`, { method: "DELETE" }).catch(
      () => { /* non-fatal */ }
    );
  }, []);

  const reanalyze = useCallback(
    (ticker: string) => {
      updateItem(ticker, { status: "analyzing", errorMessage: undefined });
      analyzeInBackground(ticker, true);
    },
    [updateItem, analyzeInBackground]
  );

  const loadCachedAnalysis = useCallback(
    async (ticker: string): Promise<CachedAnalysis | null> => {
      const res = await fetch(`/api/analysis/${encodeURIComponent(ticker)}`);
      if (!res.ok) return null;
      const data: CachedAnalysis = await res.json();
      // Treat cache as stale if analyzed more than 24 hours ago
      const age = Date.now() - new Date(data.analyzedAt).getTime();
      if (age > 24 * 60 * 60 * 1000) return null;
      return data;
    },
    []
  );

  return {
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
    reanalyze,
    loadCachedAnalysis,
  };
}
