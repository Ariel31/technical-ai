"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  TrendingUp, RefreshCw, ShieldAlert, BarChart2, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, Loader2, Play, Trash2, ArrowUpRight,
  ArrowDownRight, Clock, Zap, Info, Copy,
} from "lucide-react";
import AppHeader from "@/components/ui/AppHeader";
import { cn } from "@/lib/utils";
import type {
  MomentumPortfolioState, MomentumPositionLive, MomentumPick,
  MomentumTrade, RebalanceDiff,
} from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${fmt(n)}%`;
}
function fmtUSD(n: number) {
  return `$${fmt(n)}`;
}
function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ~21 trading days ≈ 30 calendar days
function addTradingMonth(dateStr: string): Date {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + 30);
  return d;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PortfolioData {
  portfolio: MomentumPortfolioState;
  livePositions: MomentumPositionLive[];
  totalValue: number;
  totalReturn: number;
  spyReturn: number;
  spyNow: number;
  dbSetupRequired?: boolean;
}

interface ExitPreview {
  ticker: string;
  name: string;
  entryDate: string;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnl_pct: number;
}

interface EntryPreview {
  ticker: string;
  name: string;
  momentum: number;
  currentPrice: number;
  rank: number;
}

interface RebalancePreview {
  exits: ExitPreview[];
  entries: EntryPreview[];
  stays: string[];
  picks: MomentumPick[];
  totalScanned: number;
}

interface RebalanceResult {
  date: string;
  soldDetails: Array<{ ticker: string; name: string; pnl: number; pnl_pct: number }>;
  boughtTickers: string[];
  heldTickers: string[];
}

interface PeriodPerf {
  period_label: string;
  snapshot_date: string;
  portfolio_value: number;
  period_strategy: number | null;
  period_spy: number | null;
  alpha: number | null;
  cumulative_strategy: number;
  cumulative_spy: number;
}

interface LatestSnapshot {
  portfolio_value: number;
  spy_price: number;
  snapshot_date: string;
}

// ── SQL Setup Card ─────────────────────────────────────────────────────────────

const SETUP_SQL = `CREATE TABLE momentum_portfolio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE momentum_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  ticker TEXT NOT NULL,
  action TEXT NOT NULL,
  price NUMERIC NOT NULL,
  shares INTEGER NOT NULL,
  cost_basis NUMERIC NOT NULL,
  proceeds NUMERIC,
  pnl NUMERIC,
  pnl_pct NUMERIC,
  entry_date DATE,
  exit_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE momentum_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  portfolio_value NUMERIC NOT NULL,
  spy_price NUMERIC NOT NULL,
  period_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

