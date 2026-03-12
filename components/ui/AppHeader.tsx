"use client";

import Link from "next/link";
import { Activity, TrendingUp, BarChart2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActivePage = "home" | "chart" | "screener";

interface AppHeaderProps {
  /** Which nav item is currently active */
  activePage: ActivePage;
  /** Optional center content (e.g. ticker input). Omit for a spacer. */
  centerSlot?: React.ReactNode;
  /** Optional content between center and nav (e.g. meta + watchlist button) */
  rightSlot?: React.ReactNode;
  /** If provided, Chart Analysis becomes a button instead of a link */
  onChartClick?: () => void;
  /** If provided, Smart Screener becomes a button instead of a link */
  onScreenerClick?: () => void;
}

export default function AppHeader({
  activePage,
  centerSlot,
  rightSlot,
  onChartClick,
  onScreenerClick,
}: AppHeaderProps) {
  return (
    <header className="shrink-0 border-b border-border bg-surface/80 backdrop-blur-md z-20 sticky top-0">
      <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center gap-4">

        {/* Logo → home */}
        <Link
          href="/"
          className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity"
        >
          <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/20">
            <Activity className="w-5 h-5 text-accent" />
          </div>
          <span className="font-bold text-foreground tracking-tight">TechnicalAI</span>
        </Link>

        {/* Center slot (fixed width, doesn't affect nav alignment) */}
        {centerSlot && (
          <div className="w-72 sm:w-80 md:w-96 lg:w-[420px] shrink-0">{centerSlot}</div>
        )}

        {/* Always-present spacer — pushes everything after it to the right */}
        <div className="flex-1" />

        {/* Right slot (meta info, watchlist button, etc.) */}
        {rightSlot && (
          <div className="flex items-center gap-3 shrink-0">
            {rightSlot}
          </div>
        )}

        {/* Nav pill — always rightmost */}
        <nav className="flex items-center gap-0.5 p-1 rounded-xl border border-border bg-surface/60 shrink-0">
          {/* Top Picks — always a link */}
          <Link
            href="/"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              activePage === "home"
                ? "bg-accent/20 text-accent font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Top Picks</span>
          </Link>

          <div className="w-px h-4 bg-border mx-0.5" />

          {/* Chart Analysis — button or link */}
          {onChartClick ? (
            <button
              onClick={onChartClick}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                activePage === "chart"
                  ? "bg-accent/20 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
              )}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chart Analysis</span>
              <span className="sm:hidden">Chart</span>
            </button>
          ) : (
            <Link
              href="/app"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activePage === "chart"
                  ? "bg-accent/20 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
              )}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chart Analysis</span>
              <span className="sm:hidden">Chart</span>
            </Link>
          )}

          {/* Smart Screener — button or link */}
          {onScreenerClick ? (
            <button
              onClick={onScreenerClick}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
                activePage === "screener"
                  ? "bg-accent/20 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
              )}
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Smart Screener</span>
              <span className="sm:hidden">Screener</span>
            </button>
          ) : (
            <Link
              href="/app?tab=screener"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                activePage === "screener"
                  ? "bg-accent/20 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
              )}
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Smart Screener</span>
              <span className="sm:hidden">Screener</span>
            </Link>
          )}
        </nav>

      </div>
    </header>
  );
}
