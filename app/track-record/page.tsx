"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import AppHeader from "@/components/ui/AppHeader";
import {
  Trophy,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Clock,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  BarChart2,
} from "lucide-react";
import type { TrackedSetup, TrackRecordStats } from "@/lib/types";
import { cn } from "@/lib/utils";

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TrackedSetup["status"] }) {
  const map: Record<TrackedSetup["status"], { label: string; icon: React.ReactNode; className: string }> = {
    WATCHING:   { label: "Watching",          icon: <Activity className="w-3 h-3" />,      className: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
    PENDING:    { label: "Waiting for entry", icon: <Clock className="w-3 h-3" />,         className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    ACTIVE:     { label: "Active",            icon: <Activity className="w-3 h-3" />,      className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    TARGET_HIT: { label: "Target Hit",        icon: <CheckCircle2 className="w-3 h-3" />,  className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    STOP_HIT:   { label: "Stop Hit",          icon: <XCircle className="w-3 h-3" />,       className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
    EXPIRED:    { label: "Expired",           icon: <Clock className="w-3 h-3" />,          className: "bg-surface-elevated text-muted-foreground border-border" },
    VOIDED:     { label: "Voided",            icon: <XCircle className="w-3 h-3" />,        className: "bg-surface-elevated text-muted-foreground/50 border-border" },
  };
  const { label, icon, className } = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border", className)}>
      {icon} {label}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: "green" | "red" | "blue" }) {
  const color = accent === "green" ? "text-emerald-400" : accent === "red" ? "text-rose-400" : accent === "blue" ? "text-blue-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4 flex flex-col gap-1">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Live setup card ──────────────────────────────────────────────────────────

function LiveCard({ s }: { s: TrackedSetup }) {
  const isWatching = s.status === "WATCHING";
  const rr = !isWatching && s.entryPrice > 0 && s.stopPrice > 0
    ? +((s.targetPrice - s.entryPrice) / (s.entryPrice - s.stopPrice)).toFixed(1)
    : 0;
  const upside = !isWatching && s.entryPrice > 0
    ? +((s.targetPrice - s.entryPrice) / s.entryPrice * 100).toFixed(1)
    : 0;
  const date = new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4 flex flex-col gap-3 hover:border-accent/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-bold text-foreground">{s.ticker}</span>
            {!isWatching && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-surface-elevated text-muted-foreground border-border">
                {s.pattern}
              </span>
            )}
            {rr > 0 && (
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                rr >= 2 ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : rr >= 1 ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                : "bg-rose-500/15 text-rose-400 border-rose-500/30"
              )}>
                R/R {rr}:1
              </span>
            )}
          </div>
          {s.companyName && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.companyName}</p>
          )}
        </div>
        <StatusBadge status={s.status} />
      </div>

      {/* Price levels — only for real setups */}
      {isWatching ? (
        <div className="rounded-lg bg-surface-elevated/50 border border-border border-dashed p-3 text-center">
          <p className="text-xs text-muted-foreground">Waiting for entry signal</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">AI will detect a setup automatically</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-surface-elevated p-2">
            <p className="text-[10px] text-muted-foreground">Entry</p>
            <p className="text-xs font-semibold text-foreground">${s.entryPrice.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-surface-elevated p-2">
            <p className="text-[10px] text-muted-foreground">Stop</p>
            <p className="text-xs font-semibold text-rose-400">${s.stopPrice.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-surface-elevated p-2">
            <p className="text-[10px] text-muted-foreground">Target</p>
            <p className="text-xs font-semibold text-emerald-400">${s.targetPrice.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-2 mt-auto">
        {isWatching
          ? <span>Added {date} · analyzing for setup</span>
          : <span>Confidence: {s.confidence}%  ·  R/R {rr}:1  ·  +{upside}% upside</span>
        }
        {!isWatching && <span>{date}</span>}
      </div>

      {/* Analyze link */}
      <Link
        href={`/app?ticker=${s.ticker}`}
        className="flex items-center justify-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 border border-accent/20 rounded-lg py-1.5 transition-colors hover:bg-accent/5"
      >
        <BarChart2 className="w-3.5 h-3.5" /> Analyze Chart
      </Link>
    </div>
  );
}

// ─── History row ──────────────────────────────────────────────────────────────

function HistoryRow({ s }: { s: TrackedSetup }) {
  const createdDate = new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const closedDate  = s.closedAt
    ? new Date(s.closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const isWin  = s.result === "WIN";
  const isLoss = s.result === "LOSS";

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      {/* Return */}
      <div className={cn(
        "w-16 shrink-0 text-sm font-bold text-right",
        isWin ? "text-emerald-400" : isLoss ? "text-rose-400" : "text-muted-foreground"
      )}>
        {s.returnPercent != null
          ? `${s.result === "WIN" ? "+" : s.result === "LOSS" ? "-" : ""}${Math.abs(s.returnPercent).toFixed(1)}%`
          : "—"}
      </div>

      {/* Icon */}
      <div className="shrink-0">
        {isWin  && <TrendingUp className="w-4 h-4 text-emerald-400" />}
        {isLoss && <TrendingDown className="w-4 h-4 text-rose-400" />}
        {!isWin && !isLoss && <Clock className="w-4 h-4 text-muted-foreground" />}
      </div>

      {/* Ticker + pattern */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground">{s.ticker}</span>
          <span className="text-xs text-muted-foreground truncate">{s.pattern}</span>
        </div>
        {s.companyName && (
          <p className="text-[11px] text-muted-foreground truncate">{s.companyName}</p>
        )}
      </div>

      {/* Status + dates */}
      <div className="shrink-0 text-right space-y-0.5">
        <StatusBadge status={s.status} />
        <p className="text-[10px] text-muted-foreground">
          {createdDate}{closedDate ? ` → ${closedDate}` : ""}
        </p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TrackRecordPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"live" | "history">("live");
  const [refreshing, setRefreshing] = useState(false);

  // Sync watchlist entry signals → setups table on every page load
  useEffect(() => {
    fetch("/api/setups/sync", { method: "POST" })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["setups"] });
        queryClient.invalidateQueries({ queryKey: ["setups-stats"] });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: stats, isLoading: statsLoading } = useQuery<TrackRecordStats>({
    queryKey: ["setups-stats"],
    queryFn: () => fetch("/api/setups/stats").then((r) => r.json()),
  });

  const { data: setups = [], isLoading: setupsLoading } = useQuery<TrackedSetup[]>({
    queryKey: ["setups"],
    queryFn: () => fetch("/api/setups").then((r) => r.json()),
  });

  const loading = statsLoading || setupsLoading;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch("/api/setups/monitor", { method: "POST" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["setups"] }),
        queryClient.invalidateQueries({ queryKey: ["setups-stats"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  // Auto-refresh prices on mount so statuses are always current
  const didAutoRefresh = useRef(false);
  useEffect(() => {
    if (didAutoRefresh.current) return;
    didAutoRefresh.current = true;
    handleRefresh();
  }, [handleRefresh]);

  const live    = setups.filter((s) => s.status === "WATCHING" || s.status === "PENDING" || s.status === "ACTIVE");
  const history = setups.filter((s) => s.status === "TARGET_HIT" || s.status === "STOP_HIT" || s.status === "EXPIRED");

  const expectancy = stats && stats.wins + stats.losses > 0
    ? +((stats.winRate / 100) * stats.avgWin - (1 - stats.winRate / 100) * Math.abs(stats.avgLoss)).toFixed(1)
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader activePage="track-record" />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 rounded-xl bg-accent/10 border border-accent/20">
                <Trophy className="w-5 h-5 text-accent" />
              </div>
              AI Track Record
            </h1>
            <p className="text-sm text-muted-foreground mt-1 ml-14">
              Every AI-generated trade setup tracked to completion
            </p>
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-surface text-sm font-medium text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            Refresh Prices
          </button>
        </div>

        {/* Stats strip */}
        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground gap-3">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <StatCard label="Total Setups"  value={String(stats.totalSetups)} />
                <StatCard label="Win Rate"      value={stats.winRate > 0 ? `${stats.winRate}%` : "—"} accent="green" sub={`${stats.wins}W / ${stats.losses}L`} />
                <StatCard label="Avg Return"    value={stats.avgReturn !== 0 ? `${stats.avgReturn > 0 ? "+" : ""}${stats.avgReturn}%` : "—"} accent={stats.avgReturn > 0 ? "green" : stats.avgReturn < 0 ? "red" : undefined} />
                <StatCard
                  label="Expectancy"
                  value={expectancy !== null ? `${expectancy > 0 ? "+" : ""}${expectancy}%` : "—"}
                  accent={expectancy !== null && expectancy > 0 ? "green" : expectancy !== null && expectancy < 0 ? "red" : undefined}
                />
                <StatCard label="Best Trade"    value={stats.bestTrade !== 0 ? `+${stats.bestTrade}%` : "—"} accent="green" />
                <StatCard label="Worst Trade"   value={stats.worstTrade !== 0 ? `${stats.worstTrade}%` : "—"} accent="red" />
                <StatCard label="Active"        value={String(stats.activeCount)} accent="blue" sub="pending + active" />
              </div>
            )}

            {/* Pattern breakdown */}
            {(() => {
              const patternMap = new Map<string, { wins: number; losses: number; returns: number[] }>();
              for (const s of history) {
                if (!s.pattern) continue;
                const p = patternMap.get(s.pattern) ?? { wins: 0, losses: 0, returns: [] };
                if (s.result === "WIN") p.wins++;
                if (s.result === "LOSS") p.losses++;
                if (s.returnPercent != null) p.returns.push(s.returnPercent);
                patternMap.set(s.pattern, p);
              }
              const rows = [...patternMap.entries()]
                .map(([pat, d]) => ({
                  pattern: pat,
                  wins: d.wins,
                  losses: d.losses,
                  avgReturn: d.returns.length ? +(d.returns.reduce((a, b) => a + b, 0) / d.returns.length).toFixed(1) : 0,
                  winPct: d.wins + d.losses > 0 ? Math.round(d.wins / (d.wins + d.losses) * 100) : 0,
                }))
                .sort((a, b) => b.avgReturn - a.avgReturn);
              if (rows.length === 0) return null;
              return (
                <div className="rounded-xl border border-border bg-surface/60 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">By Pattern</h3>
                  {rows.map((row) => (
                    <div key={row.pattern} className="flex items-center gap-3">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-surface-elevated text-muted-foreground border-border w-40 truncate shrink-0">
                        {row.pattern}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${row.winPct}%` }} />
                      </div>
                      <span className="text-[11px] text-muted-foreground shrink-0 w-36 text-right">
                        {row.wins}W / {row.losses}L · {row.avgReturn >= 0 ? "+" : ""}{row.avgReturn}%
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-surface/60 w-fit">
              <button
                onClick={() => setTab("live")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  tab === "live"
                    ? "bg-accent/20 text-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
                )}
              >
                Live Setups ({live.length})
              </button>
              <button
                onClick={() => setTab("history")}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  tab === "history"
                    ? "bg-accent/20 text-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
                )}
              >
                History ({history.length})
              </button>
            </div>

            {/* Live tab */}
            {tab === "live" && (
              live.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16 text-center">
                  <div className="p-3 rounded-full border border-border bg-surface">
                    <Activity className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1">No active setups</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Setups are created when the AI detects a clear entry signal for a stock in your watchlist. Add stocks to your watchlist and let them analyze.
                    </p>
                  </div>
                  <Link
                    href="/app"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-accent/30 bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
                  >
                    <TrendingUp className="w-4 h-4" /> Go to Chart Analysis
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {live.map((s) => <LiveCard key={s.id} s={s} />)}
                </div>
              )
            )}

            {/* History tab */}
            {tab === "history" && (
              history.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
                  <Clock className="w-8 h-8" />
                  <p className="text-sm">No completed setups yet</p>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-surface/60 p-4 divide-y divide-border">
                  {history.map((s) => <HistoryRow key={s.id} s={s} />)}
                </div>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