function SqlSetupCard() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 max-w-2xl">
      <div className="flex items-start gap-3 mb-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-foreground text-sm">Database setup required</p>
          <p className="text-xs text-muted-foreground mt-0.5">Run this SQL in your Supabase SQL editor first:</p>
        </div>
      </div>
      <div className="relative">
        <pre className="text-xs font-mono bg-surface rounded-lg p-4 border border-border overflow-x-auto text-muted-foreground leading-5">{SETUP_SQL}</pre>
        <button
          onClick={() => { navigator.clipboard.writeText(SETUP_SQL); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface-elevated border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <CheckCircle className="w-3.5 h-3.5 text-bull" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 px-5 py-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-2xl font-bold tabular-nums", color ?? "text-foreground")}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type PageState = "loading" | "empty" | "dashboard";
type ScreenerState = "idle" | "running" | "done" | "error";

export default function MomentumPage() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [data, setData] = useState<PortfolioData | null>(null);
  const [dbSetupRequired, setDbSetupRequired] = useState(false);
  const [trades, setTrades] = useState<MomentumTrade[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [perfOpen, setPerfOpen] = useState(false);
  const [monthlyPerf, setMonthlyPerf] = useState<PeriodPerf[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<LatestSnapshot | null>(null);

  // Screener + preview
  const [screenerState, setScreenerState] = useState<ScreenerState>("idle");
  const [screenerProgress, setScreenerProgress] = useState("");
  const [screenerProgressPct, setScreenerProgressPct] = useState(0);
  const [rebalancePreview, setRebalancePreview] = useState<RebalancePreview | null>(null);
  const [screenerError, setScreenerError] = useState("");

  // Rebalance
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceConfirm, setRebalanceConfirm] = useState(false);
  const [rebalanceResult, setRebalanceResult] = useState<RebalanceResult | null>(null);

  // Stop-check
  const [stopChecking, setStopChecking] = useState(false);
  const [stopResult, setStopResult] = useState<{ triggered: string[]; checked: number } | null>(null);

  // Init form
  const [capitalInput, setCapitalInput] = useState("100000");
  const [initializing, setInitializing] = useState(false);

  // Reset
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const autoRebalanceTriggered = useRef(false);

  // ── Computed ─────────────────────────────────────────────────────────────────

  const nextRebalanceDate = useMemo(() => {
    if (!data?.portfolio.last_rebalance) return null;
    return addTradingMonth(data.portfolio.last_rebalance);
  }, [data?.portfolio.last_rebalance]);

  const daysUntilRebalance = useMemo(() => {
    if (!nextRebalanceDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((nextRebalanceDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }, [nextRebalanceDate]);

  const isRebalanceDue = daysUntilRebalance !== null && daysUntilRebalance <= 0;

  // ── Load portfolio ────────────────────────────────────────────────────────

  const loadPortfolio = useCallback(async () => {
    try {
      const res = await fetch("/api/momentum/portfolio");
      if (!res.ok) { setPageState("empty"); return; }
      const json = await res.json();
      if (json.dbSetupRequired) { setDbSetupRequired(true); setPageState("empty"); return; }
      if (!json.portfolio) { setPageState("empty"); return; }
      setData(json);
      setPageState("dashboard");
    } catch {
      setPageState("empty");
    }
  }, []);

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);

  // ── Load trade history ────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/momentum/history");
      if (!res.ok) return;
      const json = await res.json();
      setTrades(json.trades ?? []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (historyOpen && trades.length === 0) loadHistory();
  }, [historyOpen, trades.length, loadHistory]);

  const loadPerformance = useCallback(async () => {
    try {
      const res = await fetch("/api/momentum/performance");
      if (!res.ok) return;
      const json = await res.json();
      setMonthlyPerf(json.periods ?? []);
      setLatestSnapshot(json.latestSnapshot ?? null);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (perfOpen && monthlyPerf.length === 0) loadPerformance();
  }, [perfOpen, monthlyPerf.length, loadPerformance]);

  // ── Auto-rebalance: fires when rebalance is due on page load ──────────────

  const autoRebalance = useCallback(async () => {
    if (!data) return;

    setScreenerState("running");
    setScreenerProgress("Rebalance due — fetching latest momentum rankings…");
    setScreenerProgressPct(0);
    setRebalancePreview(null);
    setScreenerError("");
    setRebalanceResult(null);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/momentum/compute", {
        method: "POST",
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error("Screener failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let picks: MomentumPick[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === "progress") {
            setScreenerProgress(event.message ?? "");
            if (event.done != null && event.total) {
              setScreenerProgressPct(Math.round((event.done / event.total) * 100));
            }
          } else if (event.type === "done") {
            picks = event.picks ?? [];
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      if (!picks.length) throw new Error("No momentum picks returned");

      // Apply directly — no preview/confirmation needed
      await applyRebalance(picks);
      setScreenerState("idle");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setScreenerError(err instanceof Error ? err.message : "Auto-rebalance failed");
      setScreenerState("error");
      autoRebalanceTriggered.current = false; // allow manual retry
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (
      pageState === "dashboard" &&
      isRebalanceDue &&
      screenerState === "idle" &&
      !rebalanceResult &&
      !autoRebalanceTriggered.current
    ) {
      autoRebalanceTriggered.current = true;
      autoRebalance();
    }
  }, [pageState, isRebalanceDue, screenerState, rebalanceResult, autoRebalance]);

  // ── Run screener (SSE) → build rebalance preview ──────────────────────────

  const runScreener = useCallback(async (currentPositions: Record<string, MomentumPositionLive>) => {
    setScreenerState("running");
    setScreenerProgress("Fetching universe from Wikipedia…");
    setScreenerProgressPct(0);
    setRebalancePreview(null);
    setScreenerError("");
    setRebalanceConfirm(false);
    setRebalanceResult(null);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/momentum/compute", {
        method: "POST",
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error("Screener request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6));

          if (event.type === "progress") {
            setScreenerProgress(event.message ?? "");
            if (event.done != null && event.total) {
              setScreenerProgressPct(Math.round((event.done / event.total) * 100));
            }
          } else if (event.type === "done") {
            const picks: MomentumPick[] = event.picks ?? [];
            const currentTickers = Object.keys(currentPositions);
            const newTopN = picks.map((p) => p.ticker);

            const to_sell = currentTickers.filter((t) => !newTopN.includes(t));
            const to_buy = newTopN.filter((t) => !currentTickers.includes(t));
            const to_hold = currentTickers.filter((t) => newTopN.includes(t));

            // Build exit previews (cross-ref with live positions)
            const exits: ExitPreview[] = to_sell.map((ticker) => {
              const pos = currentPositions[ticker];
              return {
                ticker,
                name: pos?.name ?? ticker,
                entryDate: pos?.entry_date ?? "",
                entryPrice: pos?.entry_price ?? 0,
                currentPrice: pos?.current_price ?? 0,
                pnl: pos?.pnl ?? 0,
                pnl_pct: pos?.pnl_pct ?? 0,
              };
            }).sort((a, b) => b.pnl_pct - a.pnl_pct);

            // Build entry previews (from picks)
            const pickMap = new Map(picks.map((p) => [p.ticker, p]));
            const entries: EntryPreview[] = to_buy.map((ticker) => {
              const p = pickMap.get(ticker);
              return {
                ticker,
                name: p?.name ?? ticker,
                momentum: p?.momentum ?? 0,
                currentPrice: p?.currentPrice ?? 0,
                rank: p?.rank ?? 0,
              };
            }).sort((a, b) => b.momentum - a.momentum);

            setRebalancePreview({
              exits,
              entries,
              stays: to_hold,
              picks,
              totalScanned: event.totalScanned ?? picks.length,
            });
            setScreenerState("done");
            setScreenerProgressPct(100);
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setScreenerError(err instanceof Error ? err.message : "Screen failed");
      setScreenerState("error");
    }
  }, []);

  // ── Apply rebalance ───────────────────────────────────────────────────────

  const applyRebalance = useCallback(async (picks: MomentumPick[], initialCapital?: number) => {
    setRebalancing(true);
    try {
      const res = await fetch("/api/momentum/rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks, ...(initialCapital ? { initialCapital } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Rebalance failed");
      }
      const json = await res.json();

      setRebalanceResult({
        date: new Date().toISOString().slice(0, 10),
        soldDetails: json.soldDetails ?? [],
        boughtTickers: json.boughtTickers ?? [],
        heldTickers: rebalancePreview?.stays ?? [],
      });
      setRebalancePreview(null);
      setScreenerState("idle");
      setRebalanceConfirm(false);
      await loadPortfolio();
      if (historyOpen) await loadHistory();
      setMonthlyPerf([]); // force reload
      if (perfOpen) await loadPerformance();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Rebalance failed");
    } finally {
      setRebalancing(false);
    }
  }, [rebalancePreview, loadPortfolio, historyOpen, loadHistory, perfOpen, loadPerformance]);

  // ── Initialize portfolio ──────────────────────────────────────────────────

  const initPortfolio = useCallback(async () => {
    const capital = parseFloat(capitalInput.replace(/[^0-9.]/g, ""));
    if (!capital || capital < 1000) { alert("Please enter a valid capital amount (min $1,000)"); return; }
    setInitializing(true);
    setScreenerState("running");
    setScreenerProgress("Building universe…");
    setScreenerProgressPct(0);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/momentum/compute", {
        method: "POST",
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error("Screen failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let picks: MomentumPick[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const event = JSON.parse(line.slice(6));
          if (event.type === "progress") {
            setScreenerProgress(event.message ?? "");
            if (event.done != null && event.total) setScreenerProgressPct(Math.round((event.done / event.total) * 100));
          } else if (event.type === "done") {
            picks = event.picks ?? [];
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      if (!picks.length) throw new Error("No momentum picks returned");
      await applyRebalance(picks, capital);
      setScreenerState("idle");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setScreenerError(err instanceof Error ? err.message : "Initialization failed");
        setScreenerState("error");
      }
    } finally {
      setInitializing(false);
    }
  }, [capitalInput, applyRebalance]);

  // ── Check stop-losses ─────────────────────────────────────────────────────

  const checkStops = useCallback(async () => {
    setStopChecking(true);
    try {
      const res = await fetch("/api/momentum/stop-check", { method: "POST" });
      if (!res.ok) throw new Error("Stop-check failed");
      const json = await res.json();
      setStopResult({ triggered: json.triggered ?? [], checked: json.checked ?? 0 });
      if ((json.triggered ?? []).length > 0) {
        await loadPortfolio();
        if (historyOpen) await loadHistory();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Stop-check failed");
    } finally {
      setStopChecking(false);
    }
  }, [loadPortfolio, historyOpen, loadHistory]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const resetPortfolio = useCallback(async () => {
    setResetting(true);
    try {
      await fetch("/api/momentum/portfolio", { method: "DELETE" });
      setData(null); setTrades([]); setScreenerState("idle");
      setRebalancePreview(null); setStopResult(null); setRebalanceResult(null);
      setResetConfirm(false); setPageState("empty");
    } catch { /* non-fatal */ } finally {
      setResetting(false);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <AppHeader activePage="momentum" />

      <main className="flex-1 overflow-y-auto scrollbar-prominent">
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Zap className="w-5 h-5 text-accent" />
                12-1 Momentum Strategy
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                S&P 500 + NASDAQ-100 · Top 20 · Monthly rebalance · −20% stop-loss · Paper tracking
              </p>
            </div>
            {pageState === "dashboard" && (
              <button
                onClick={() => setResetConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-bear hover:border-bear/40 transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>

          {/* ── Loading ─────────────────────────────────────────────────────── */}
          {pageState === "loading" && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
            </div>
          )}

          {/* ── Empty / Setup ────────────────────────────────────────────────── */}
          {pageState === "empty" && (
            <div className="space-y-5">
              {dbSetupRequired && <SqlSetupCard />}

              <div className="rounded-2xl border border-border bg-surface/40 p-8 max-w-md">
                <h2 className="text-base font-bold text-foreground mb-1">Start Tracking</h2>
                <p className="text-sm text-muted-foreground mb-5">
                  Enter your starting capital. The strategy will run the 12-1 momentum screen and
                  record an equal-weighted top-20 portfolio — no broker connected.
                </p>

                {screenerState === "running" ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />
                      <span className="truncate">{screenerProgress}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                      <div className="h-full bg-accent transition-all duration-500 rounded-full" style={{ width: `${screenerProgressPct}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{screenerProgressPct}% — takes ~30-60 seconds</p>
                  </div>
                ) : screenerState === "error" ? (
                  <div className="text-sm text-bear mb-4">{screenerError}</div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-sm text-muted-foreground shrink-0">Starting capital:</span>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <input
                          type="text"
                          value={capitalInput}
                          onChange={(e) => setCapitalInput(e.target.value)}
                          className="w-full pl-7 pr-3 py-2 rounded-lg border border-border bg-surface text-sm text-foreground focus:outline-none focus:border-accent/60"
                        />
                      </div>
                    </div>
                    <button
                      onClick={initPortfolio}
                      disabled={initializing}
                      className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-background font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-60"
                    >
                      <Play className="w-4 h-4" />
                      Run Momentum Screen & Start
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Dashboard ─────────────────────────────────────────────────── */}
          {pageState === "dashboard" && data && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Portfolio Value" value={fmtUSD(data.totalValue)} sub={`Started ${fmtUSD(data.portfolio.initial_capital)}`} />
                <StatCard
                  label="Total Return"
                  value={fmtPct(data.totalReturn)}
                  sub="Since inception"
                  color={data.totalReturn >= 0 ? "text-bull" : "text-bear"}
                />
                <StatCard
                  label="Alpha vs SPY"
                  value={fmtPct(data.totalReturn - data.spyReturn)}
                  sub={`SPY: ${fmtPct(data.spyReturn)}`}
                  color={(data.totalReturn - data.spyReturn) >= 0 ? "text-bull" : "text-bear"}
                />
                <StatCard
                  label="Cash"
                  value={fmtUSD(data.portfolio.cash)}
                  sub={`${Object.keys(data.portfolio.positions).length} open positions`}
                />
              </div>

              {/* ── Rebalance card (timer + CTA) ─────────────────────────── */}
              <div className={cn(
                "rounded-2xl border p-5",
                isRebalanceDue
                  ? "border-accent/40 bg-accent/5"
                  : "border-border bg-surface/40"
              )}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Timer */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className={cn("w-4 h-4", isRebalanceDue ? "text-accent" : "text-muted-foreground")} />
                      <span className="text-sm font-semibold text-foreground">
                        {isRebalanceDue ? "Rebalance Due!" : `${daysUntilRebalance} days until next rebalance`}
                      </span>
                      {isRebalanceDue && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-accent/20 text-accent animate-pulse">NOW</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Last rebalanced: {fmtDate(data.portfolio.last_rebalance)}
                      {nextRebalanceDate && ` · Next: ~${nextRebalanceDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                    </p>
                    {/* Progress bar — always visible, fills to 100% when due */}
                    {daysUntilRebalance !== null && (
                      <div className="mt-2.5 w-full h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700",
                            isRebalanceDue ? "bg-accent" : "bg-accent/50"
                          )}
                          style={{ width: isRebalanceDue ? "100%" : `${Math.max(2, ((30 - daysUntilRebalance) / 30) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {isRebalanceDue ? (
                      /* Auto mode — show status instead of button */
                      screenerState === "error" ? (
                        <button
                          onClick={() => { autoRebalanceTriggered.current = false; autoRebalance(); }}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-bear/40 bg-bear/10 text-bear text-sm font-semibold transition-colors hover:bg-bear/20"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Retry Rebalance
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-accent/30 bg-accent/10 text-accent text-sm font-semibold">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {screenerState === "running" ? "Rebalancing…" : "Starting…"}
                        </div>
                      )
                    ) : (
                      /* Manual mode — show button before due date */
                      <button
                        onClick={() => runScreener(
                          Object.fromEntries(data.livePositions.map((p) => [p.ticker, p]))
                        )}
                        disabled={screenerState === "running" || rebalancing}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-accent/30 bg-accent/10 text-accent text-sm font-semibold hover:bg-accent/20 transition-colors disabled:opacity-50"
                      >
                        {screenerState === "running"
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <RefreshCw className="w-4 h-4" />
                        }
                        {screenerState === "running" ? "Scanning…" : "Rebalance Now"}
                      </button>
                    )}

                    <button
                      onClick={checkStops}
                      disabled={stopChecking || rebalancing || screenerState === "running"}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground/70 hover:text-foreground hover:border-border/80 transition-colors disabled:opacity-50"
                    >
                      {stopChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                      {stopChecking ? "Checking…" : "Check Stops"}
                    </button>
                  </div>
                </div>

                {/* Screener / auto-rebalance progress */}
                {screenerState === "running" && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent shrink-0" />
                      <span className="truncate">{screenerProgress || "Scanning universe…"}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                      <div className="h-full bg-accent transition-all duration-500 rounded-full" style={{ width: `${screenerProgressPct}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{screenerProgressPct}% — takes ~30-60 seconds</p>
                  </div>
                )}
                {screenerState === "error" && !isRebalanceDue && (
                  <p className="mt-3 text-xs text-bear">{screenerError}</p>
                )}
              </div>

              {/* ── Stop-check result ─────────────────────────────────────── */}
              {stopResult && (
                <div className={cn(
                  "rounded-xl border px-4 py-3 flex items-start gap-3 text-sm",
                  stopResult.triggered.length > 0 ? "border-bear/30 bg-bear/10" : "border-bull/30 bg-bull/10"
                )}>
                  {stopResult.triggered.length > 0
                    ? <AlertTriangle className="w-4 h-4 text-bear shrink-0 mt-0.5" />
                    : <CheckCircle className="w-4 h-4 text-bull shrink-0 mt-0.5" />
                  }
                  <div className="flex-1">
                    {stopResult.triggered.length > 0 ? (
                      <>
                        <p className="font-semibold text-bear">
                          {stopResult.triggered.length} stop-loss{stopResult.triggered.length > 1 ? "es" : ""} triggered: <span className="font-mono">{stopResult.triggered.join(", ")}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Positions sold. Capital in cash until next rebalance.</p>
                      </>
                    ) : (
                      <p className="text-bull font-medium">All {stopResult.checked} positions above stop-loss — no action needed.</p>
                    )}
                  </div>
                  <button onClick={() => setStopResult(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
                </div>
              )}

              {/* ── Rebalance Result (post-rebalance summary) ─────────────── */}
              {rebalanceResult && (
                <div className="rounded-2xl border border-bull/20 bg-bull/5 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-bull" />
                      <span className="font-semibold text-foreground text-sm">Rebalanced on {rebalanceResult.date}</span>
                    </div>
                    <button onClick={() => setRebalanceResult(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {rebalanceResult.soldDetails.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Exited ({rebalanceResult.soldDetails.length})</p>
                        <div className="space-y-1.5">
                          {rebalanceResult.soldDetails.map((s) => (
                            <div key={s.ticker} className="flex items-center justify-between text-sm">
                              <span className="font-mono font-semibold text-foreground">{s.ticker}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{s.name !== s.ticker && s.name}</span>
                                <span className={cn("font-mono font-semibold text-sm", s.pnl_pct >= 0 ? "text-bull" : "text-bear")}>
                                  {s.pnl_pct >= 0 ? <ArrowUpRight className="w-3.5 h-3.5 inline" /> : <ArrowDownRight className="w-3.5 h-3.5 inline" />}
                                  {fmtPct(s.pnl_pct)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {rebalanceResult.boughtTickers.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Entered ({rebalanceResult.boughtTickers.length})</p>
                        <div className="flex flex-wrap gap-1.5">
                          {rebalanceResult.boughtTickers.map((t) => (
                            <span key={t} className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-bull/10 text-bull">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {rebalanceResult.heldTickers.length > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Held: <span className="text-foreground font-mono">{rebalanceResult.heldTickers.slice(0, 8).join(", ")}{rebalanceResult.heldTickers.length > 8 ? ` +${rebalanceResult.heldTickers.length - 8} more` : ""}</span>
                    </p>
                  )}
                </div>
              )}

              {/* ── Rebalance Preview ─────────────────────────────────────── */}
              {screenerState === "done" && rebalancePreview && (
                <div className="rounded-2xl border border-border bg-surface/40 overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">Rebalance Preview</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Top 20 from {rebalancePreview.totalScanned} tickers scanned
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {rebalancePreview.exits.length > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-bear/10 text-bear font-semibold">{rebalancePreview.exits.length} out</span>
                      )}
                      {rebalancePreview.stays.length > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-surface-elevated text-muted-foreground font-medium">{rebalancePreview.stays.length} hold</span>
                      )}
                      {rebalancePreview.entries.length > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-bull/10 text-bull font-semibold">{rebalancePreview.entries.length} in</span>
                      )}
                    </div>
                  </div>

                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Exiting */}
                    {rebalancePreview.exits.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-bear uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <ArrowDownRight className="w-3.5 h-3.5" />
                          Exiting ({rebalancePreview.exits.length})
                        </p>
                        <div className="space-y-2">
                          {rebalancePreview.exits.map((e) => (
                            <div key={e.ticker} className="flex items-center justify-between rounded-lg border border-bear/20 bg-bear/5 px-3 py-2">
                              <div>
                                <span className="font-mono font-bold text-foreground text-sm">{e.ticker}</span>
                                <div className="text-xs text-muted-foreground">Entry {fmtDate(e.entryDate)} · {fmtUSD(e.entryPrice)} → {fmtUSD(e.currentPrice)}</div>
                              </div>
                              <div className={cn("text-right font-mono font-bold text-base", e.pnl_pct >= 0 ? "text-bull" : "text-bear")}>
                                {e.pnl_pct >= 0 ? <ArrowUpRight className="w-4 h-4 inline mb-0.5" /> : <ArrowDownRight className="w-4 h-4 inline mb-0.5" />}
                                {fmtPct(e.pnl_pct)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Entering */}
                    {rebalancePreview.entries.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-bull uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          Entering ({rebalancePreview.entries.length})
                        </p>
                        <div className="space-y-2">
                          {rebalancePreview.entries.map((e) => (
                            <div key={e.ticker} className="flex items-center justify-between rounded-lg border border-bull/20 bg-bull/5 px-3 py-2">
                              <div>
                                <span className="font-mono font-bold text-foreground text-sm">{e.ticker}</span>
                                <div className="text-xs text-muted-foreground truncate max-w-[180px]">{e.name !== e.ticker ? e.name : ""}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-mono font-bold text-bull text-sm">
                                  {(e.momentum * 100).toFixed(1)}%
                                </div>
                                <div className="text-xs text-muted-foreground">12-1 momentum</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Staying */}
                  {rebalancePreview.stays.length > 0 && (
                    <div className="px-5 py-3 border-t border-border/50 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground font-medium shrink-0">Staying ({rebalancePreview.stays.length}):</span>
                      {rebalancePreview.stays.map((t) => (
                        <span key={t} className="text-xs font-mono text-foreground/70">{t}</span>
                      ))}
                    </div>
                  )}

                  {/* Confirm */}
                  <div className="px-5 py-4 border-t border-border bg-surface/20 flex items-center gap-3">
                    {!rebalanceConfirm ? (
                      <>
                        <button
                          onClick={() => setRebalanceConfirm(true)}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-background text-sm font-bold hover:bg-accent/90 transition-colors"
                        >
                          <RefreshCw className="w-4 h-4" />
                          Confirm Rebalance
                        </button>
                        <button
                          onClick={() => { setRebalancePreview(null); setScreenerState("idle"); }}
                          className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-foreground">
                          Sell <strong className="text-bear">{rebalancePreview.exits.length}</strong>,
                          buy <strong className="text-bull">{rebalancePreview.entries.length}</strong>,
                          hold <strong>{rebalancePreview.stays.length}</strong>. Are you sure?
                        </p>
                        <button
                          onClick={() => applyRebalance(rebalancePreview.picks)}
                          disabled={rebalancing}
                          className="px-4 py-2 rounded-lg bg-accent text-background text-sm font-bold hover:bg-accent/90 disabled:opacity-60 transition-colors"
                        >
                          {rebalancing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, Rebalance"}
                        </button>
                        <button
                          onClick={() => setRebalanceConfirm(false)}
                          className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Back
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── Holdings Table ─────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Holdings ({data.livePositions.length})
                  </p>
                  <button
                    onClick={() => setHistoryOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    Trade History
                    {historyOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {data.livePositions.length === 0 ? (
                  <div className="rounded-xl border border-border bg-surface/40 px-5 py-8 text-center text-sm text-muted-foreground">
                    No open positions. Click <strong>Rebalance Now</strong> to load the strategy.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-surface/40 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50 text-xs text-muted-foreground">
                            <th className="text-left px-4 py-3 font-medium">Ticker</th>
                            <th className="text-right px-4 py-3 font-medium">Shares</th>
                            <th className="text-right px-4 py-3 font-medium">Entry</th>
                            <th className="text-right px-4 py-3 font-medium">Current</th>
                            <th className="text-right px-4 py-3 font-medium">Return</th>
                            <th className="text-right px-4 py-3 font-medium">Value</th>
                            <th className="text-right px-4 py-3 font-medium">Wt%</th>
                            <th className="text-right px-4 py-3 font-medium">Stop</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.livePositions.sort((a, b) => b.pnl_pct - a.pnl_pct).map((pos) => (
                            <tr
                              key={pos.ticker}
                              className={cn(
                                "border-b border-border/30 transition-colors",
                                pos.stop_triggered ? "bg-bear/5 hover:bg-bear/10" : "hover:bg-surface-elevated/40"
                              )}
                            >
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold font-mono text-foreground">{pos.ticker}</span>
                                  {pos.stop_triggered && <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-bear/20 text-bear">STOP</span>}
                                </div>
                                <div className="text-xs text-muted-foreground hidden sm:block truncate max-w-[150px]">{pos.name || ""}</div>
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-foreground/70">{pos.shares}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-foreground/70">{fmtUSD(pos.entry_price)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-foreground font-medium">{fmtUSD(pos.current_price)}</td>
                              <td className={cn("px-4 py-2.5 text-right font-mono font-bold", pos.pnl_pct >= 0 ? "text-bull" : "text-bear")}>
                                <div className="flex items-center justify-end gap-0.5">
                                  {pos.pnl_pct >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                                  {fmtPct(pos.pnl_pct)}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-foreground/70">{fmtUSD(pos.market_value)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{fmt(pos.weight_pct)}%</td>
                              <td className={cn("px-4 py-2.5 text-right font-mono text-xs", pos.stop_triggered ? "text-bear font-bold" : "text-muted-foreground")}>
                                {fmtUSD(pos.stop_price)}{pos.stop_triggered ? " ⚡" : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-surface-elevated/30 border-t border-border text-xs font-semibold">
                            <td colSpan={4} className="px-4 py-2 text-muted-foreground">Totals</td>
                            <td className={cn("px-4 py-2 text-right font-mono", data.totalReturn >= 0 ? "text-bull" : "text-bear")}>
                              {fmtPct(data.totalReturn)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-foreground">
                              {fmtUSD(data.livePositions.reduce((s, p) => s + p.market_value, 0))}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-foreground">
                              {fmt(data.livePositions.reduce((s, p) => s + p.weight_pct, 0))}%
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Monthly Performance ───────────────────────────────────── */}
              <div>
                <button
                  onClick={() => setPerfOpen((v) => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors mb-3"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Monthly Performance
                  {perfOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>

                {perfOpen && (() => {
                  // "Current" period (in-progress since last snapshot)
                  const currentPeriod = latestSnapshot && data ? {
                    period_strategy: latestSnapshot.portfolio_value > 0
                      ? Math.round((data.totalValue / latestSnapshot.portfolio_value - 1) * 10000) / 100
                      : null,
                    period_spy: latestSnapshot.spy_price > 0
                      ? Math.round((data.spyNow / latestSnapshot.spy_price - 1) * 10000) / 100
                      : null,
                  } : null;
                  const currentAlpha = currentPeriod?.period_strategy != null && currentPeriod?.period_spy != null
                    ? Math.round((currentPeriod.period_strategy - currentPeriod.period_spy) * 100) / 100
                    : null;

                  const allRows = [
                    // Current in-progress period (top)
                    ...(currentPeriod ? [{
                      key: "current",
                      label: "Current",
                      strategy: currentPeriod.period_strategy,
                      spy: currentPeriod.period_spy,
                      alpha: currentAlpha,
                      cumulative_strategy: data?.totalReturn ?? null,
                      cumulative_spy: data?.spyReturn ?? null,
                      isCurrent: true,
                    }] : []),
                    // Completed periods
                    ...monthlyPerf.map((p) => ({
                      key: p.snapshot_date,
                      label: p.period_label,
                      strategy: p.period_strategy,
                      spy: p.period_spy,
                      alpha: p.alpha,
                      cumulative_strategy: p.cumulative_strategy,
                      cumulative_spy: p.cumulative_spy,
                      isCurrent: false,
                    })),
                  ];

                  return monthlyPerf.length === 0 && !currentPeriod ? (
                    <div className="rounded-xl border border-border bg-surface/40 px-5 py-6 text-center text-sm text-muted-foreground">
                      Performance data recorded after each rebalance. Complete your first cycle to see results.
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border bg-surface/40 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/50 text-xs text-muted-foreground">
                              <th className="text-left px-4 py-3 font-medium">Period</th>
                              <th className="text-right px-4 py-3 font-medium">Strategy</th>
                              <th className="text-right px-4 py-3 font-medium">SPY</th>
                              <th className="text-right px-4 py-3 font-medium">Alpha</th>
                              <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Cumul. Strategy</th>
                              <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Cumul. SPY</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allRows.map((row) => (
                              <tr
                                key={row.key}
                                className={cn(
                                  "border-b border-border/30 transition-colors",
                                  row.isCurrent
                                    ? "bg-accent/5 hover:bg-accent/10"
                                    : "hover:bg-surface-elevated/40"
                                )}
                              >
                                <td className="px-4 py-2.5">
                                  <span className="font-medium text-foreground text-xs">{row.label}</span>
                                  {row.isCurrent && (
                                    <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-semibold bg-accent/20 text-accent">live</span>
                                  )}
                                </td>
                                <td className={cn(
                                  "px-4 py-2.5 text-right font-mono font-bold",
                                  row.strategy == null ? "text-muted-foreground" :
                                  row.strategy >= 0 ? "text-bull" : "text-bear"
                                )}>
                                  {row.strategy != null ? fmtPct(row.strategy) : "—"}
                                </td>
                                <td className={cn(
                                  "px-4 py-2.5 text-right font-mono",
                                  row.spy == null ? "text-muted-foreground" :
                                  row.spy >= 0 ? "text-bull/70" : "text-bear/70"
                                )}>
                                  {row.spy != null ? fmtPct(row.spy) : "—"}
                                </td>
                                <td className={cn(
                                  "px-4 py-2.5 text-right font-mono font-semibold",
                                  row.alpha == null ? "text-muted-foreground" :
                                  row.alpha >= 0 ? "text-accent" : "text-bear"
                                )}>
                                  {row.alpha != null ? fmtPct(row.alpha) : "—"}
                                </td>
                                <td className={cn(
                                  "px-4 py-2.5 text-right font-mono text-xs hidden sm:table-cell",
                                  row.cumulative_strategy == null ? "text-muted-foreground" :
                                  (row.cumulative_strategy ?? 0) >= 0 ? "text-bull" : "text-bear"
                                )}>
                                  {row.cumulative_strategy != null ? fmtPct(row.cumulative_strategy) : "—"}
                                </td>
                                <td className={cn(
                                  "px-4 py-2.5 text-right font-mono text-xs hidden sm:table-cell",
                                  row.cumulative_spy == null ? "text-muted-foreground" :
                                  (row.cumulative_spy ?? 0) >= 0 ? "text-bull/60" : "text-bear/60"
                                )}>
                                  {row.cumulative_spy != null ? fmtPct(row.cumulative_spy) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ── Trade History ──────────────────────────────────────────── */}
              {historyOpen && (
                <div className="rounded-2xl border border-border bg-surface/40 overflow-hidden">
                  <div className="px-5 py-3 border-b border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trade History</p>
                  </div>
                  {trades.length === 0 ? (
                    <div className="px-5 py-6 text-center text-sm text-muted-foreground">No trades recorded yet.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50 text-xs text-muted-foreground">
                            <th className="text-left px-4 py-2.5 font-medium">Date</th>
                            <th className="text-left px-4 py-2.5 font-medium">Ticker</th>
                            <th className="text-left px-4 py-2.5 font-medium">Action</th>
                            <th className="text-right px-4 py-2.5 font-medium">Price</th>
                            <th className="text-right px-4 py-2.5 font-medium">Shares</th>
                            <th className="text-right px-4 py-2.5 font-medium">Value</th>
                            <th className="text-right px-4 py-2.5 font-medium">P&L</th>
                            <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Reason</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trades.map((t) => (
                            <tr key={t.id} className="border-b border-border/30 hover:bg-surface-elevated/40 transition-colors">
                              <td className="px-4 py-2 font-mono text-muted-foreground text-xs">{t.date}</td>
                              <td className="px-4 py-2 font-semibold font-mono text-foreground">{t.ticker}</td>
                              <td className="px-4 py-2">
                                <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", t.action === "BUY" ? "bg-bull/10 text-bull" : "bg-bear/10 text-bear")}>
                                  {t.action}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-foreground/70">{fmtUSD(t.price)}</td>
                              <td className="px-4 py-2 text-right font-mono text-foreground/70">{t.shares}</td>
                              <td className="px-4 py-2 text-right font-mono text-foreground/70">
                                {fmtUSD(t.action === "SELL" ? (t.proceeds ?? t.price * t.shares) : t.cost_basis)}
                              </td>
                              <td className={cn("px-4 py-2 text-right font-mono font-semibold text-xs",
                                t.pnl == null ? "text-muted-foreground" : t.pnl >= 0 ? "text-bull" : "text-bear"
                              )}>
                                {t.pnl != null
                                  ? `${t.pnl >= 0 ? "+" : ""}${fmtUSD(t.pnl)} (${fmtPct(t.pnl_pct ?? 0)})`
                                  : "—"
                                }
                              </td>
                              <td className="px-4 py-2 text-xs text-muted-foreground hidden sm:table-cell">
                                {t.exit_reason === "stop_loss" ? <span className="text-bear">Stop-loss</span> : t.exit_reason === "rebalance" ? "Rebalance" : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Info footer */}
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 pb-4">
                <Info className="w-3.5 h-3.5 shrink-0" />
                Paper tracking only — no real trades. Prices are delayed end-of-day from Yahoo Finance.
              </p>
            </>
          )}

        </div>
      </main>

      {/* Reset confirmation */}
      {resetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm mx-4 rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="font-bold text-foreground mb-2">Reset Portfolio?</h3>
            <p className="text-sm text-muted-foreground mb-6">This will permanently delete your portfolio state and all trade history.</p>
            <div className="flex gap-3">
              <button
                onClick={resetPortfolio}
                disabled={resetting}
                className="flex-1 py-2.5 rounded-xl bg-bear text-white font-semibold text-sm hover:bg-bear/90 disabled:opacity-60 transition-colors"
              >
                {resetting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Yes, Reset"}
              </button>
              <button
                onClick={() => setResetConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-surface-elevated transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
