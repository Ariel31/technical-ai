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
    PENDING:    { label: "Waiting for entry", icon: <Clock className="w-3 h-3" />,        className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    ACTIVE:     { label: "Active",            icon: <Activity className="w-3 h-3" />,      className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    TARGET_HIT: { label: "Target Hit",        icon: <CheckCircle2 className="w-3 h-3" />, className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    STOP_HIT:   { label: "Stop Hit",          icon: <XCircle className="w-3 h-3" />,      className: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
    EXPIRED:    { label: "Expired",           icon: <Clock className="w-3 h-3" />,         className: "bg-surface-elevated text-muted-foreground border-border" },
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
  const rr = s.entryPrice > 0 && s.stopPrice > 0
    ? +((s.targetPrice - s.entryPrice) / (s.entryPrice - s.stopPrice)).toFixed(1)
    : 0;
  const upside = s.entryPrice > 0
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
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold border bg-surface-elevated text-muted-foreground border-border">
              {s.pattern}
            </span>
          </div>
          {s.companyName && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.companyName}</p>
          )}
        </div>
        <StatusBadge status={s.status} />
      </div>

      {/* Price levels */}
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

      {/* Footer */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border pt-2 mt-auto">
        <span>Confidence: {s.confidence}%  ·  R/R {rr}:1  ·  +{upside}% upside</span>
        <span>{date}</span>
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
          ? `${s.returnPercent >= 0 ? "+" : ""}${s.returnPercent.toFixed(1)}%`
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

  const live    = setups.filter((s) => s.status === "PENDING" || s.status === "ACTIVE");
  const history = setups.filter((s) => s.status === "TARGET_HIT" || s.status === "STOP_HIT" || s.status === "EXPIRED");

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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Total Setups"  value={String(stats.totalSetups)} />
                <StatCard label="Win Rate"      value={stats.winRate > 0 ? `${stats.winRate}%` : "—"} accent="green" sub={`${stats.wins}W / ${stats.losses}L`} />
                <StatCard label="Avg Return"    value={stats.avgReturn !== 0 ? `${stats.avgReturn > 0 ? "+" : ""}${stats.avgReturn}%` : "—"} accent={stats.avgReturn > 0 ? "green" : stats.avgReturn < 0 ? "red" : undefined} />
                <StatCard label="Best Trade"    value={stats.bestTrade !== 0 ? `+${stats.bestTrade}%` : "—"} accent="green" />
                <StatCard label="Worst Trade"   value={stats.worstTrade !== 0 ? `${stats.worstTrade}%` : "—"} accent="red" />
                <StatCard label="Active"        value={String(stats.activeCount)} accent="blue" sub="pending + active" />
              </div>
            )}

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
                      New setups are created automatically every time the homepage runs a scan.
                    </p>
                  </div>
                  <Link
                    href="/"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-accent/30 bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
                  >
                    <TrendingUp className="w-4 h-4" /> Go to Homepage
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
