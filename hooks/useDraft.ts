"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { WatchlistItem } from "@/lib/types";
import { useUserPlan } from "@/hooks/useUserPlan";
import { draftExpiryMs } from "@/lib/plans";

const STORAGE_KEY = "draft_items";
const MAX_CONCURRENT = 2;

export type DraftItem = WatchlistItem;

// ── localStorage helpers ────────────────────────────────────────────────────

type StoredDraft = Array<{ ticker: string; name: string; addedAt: number }>;

function loadStoredDraft(): StoredDraft {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredDraft(items: StoredDraft) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* non-fatal */ }
}

/**
 * Write a ticker directly to localStorage draft — used by the landing page
 * to queue a stock without mounting the hook.
 * Returns false if the ticker was already in draft.
 */
export function addToDraftStorage(ticker: string, name: string): boolean {
  try {
    const existing = loadStoredDraft();
    if (existing.some((i) => i.ticker === ticker)) return false;
    saveStoredDraft([...existing, { ticker, name, addedAt: Date.now() }]);
    return true;
  } catch {
    return false;
  }
}

// ── Full analysis pipeline ──────────────────────────────────────────────────

async function runFullAnalysis(ticker: string) {
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

// ── Hook ────────────────────────────────────────────────────────────────────

export function useDraft() {
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const activeCountRef = useRef(0);
  const pendingQueueRef = useRef<string[]>([]);
  const { plan, limits } = useUserPlan();

  const updateItem = useCallback((ticker: string, updates: Partial<DraftItem>) => {
    setDraft((prev) =>
      prev.map((item) => (item.ticker === ticker ? { ...item, ...updates } : item))
    );
  }, []);

  // ── Analysis queue (max MAX_CONCURRENT parallel) ──────────────────────────

  const analyzeItem = useCallback(
    async (ticker: string) => {
      // Check analysis cache first — skip fresh analysis if within 24h
      try {
        const cacheRes = await fetch(`/api/analysis/${encodeURIComponent(ticker)}`);
        if (cacheRes.ok) {
          const cached = await cacheRes.json();
          const age = Date.now() - new Date(cached.analyzedAt).getTime();
          if (age <= 24 * 60 * 60 * 1000) {
            const sig = cached.result?.entrySignal;
            updateItem(ticker, {
              status: "done",
              entrySignal: sig?.hasEntry
                ? {
                    direction:       sig.direction,
                    entryPrice:      sig.entryPrice,
                    stopLoss:        sig.stopLoss,
                    target:          sig.target,
                    riskRewardRatio: sig.riskRewardRatio,
                  }
                : undefined,
            });
            return;
          }
        }
      } catch { /* fall through to fresh analysis */ }

      try {
        const { bars, result, meta } = await runFullAnalysis(ticker);

        // Cache the result
        fetch(`/api/analysis/${encodeURIComponent(ticker)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bars, result, meta }),
        }).catch(() => { /* non-fatal */ });

        const sig = result.entrySignal?.hasEntry ? result.entrySignal : null;
        updateItem(ticker, {
          status: "done",
          entrySignal: sig
            ? {
                direction:       sig.direction,
                entryPrice:      sig.entryPrice,
                stopLoss:        sig.stopLoss,
                target:          sig.target,
                riskRewardRatio: sig.riskRewardRatio,
              }
            : undefined,
        });
      } catch (err) {
        updateItem(ticker, {
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Analysis failed",
        });
      }
    },
    [updateItem]
  );

  // Forward declaration trick — drainQueue and queueAnalysis reference each other
  const drainQueueRef = useRef<() => void>(() => {});

  const queueAnalysis = useCallback(
    (ticker: string) => {
      if (activeCountRef.current < MAX_CONCURRENT) {
        activeCountRef.current++;
        analyzeItem(ticker).finally(() => {
          activeCountRef.current--;
          drainQueueRef.current();
        });
      } else {
        pendingQueueRef.current.push(ticker);
      }
    },
    [analyzeItem]
  );

  useEffect(() => {
    drainQueueRef.current = () => {
      while (
        activeCountRef.current < MAX_CONCURRENT &&
        pendingQueueRef.current.length > 0
      ) {
        const ticker = pendingQueueRef.current.shift()!;
        activeCountRef.current++;
        analyzeItem(ticker).finally(() => {
          activeCountRef.current--;
          drainQueueRef.current();
        });
      }
    };
  }, [analyzeItem]);

  // ── Load from localStorage on mount — filter expired items ───────────────

  useEffect(() => {
    const stored = loadStoredDraft();
    if (stored.length === 0) return;

    // Filter out items older than the current plan's expiry window
    const expiryMs = draftExpiryMs(plan);
    const now = Date.now();
    const valid = stored.filter((s) => now - s.addedAt < expiryMs);

    if (valid.length < stored.length) {
      saveStoredDraft(valid);
    }

    if (valid.length === 0) return;

    const items: DraftItem[] = valid.map((s) => ({
      ticker:  s.ticker,
      name:    s.name,
      status:  "analyzing" as const,
      addedAt: s.addedAt,
    }));
    setDraft(items);

    // Queue analysis for all stored items (cache hits are fast)
    items.forEach((item) => queueAnalysis(item.ticker));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  // ── Public API ────────────────────────────────────────────────────────────

  const addToDraft = useCallback(
    (ticker: string, name: string): { ok: boolean; limitReached?: boolean } => {
      let result: { ok: boolean; limitReached?: boolean } = { ok: false };

      setDraft((prev) => {
        if (prev.some((i) => i.ticker === ticker)) {
          result = { ok: true }; // already in draft — idempotent
          return prev;
        }

        // Enforce slot limit
        if (prev.length >= limits.draftSlots) {
          result = { ok: false, limitReached: true };
          return prev;
        }

        // Persist to localStorage
        const stored = loadStoredDraft();
        if (!stored.some((i) => i.ticker === ticker)) {
          saveStoredDraft([...stored, { ticker, name, addedAt: Date.now() }]);
        }

        result = { ok: true };
        return [
          ...prev,
          { ticker, name, status: "analyzing" as const, addedAt: Date.now() },
        ];
      });

      if (result.ok && !result.limitReached) {
        queueAnalysis(ticker);
      }
      return result;
    },
    [queueAnalysis, limits.draftSlots]
  );

  const removeFromDraft = useCallback((ticker: string) => {
    setDraft((prev) => {
      const next = prev.filter((i) => i.ticker !== ticker);
      saveStoredDraft(next.map((i) => ({ ticker: i.ticker, name: i.name, addedAt: i.addedAt })));
      return next;
    });
  }, []);

  const reanalyzeDraft = useCallback(
    (ticker: string) => {
      updateItem(ticker, { status: "analyzing", errorMessage: undefined });
      queueAnalysis(ticker);
    },
    [updateItem, queueAnalysis]
  );

  return { draft, addToDraft, removeFromDraft, reanalyzeDraft, draftLimit: limits.draftSlots, plan };
}
