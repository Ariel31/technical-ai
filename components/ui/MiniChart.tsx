"use client";

import { useEffect, useRef } from "react";
import type { MiniBar } from "@/lib/types";

interface Props {
  bars: MiniBar[];
  entry: number;
  stop: number;
  target: number;
  breakoutLevel?: number;
  patternKey?: string;
  isLong: boolean;
}

// ─── Legend ───────────────────────────────────────────────────────────────────

const LEGEND: Record<string, { color: string; dash?: boolean; label: string }[]> = {
  bull_flag: [
    { color: "#facc15", label: "Flag zone" },
    { color: "#facc15", label: "● Pole top" },
  ],
  cup_and_handle: [
    { color: "#60a5fa", label: "● Cup bottom" },
    { color: "#facc15", label: "● Handle start" },
  ],
  double_bottom: [
    { color: "#ef4444", label: "▼ Bottoms" },
  ],
  consolidation_breakout: [
    { color: "#facc15", label: "Tight range" },
  ],
  sma_bounce: [
    { color: "#22c55e", label: "▲ Bounce" },
  ],
  momentum_continuation: [
    { color: "#22c55e", label: "▲ Momentum" },
  ],
  falling_wedge: [
    { color: "#f97316", label: "Upper wedge" },
    { color: "#f97316", label: "▼ Wedge start" },
  ],
  inverse_head_and_shoulders: [
    { color: "#60a5fa", label: "▼ L shoulder" },
    { color: "#ef4444", label: "▼ Head" },
    { color: "#60a5fa", label: "▼ R shoulder" },
  ],
};

const BASE_LEGEND = [
  { color: "#22c55e",              label: "Target" },
  { color: "rgba(255,255,255,0.5)", label: "Entry"  },
  { color: "#ef4444",              label: "Stop"   },
];

