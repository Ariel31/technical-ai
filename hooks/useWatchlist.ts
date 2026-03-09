"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { WatchlistItem, CachedAnalysis } from "@/lib/types";

const STORAGE_KEY = "watchlist";

function loadFromStorage(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const items = JSON.parse(raw) as WatchlistItem[];
    // Reset "analyzing" items to "pending" on page reload (in-progress work was lost)
    return items.map((item) =>
      item.status === "analyzing" ? { ...item, status: "pending" as const } : item
    );
  } catch {
    return [];
  }
}

function saveToStorage(items: WatchlistItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* storage full or unavailable */ }
}

async function runFullAnalysis(ticker: string): Promise<{
  bars: CachedAnalysis["bars"];
  result: CachedAnalysis["result"];
  meta: CachedAnalysis["meta"];
}> {
  // Step 1: Fetch OHLCV
  const stockRes = await fetch(
    `/api/stock-data?ticker=${encodeURIComponent(ticker)}&timeframe=1d&bars=200`
  );
  if (!stockRes.ok) {
    const body = await stockRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "Failed to fetch stock data");
  }
  const stockData = await stockRes.json();

  // Step 2: AI Analysis
  const analyzeRes = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, bars: stockData.bars, indicators: [] }),
  });
  if (!analyzeRes.ok) {
    const body = await analyzeRes.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? "AI analysis failed");
  }
  const result = await analyzeRes.json();

  return { bars: stockData.bars, result, meta: stockData.meta };
}

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const loadedRef = useRef(false);

  // Load from localStorage on mount (client only)
  useEffect(() => {
    setWatchlist(loadFromStorage());
    loadedRef.current = true;
  }, []);

  // Persist to localStorage after every change (after initial load)
  useEffect(() => {
    if (loadedRef.current) {
      saveToStorage(watchlist);
    }
  }, [watchlist]);

  const updateItem = useCallback((ticker: string, updates: Partial<WatchlistItem>) => {
    setWatchlist((prev) =>
      prev.map((item) => (item.ticker === ticker ? { ...item, ...updates } : item))
    );
  }, []);

  const analyzeInBackground = useCallback(
    async (ticker: string, forceRefresh: boolean) => {
      // Check DB cache first (unless forced refresh)
      if (!forceRefresh) {
        const cacheRes = await fetch(`/api/analysis/${encodeURIComponent(ticker)}`);
        if (cacheRes.ok) {
          updateItem(ticker, { status: "done" });
          return;
        }
      }

      try {
        const { bars, result, meta } = await runFullAnalysis(ticker);

        // Save to DB (fire-and-forget; don't block the status update)
        fetch(`/api/analysis/${encodeURIComponent(ticker)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bars, result, meta }),
        }).catch(() => { /* save errors are non-fatal */ });

        updateItem(ticker, { status: "done" });
      } catch (err) {
        updateItem(ticker, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Analysis failed",
        });
      }
    },
    [updateItem]
  );

  const addToWatchlist = useCallback(
    (ticker: string, name: string) => {
      setWatchlist((prev) => {
        // Don't add duplicates
        if (prev.some((item) => item.ticker === ticker)) return prev;
        return [
          ...prev,
          { ticker, name, status: "analyzing" as const, addedAt: Date.now() },
        ];
      });
      analyzeInBackground(ticker, false);
    },
    [analyzeInBackground]
  );

  const removeFromWatchlist = useCallback((ticker: string) => {
    setWatchlist((prev) => prev.filter((item) => item.ticker !== ticker));
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
      return res.json();
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
