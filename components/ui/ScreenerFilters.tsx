"use client";

import { getFiltersByCategory, type FilterDefinition } from "@/lib/screener-rules";
import type { UserScreenerConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface Props {
  config: UserScreenerConfig;
  onChange: (config: UserScreenerConfig) => void;
  disabled?: boolean;
}

const CATEGORIES: { key: FilterDefinition["category"]; label: string }[] = [
  { key: "pattern",   label: "Patterns" },
  { key: "indicator", label: "Indicators" },
  { key: "fibonacci", label: "Fibonacci Levels" },
  { key: "risk",      label: "Risk / R:R" },
];

export default function ScreenerFilters({ config, onChange, disabled }: Props) {
  const active = new Set(config.activeFilters);

  function toggle(id: string) {
    if (disabled) return;
    const next = new Set(active);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...config, activeFilters: [...next] });
  }

  function clearAll() {
    if (disabled) return;
    onChange({ ...config, activeFilters: [] });
  }

  const hasAny = active.size > 0;

  return (
    <div className="rounded-xl border border-border bg-surface/40 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Filters
          {hasAny && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-[10px] font-bold">
              {active.size}
            </span>
          )}
        </span>
        {hasAny && (
          <button
            onClick={clearAll}
            disabled={disabled}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      {/* Category sections */}
      {CATEGORIES.map(({ key, label }) => {
        const filters = getFiltersByCategory(key);
        return (
          <div key={key} className="space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">
              {label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {filters.map((f) => {
                const isActive = active.has(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggle(f.id)}
                    disabled={disabled}
                    title={f.description}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
                      isActive
                        ? "bg-accent/20 border-accent/40 text-accent"
                        : "bg-surface border-border text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-surface-elevated",
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