// ─── Pattern overlays ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addPatternOverlays(series: any, bars: MiniBar[], patternKey: string, LineStyle: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markers: any[] = [];

  switch (patternKey) {
    case "bull_flag": {
      // Flag = last 10 bars; pole = bars at positions -30 to -10 within the 90-bar stored window
      const flagBars = bars.slice(-10);
      const poleBars = bars.slice(-30, -10);

      if (poleBars.length > 0) {
        const peak = poleBars.reduce((mx, b) => b.h > mx.h ? b : mx, poleBars[0]);
        markers.push({ time: peak.t, position: "aboveBar", color: "#facc15", shape: "circle", size: 1, text: "" });
      }
      // Flag channel boundaries
      const fHigh = Math.max(...flagBars.map((b) => b.h));
      const fLow  = Math.min(...flagBars.map((b) => b.l));
      series.createPriceLine({ price: fHigh, color: "rgba(250,204,21,0.6)", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
      series.createPriceLine({ price: fLow,  color: "rgba(250,204,21,0.3)", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
      break;
    }

    case "cup_and_handle": {
      // Cup body = first 78 bars of the 90-bar window; handle = last 12
      const cupBars    = bars.slice(0, -12);
      const handleBars = bars.slice(-12);
      if (cupBars.length > 0) {
        const bottom = cupBars.reduce((mn, b) => b.l < mn.l ? b : mn, cupBars[0]);
        markers.push({ time: bottom.t, position: "belowBar", color: "#60a5fa", shape: "circle", size: 1, text: "" });
      }
      if (handleBars.length > 0) {
        // Mark start of handle
        markers.push({ time: handleBars[0].t, position: "aboveBar", color: "#facc15", shape: "circle", size: 1, text: "" });
      }
      break;
    }

    case "double_bottom": {
      const search = bars.slice(-60);
      const mid    = Math.floor(search.length / 2);

      let lo1Idx = 0;
      for (let i = 1; i < mid; i++) if (search[i].l < search[lo1Idx].l) lo1Idx = i;
      let lo2Idx = mid;
      for (let i = mid + 1; i < search.length; i++) if (search[i].l < search[lo2Idx].l) lo2Idx = i;

      markers.push(
        { time: search[lo1Idx].t, position: "belowBar", color: "#ef4444", shape: "arrowDown", size: 1, text: "" },
        { time: search[lo2Idx].t, position: "belowBar", color: "#ef4444", shape: "arrowDown", size: 1, text: "" },
      );
      break;
    }

    case "consolidation_breakout": {
      const consoBars = bars.slice(-10);
      const cHigh = Math.max(...consoBars.map((b) => b.h));
      const cLow  = Math.min(...consoBars.map((b) => b.l));
      series.createPriceLine({ price: cHigh, color: "rgba(250,204,21,0.65)", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
      series.createPriceLine({ price: cLow,  color: "rgba(250,204,21,0.35)", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
      break;
    }

    case "sma_bounce": {
      const recent  = bars.slice(-8);
      const bounceB = recent.reduce((mn, b) => b.l < mn.l ? b : mn, recent[0]);
      markers.push({ time: bounceB.t, position: "belowBar", color: "#22c55e", shape: "arrowUp", size: 1, text: "" });
      break;
    }

    case "momentum_continuation": {
      const last = bars[bars.length - 1];
      markers.push({ time: last.t, position: "aboveBar", color: "#22c55e", shape: "arrowUp", size: 1, text: "" });
      break;
    }

    case "falling_wedge": {
      // Mark the start of the wedge (swing high ~40 bars back) + current upper trendline
      const wedgeBars = bars.slice(-40);
      if (wedgeBars.length > 0) {
        // Upper wedge start — highest high in first 6 bars of wedge window
        const wedgeTop = wedgeBars.slice(0, 6).reduce((mx, b) => b.h > mx.h ? b : mx, wedgeBars[0]);
        markers.push({ time: wedgeTop.t, position: "aboveBar", color: "#f97316", shape: "arrowDown", size: 1, text: "" });
        // Lower wedge start — lowest low in first 6 bars
        const wedgeBot = wedgeBars.slice(0, 6).reduce((mn, b) => b.l < mn.l ? b : mn, wedgeBars[0]);
        markers.push({ time: wedgeBot.t, position: "belowBar", color: "#f97316", shape: "arrowDown", size: 1, text: "" });
      }
      // Draw the breakout level (upper trendline at current price)
      series.createPriceLine({ price: bars[bars.length - 1].h * 1.001, color: "rgba(249,115,22,0.5)", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
      break;
    }

    case "inverse_head_and_shoulders": {
      const wb  = bars.slice(-80);
      const seg = Math.max(1, Math.floor(wb.length / 5));
      const lsSeg   = wb.slice(0,           seg);
      const hdSeg   = wb.slice(2 * seg, 3 * seg);
      const rsSeg   = wb.slice(4 * seg);
      if (lsSeg.length > 0) {
        const lsLow = lsSeg.reduce((mn, b) => b.l < mn.l ? b : mn, lsSeg[0]);
        markers.push({ time: lsLow.t, position: "belowBar", color: "#60a5fa", shape: "arrowDown", size: 1, text: "" });
      }
      if (hdSeg.length > 0) {
        const hdLow = hdSeg.reduce((mn, b) => b.l < mn.l ? b : mn, hdSeg[0]);
        markers.push({ time: hdLow.t, position: "belowBar", color: "#ef4444", shape: "arrowDown", size: 2, text: "" });
      }
      if (rsSeg.length > 0) {
        const rsLow = rsSeg.reduce((mn, b) => b.l < mn.l ? b : mn, rsSeg[0]);
        markers.push({ time: rsLow.t, position: "belowBar", color: "#60a5fa", shape: "arrowDown", size: 1, text: "" });
      }
      break;
    }
  }

  if (markers.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    series.setMarkers([...markers].sort((a: any, b: any) => a.time - b.time));
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MiniChart({ bars, entry, stop, target, breakoutLevel, patternKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;
    const container = containerRef.current;
    let cleanup: (() => void) | undefined;

    import("lightweight-charts").then(({ createChart, LineStyle }) => {
      const chart = createChart(container, {
        width:  container.clientWidth,
        height: 140,
        layout: { background: { color: "transparent" }, textColor: "transparent" },
        grid:   { vertLines: { visible: false }, horzLines: { color: "rgba(255,255,255,0.04)" } },
        crosshair:      { mode: 0 },
        timeScale:      { visible: false, borderVisible: false },
        rightPriceScale: { visible: false },
        leftPriceScale:  { visible: false },
        handleScroll: false,
        handleScale:  false,
      });

      const series = chart.addCandlestickSeries({
        upColor:         "#22c55e",
        downColor:       "#ef4444",
        borderUpColor:   "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor:     "#22c55e",
        wickDownColor:   "#ef4444",
        priceLineVisible: false,
        lastValueVisible: false,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      series.setData(bars.map((b) => ({ time: b.t as any, open: b.o, high: b.h, low: b.l, close: b.c })));

      // ── Price level lines ──────────────────────────────────────────────────
      series.createPriceLine({ price: target, color: "#22c55e",               lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
      series.createPriceLine({ price: entry,  color: "rgba(255,255,255,0.45)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
      series.createPriceLine({ price: stop,   color: "#ef4444",               lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
      if (breakoutLevel && Math.abs(breakoutLevel - target) / target > 0.005) {
        series.createPriceLine({ price: breakoutLevel, color: "rgba(250,204,21,0.6)", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
      }

      // ── Pattern-specific overlays ──────────────────────────────────────────
      if (patternKey) addPatternOverlays(series, bars, patternKey, LineStyle);

      chart.timeScale().fitContent();

      const ro = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth }));
      ro.observe(container);
      cleanup = () => { ro.disconnect(); chart.remove(); };
    });

    return () => cleanup?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bars, entry, stop, target, breakoutLevel, patternKey]);

  const patternLegend = patternKey ? (LEGEND[patternKey] ?? []) : [];

  return (
    <div className="flex flex-col">
      <div ref={containerRef} className="w-full overflow-hidden" style={{ height: 140 }} />

      {/* ── Legend ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-t border-border/30">
        {BASE_LEGEND.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <svg width="16" height="6">
              <line x1="0" y1="3" x2="16" y2="3" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
            <span className="text-[9px] text-muted-foreground">{label}</span>
          </div>
        ))}
        {patternLegend.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-[9px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
