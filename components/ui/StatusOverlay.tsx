"use client";

import { Loader2, Brain, AlertCircle, TrendingUp } from "lucide-react";
import type { AppStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatusOverlayProps {
  status: AppStatus;
  error?: string;
}

export default function StatusOverlay({ status, error }: StatusOverlayProps) {
  if (status === "idle") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm rounded-xl">
        <div className="p-4 rounded-2xl border border-border bg-surface animate-pulse-glow">
          <TrendingUp className="w-10 h-10 text-accent" />
        </div>
        <div className="text-center">
          <p className="text-foreground font-semibold">Enter a ticker to begin</p>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered technical analysis with pattern detection
          </p>
        </div>
      </div>
    );
  }

  if (status === "fetching_data") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm rounded-xl">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
        <div className="text-center">
          <p className="text-foreground font-semibold">Fetching market data...</p>
          <p className="text-sm text-muted-foreground mt-1">Loading OHLCV bars</p>
        </div>
        {/* Shimmer bar */}
        <div className="w-48 h-1.5 rounded-full overflow-hidden bg-border">
          <div
            className="h-full w-1/2 rounded-full"
            style={{
              background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.5s linear infinite",
            }}
          />
        </div>
      </div>
    );
  }

  if (status === "analyzing") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm rounded-xl">
        <div className="relative">
          <Brain className="w-8 h-8 text-accent" />
          <Loader2 className="w-12 h-12 text-accent/30 animate-spin absolute -inset-2" />
        </div>
        <div className="text-center">
          <p className="text-foreground font-semibold">AI is analyzing the chart...</p>
          <p className="text-sm text-muted-foreground mt-1">
            Detecting patterns & key levels
          </p>
        </div>
        <div
          className="text-xs text-muted-foreground font-mono px-3 py-1.5 rounded-lg border border-border bg-surface"
          style={{ animation: "fade-in 0.5s ease" }}
        >
          Gemini 2.0 Flash • Pattern Recognition
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm rounded-xl">
        <div className="p-3 rounded-xl bg-bear/10 border border-bear/30">
          <AlertCircle className="w-7 h-7 text-bear" />
        </div>
        <div className="text-center max-w-xs">
          <p className="text-foreground font-semibold">Something went wrong</p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {error ?? "An unexpected error occurred. Please try again."}
          </p>
        </div>
      </div>
    );
  }

  return null;
}
