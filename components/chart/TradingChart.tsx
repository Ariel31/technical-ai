"use client";

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
  LineStyle,
  PriceScaleMode,
} from "lightweight-charts";
import type { OHLCVBar, AnalysisResult, TechnicalPattern } from "@/lib/types";

export interface TradingChartHandle {
  captureImage: () => Promise<string>;
}

interface TradingChartProps {
  bars: OHLCVBar[];
  analysis: AnalysisResult | null;
  activePatternIds: Set<string>;
  keyLevels: AnalysisResult["keyLevels"] | null;
  showKeyLevels: boolean;
}

const CHART_THEME = {
  background: "#0a0a0f",
  grid: "#1a1a2e",
  text: "#94a3b8",
  border: "#1e1e30",
  upColor: "#22c55e",
  downColor: "#ef4444",
  volume: {
    up: "rgba(34,197,94,0.3)",
    down: "rgba(239,68,68,0.3)",
  },
};

const TradingChart = forwardRef<TradingChartHandle, TradingChartProps>(function TradingChart({
  bars,
  analysis,
  activePatternIds,
  keyLevels,
  showKeyLevels,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const keyLevelSeriesRef = useRef<ISeriesApi<"Line">[]>([]);

  // Refs so the timeScale subscription never closes over stale values
  const analysisRef = useRef(analysis);
  const activePatternIdsRef = useRef(activePatternIds);
  useEffect(() => {
    analysisRef.current = analysis;
  }, [analysis]);
  useEffect(() => {
    activePatternIdsRef.current = activePatternIds;
  }, [activePatternIds]);

  // ─── Canvas curve drawing (Catmull-Rom → cubic bezier) ────────────────────
  const drawCurvesOnCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!canvas || !chart || !candleSeries) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Size canvas to physical pixels for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    if (w === 0 || h === 0) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const currentAnalysis = analysisRef.current;
    const currentActiveIds = activePatternIdsRef.current;
    if (!currentAnalysis) return;

    // Trace a Catmull-Rom → cubic bezier path through pixel points
    const c = ctx; // non-null alias for use inside nested functions
    function tracePath(pts: Array<{ x: number; y: number }>) {
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        c.bezierCurveTo(
          p1.x + (p2.x - p0.x) / 6,
          p1.y + (p2.y - p0.y) / 6,
          p2.x - (p3.x - p1.x) / 6,
          p2.y - (p3.y - p1.y) / 6,
          p2.x,
          p2.y,
        );
      }
    }

    type Pt = { x: number; y: number; dot: boolean };

    currentAnalysis.patterns
      .filter((p) => currentActiveIds.has(p.id))
      .forEach((pattern) => {
        (pattern.curves ?? []).forEach((curve) => {
          const sorted = [...curve.points].sort((a, b) => a.time - b.time);

          // Convert time+price → canvas pixel coords, preserving dot flag
          const pts = sorted.reduce<Pt[]>((acc, p) => {
            const x = chart.timeScale().timeToCoordinate(p.time as Time);
            const y = candleSeries.priceToCoordinate(p.price);
            if (x !== null && y !== null) {
              acc.push({ x: x as number, y: y as number, dot: !!p.dot });
            }
            return acc;
          }, []);

          if (pts.length < 2) return;

          // ── 1. Filled area between curve and baseline ─────────────────────
          if (curve.fill) {
            const baseY = candleSeries.priceToCoordinate(curve.fill.basePrice);
            if (baseY !== null) {
              c.save();
              c.beginPath();
              tracePath(pts);
              c.lineTo(pts[pts.length - 1].x, baseY as number);
              c.lineTo(pts[0].x, baseY as number);
              c.closePath();
              c.fillStyle = curve.fill.color;
              c.fill();
              c.restore();
            }
          }

          // ── 2. Curve outline — two-pass glow for a modern neon look ─────
          const lw = curve.lineWidth ?? 2;
          // Pass 1: wide blurred halo
          c.save();
          c.beginPath();
          tracePath(pts);
          c.strokeStyle = curve.color;
          c.lineWidth = lw * 3;
          c.lineJoin = "round";
          c.lineCap = "round";
          c.globalAlpha = 0.18;
          c.shadowColor = curve.color;
          c.shadowBlur = 20;
          c.stroke();
          c.restore();
          // Pass 2: crisp main line
          c.save();
          c.beginPath();
          tracePath(pts);
          c.strokeStyle = curve.color;
          c.lineWidth = lw;
          c.lineJoin = "round";
          c.lineCap = "round";
          c.shadowColor = curve.color;
          c.shadowBlur = 8;
          c.stroke();
          c.restore();

          // ── 3. Dots at key turning points (peaks / troughs) ───────────────
          pts.forEach((p) => {
            if (!p.dot) return;
            c.save();
            // Outer glow halo
            c.beginPath();
            c.arc(p.x, p.y, 9, 0, Math.PI * 2);
            c.fillStyle = curve.color;
            c.globalAlpha = 0.12;
            c.fill();
            // Main glowing filled circle
            c.globalAlpha = 1;
            c.beginPath();
            c.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
            c.fillStyle = curve.color;
            c.shadowColor = curve.color;
            c.shadowBlur = 12;
            c.fill();
            // Dark outline ring for contrast against candles
            c.beginPath();
            c.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
            c.strokeStyle = "#0a0a0f";
            c.lineWidth = 1.5;
            c.shadowBlur = 0;
            c.stroke();
            c.restore();
          });
        });
      });
  }, []); // intentionally empty — reads latest state via refs

  // ─── Init chart ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: CHART_THEME.background },
        textColor: CHART_THEME.text,
        fontFamily: "JetBrains Mono, Fira Code, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: CHART_THEME.grid },
        horzLines: { color: CHART_THEME.grid },
      },
      crosshair: {
        vertLine: {
          color: "rgba(148,163,184,0.4)",
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: "rgba(148,163,184,0.4)",
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderColor: CHART_THEME.border,
        mode: PriceScaleMode.Normal,
      },
      timeScale: {
        borderColor: CHART_THEME.border,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 6,
        minBarSpacing: 2,
      },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    // Redraw curves whenever the user pans or zooms
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      requestAnimationFrame(drawCurvesOnCanvas);
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: CHART_THEME.upColor,
      downColor: CHART_THEME.downColor,
      borderUpColor: CHART_THEME.upColor,
      borderDownColor: CHART_THEME.downColor,
      wickUpColor: CHART_THEME.upColor,
      wickDownColor: CHART_THEME.downColor,
      priceLineVisible: true,
      priceLineColor: "rgba(148,163,184,0.5)",
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dashed,
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        chart.applyOptions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
        requestAnimationFrame(drawCurvesOnCanvas);
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      keyLevelSeriesRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawCurvesOnCanvas]);

  // ─── Key level lines (supports / resistances) ─────────────────────────────

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Remove previous key level series
    keyLevelSeriesRef.current.forEach((s) => {
      try {
        chart.removeSeries(s);
      } catch {}
    });
    keyLevelSeriesRef.current = [];

    if (!keyLevels || !showKeyLevels || bars.length === 0) return;

    const startTime = bars[0].time as Time;
    const endTime = bars[bars.length - 1].time as Time;

    const addLine = (price: number, color: string, title: string) => {
      const s = chart.addLineSeries({
        color,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        title,
        crosshairMarkerVisible: false,
      });
      s.setData([
        { time: startTime, value: price },
        { time: endTime, value: price },
      ]);
      keyLevelSeriesRef.current.push(s);
    };

    keyLevels.supports.forEach((p) => addLine(p, "rgba(34,197,94,0.6)", "S"));
    keyLevels.resistances.forEach((p) =>
      addLine(p, "rgba(239,68,68,0.6)", "R"),
    );
  }, [keyLevels, showKeyLevels, bars]);

  // ─── Feed OHLCV data ──────────────────────────────────────────────────────

  useEffect(() => {
    if (
      !candleSeriesRef.current ||
      !volumeSeriesRef.current ||
      bars.length === 0
    )
      return;

    const candleData: CandlestickData[] = bars.map((b) => ({
      time: b.time as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));

    const volumeData: HistogramData[] = bars.map((b) => ({
      time: b.time as Time,
      value: b.volume,
      color:
        b.close >= b.open ? CHART_THEME.volume.up : CHART_THEME.volume.down,
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
    chartRef.current?.timeScale().fitContent();
  }, [bars]);

  // ─── Draw pattern overlays ────────────────────────────────────────────────

  const clearOverlays = useCallback(() => {
    if (!chartRef.current) return;
    overlaySeriesRef.current.forEach((s) => {
      try {
        chartRef.current!.removeSeries(s);
      } catch {
        // Already removed
      }
    });
    overlaySeriesRef.current = [];
  }, []);

  const drawPattern = useCallback(
    (pattern: TechnicalPattern) => {
      if (!chartRef.current || bars.length === 0) return;
      const chart = chartRef.current;
      const startTime = bars[0].time as Time;
      const endTime = bars[bars.length - 1].time as Time;

      // Horizontal lines (support, resistance, necklines)
      pattern.lines.forEach((line) => {
        const series = chart.addLineSeries({
          color: line.color,
          lineWidth: 2,
          lineStyle:
            line.style === "dashed"
              ? LineStyle.Dashed
              : line.style === "dotted"
                ? LineStyle.Dotted
                : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: !!line.label,
          title: line.label ?? "",
          crosshairMarkerVisible: false,
        });
        const data: LineData[] = [
          { time: startTime, value: line.price },
          { time: endTime, value: line.price },
        ];
        series.setData(data);
        overlaySeriesRef.current.push(series);
      });

      // Build a time→bar lookup for snapping trendline points to wicks
      const barByTime = new Map(bars.map((b) => [b.time, b]));

      // Trendlines / polygon outlines (wedges, flags, channels)
      const EXTENDABLE_TYPES = new Set([
        "ascending_channel",
        "descending_channel",
        "horizontal_channel",
        "falling_wedge",
        "rising_wedge",
        "bull_flag",
        "bear_flag",
      ]);
      // Trendlines extend to their breakout marker (if one exists), making the
      // breakout arrow clearly visible against the projected line.
      const TRENDLINE_TYPES = new Set(["downtrend_line", "uptrend_line"]);

      pattern.polygons.forEach((polygon) => {
        if (polygon.points.length < 2) return;
        const series = chart.addLineSeries({
          color: polygon.borderColor,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          title: polygon.label ?? "",
          crosshairMarkerVisible: false,
        });
        // Snap trendline anchor prices to actual candle wicks so the line
        // touches the bottom of up-trend bars (lows) or top of down-trend bars (highs).
        const snapToWick = (t: number, price: number): number => {
          const bar = barByTime.get(t);
          if (!bar) return price;
          if (pattern.type === "uptrend_line") return bar.low;
          if (pattern.type === "downtrend_line") return bar.high;
          return price;
        };

        let data: LineData[] = polygon.points
          .map((p) => ({ time: p.time as Time, value: snapToWick(p.time, p.price) }))
          .sort((a, b) => (a.time as number) - (b.time as number))
          .filter(
            (p, i, arr) =>
              i === 0 || (p.time as number) !== (arr[i - 1].time as number),
          );

        // For trendlines: adjust slope so no intermediate candle pokes through.
        // Downtrend line → line must stay at or above every candle high.
        // Uptrend line   → line must stay at or below every candle low.
        if (TRENDLINE_TYPES.has(pattern.type) && data.length >= 2) {
          const isDowntrend = pattern.type === "downtrend_line";
          const t0 = data[0].time as number;
          const p0 = data[0].value;
          const tN = data[data.length - 1].time as number;
          let slope = (data[data.length - 1].value - p0) / (tN - t0);

          for (const bar of bars) {
            const bt = bar.time;
            if (bt <= t0 || bt >= tN) continue;
            const slopeNeeded = isDowntrend
              ? (bar.high - p0) / (bt - t0)
              : (bar.low  - p0) / (bt - t0);
            slope = isDowntrend
              ? Math.max(slope, slopeNeeded)
              : Math.min(slope, slopeNeeded);
          }

          data = data.map((pt, i) =>
            i === 0
              ? pt
              : { ...pt, value: +(p0 + slope * ((pt.time as number) - t0)).toFixed(2) }
          );
        }

        // Extend channel/wedge/flag lines to the last bar so breakouts are visible
        if (EXTENDABLE_TYPES.has(pattern.type) && data.length >= 2) {
          const p0 = data[0];
          const p1 = data[data.length - 1];
          const lastT = endTime as number;
          if ((p1.time as number) < lastT) {
            const slope =
              (p1.value - p0.value) /
              ((p1.time as number) - (p0.time as number));
            const extPrice = +(
              p1.value +
              slope * (lastT - (p1.time as number))
            ).toFixed(2);
            data = [...data, { time: endTime, value: extPrice }];
          }
        }

        // Extend trendlines to reach their breakout marker so the arrow lands
        // on the projected line, making the breakout visually unambiguous.
        if (
          TRENDLINE_TYPES.has(pattern.type) &&
          data.length >= 2 &&
          pattern.markers.length > 0
        ) {
          const latestMarkerTime = Math.max(
            ...pattern.markers.map((m) => m.time),
          );
          const p0 = data[0];
          const p1 = data[data.length - 1];
          if ((p1.time as number) < latestMarkerTime) {
            const slope =
              (p1.value - p0.value) /
              ((p1.time as number) - (p0.time as number));
            const extPrice = +(
              p1.value +
              slope * (latestMarkerTime - (p1.time as number))
            ).toFixed(2);
            data = [
              ...data,
              { time: latestMarkerTime as unknown as Time, value: extPrice },
            ];
          }
        }

        series.setData(data);
        overlaySeriesRef.current.push(series);
      });

      // Zone boundaries + optional fill
      const isGap = pattern.type === "gap_up" || pattern.type === "gap_down";
      pattern.zones.forEach((zone) => {
        if (isGap) {
          // Filled rectangle: BaselineSeries (data = priceTop, base = priceBottom)
          const gapLineColor = "rgba(74, 222, 128, 0.9)";
          const gapFillColor = "rgba(74, 222, 128, 0.3)";
          const filled = chart.addBaselineSeries({
            baseValue: { type: "price", price: zone.priceBottom },
            topLineColor: gapLineColor,
            bottomLineColor: gapLineColor,
            topFillColor1: gapFillColor,
            topFillColor2: gapFillColor,
            bottomFillColor1: "rgba(0,0,0,0)",
            bottomFillColor2: "rgba(0,0,0,0)",
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: !!zone.label,
            title: zone.label ?? "",
            crosshairMarkerVisible: false,
          });
          filled.setData([
            { time: startTime, value: zone.priceTop },
            { time: endTime, value: zone.priceTop },
          ]);
          overlaySeriesRef.current.push(
            filled as unknown as ISeriesApi<"Line">,
          );
          // Bottom boundary dashed line
          const bottom = chart.addLineSeries({
            color: gapLineColor,
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          bottom.setData([
            { time: startTime, value: zone.priceBottom },
            { time: endTime, value: zone.priceBottom },
          ]);
          overlaySeriesRef.current.push(bottom);
        } else {
          (
            [
              [zone.priceTop, zone.label ?? "", LineStyle.Solid],
              [zone.priceBottom, "", LineStyle.Dashed],
            ] as [number, string, LineStyle][]
          ).forEach(([price, title, style]) => {
            const series = chart.addLineSeries({
              color: zone.color,
              lineWidth: 2,
              lineStyle: style,
              priceLineVisible: false,
              lastValueVisible: !!title,
              title,
              crosshairMarkerVisible: false,
            });
            series.setData([
              { time: startTime, value: price },
              { time: endTime, value: price },
            ]);
            overlaySeriesRef.current.push(series);
          });
        }
      });

      // Markers on the candle series
      if (pattern.markers.length > 0 && candleSeriesRef.current) {
        const existing = candleSeriesRef.current.markers?.() ?? [];
        const newMarkers = pattern.markers.map((m) => ({
          time: m.time as Time,
          position: m.position as "aboveBar" | "belowBar",
          color: m.color,
          shape: m.shape as "arrowUp" | "arrowDown" | "circle" | "square",
          text: m.text ?? "",
          size: 1,
        }));
        const combined = [...existing, ...newMarkers].sort(
          (a, b) => (a.time as number) - (b.time as number),
        );
        candleSeriesRef.current.setMarkers(combined);
      }
    },
    [bars],
  );

  useEffect(() => {
    clearOverlays();
    if (candleSeriesRef.current) {
      candleSeriesRef.current.setMarkers([]);
    }

    // Clear canvas
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (!analysis) return;

    analysis.patterns
      .filter((p) => activePatternIds.has(p.id))
      .forEach(drawPattern);

    // Draw curves after the chart series settle
    requestAnimationFrame(drawCurvesOnCanvas);
  }, [
    analysis,
    activePatternIds,
    clearOverlays,
    drawPattern,
    drawCurvesOnCanvas,
  ]);

  // ─── Expose captureImage via ref ──────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    captureImage(): Promise<string> {
      return new Promise((resolve, reject) => {
        const chart = chartRef.current;
        const overlay = canvasRef.current;
        if (!chart || !overlay) return reject(new Error("Chart not ready"));

        // lightweight-charts built-in screenshot — captures all series layers correctly
        const chartCanvas = chart.takeScreenshot();

        const w = chartCanvas.width;
        const h = chartCanvas.height;

        const out = document.createElement("canvas");
        out.width  = w;
        out.height = h;
        const ctx = out.getContext("2d")!;

        // 1. Chart (candles, volume, line overlays)
        ctx.drawImage(chartCanvas, 0, 0);

        // 2. Catmull-Rom curve overlay — scale to match chart canvas physical size
        ctx.drawImage(overlay, 0, 0, w, h);

        // 3. Watermark — bottom-left
        const dpr = window.devicePixelRatio || 1;
        const fontSize = Math.round(22 * dpr);
        ctx.font         = `bold ${fontSize}px 'JetBrains Mono', monospace`;
        ctx.textAlign    = "left";
        ctx.textBaseline = "bottom";
        ctx.globalAlpha  = 0.6;
        ctx.fillStyle    = "#94a3b8";
        ctx.fillText("TechnicalAI.app", 16 * dpr, h - 44 * dpr);
        ctx.globalAlpha  = 1;

        resolve(out.toDataURL("image/png"));
      });
    },
  }), []);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ background: CHART_THEME.background }}
      />
      {/* Canvas overlay for smooth pattern curves — pointer-events: none so chart interaction works */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
});

export default TradingChart;
