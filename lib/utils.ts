import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { PatternSentiment, PatternType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PATTERN_COLORS: Record<PatternSentiment, { line: string; fill: string; marker: string }> = {
  bullish: {
    line: "#22c55e",
    fill: "rgba(34,197,94,0.12)",
    marker: "#22c55e",
  },
  bearish: {
    line: "#ef4444",
    fill: "rgba(239,68,68,0.12)",
    marker: "#ef4444",
  },
  neutral: {
    line: "#a78bfa",
    fill: "rgba(167,139,250,0.12)",
    marker: "#a78bfa",
  },
};

export const PATTERN_LABELS: Record<PatternType, string> = {
  head_and_shoulders: "Head & Shoulders",
  inverse_head_and_shoulders: "Inv. Head & Shoulders",
  double_top: "Double Top",
  double_bottom: "Double Bottom",
  triple_top: "Triple Top",
  triple_bottom: "Triple Bottom",
  falling_wedge: "Falling Wedge",
  rising_wedge: "Rising Wedge",
  bull_flag: "Bull Flag",
  bear_flag: "Bear Flag",
  ascending_channel: "Ascending Channel",
  descending_channel: "Descending Channel",
  horizontal_channel: "Horizontal Channel",
  support: "Support Level",
  resistance: "Resistance Level",
  bullish_reversal: "Bullish Reversal",
  bearish_reversal: "Bearish Reversal",
  cup_and_handle: "Cup & Handle",
  uptrend_line: "Uptrend Line",
  downtrend_line: "Downtrend Line",
  gap_up: "Gap Up",
  gap_down: "Gap Down",
};

export function formatPrice(price: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatTimestamp(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
