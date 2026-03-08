import type { OHLCVBar, StockDataResponse } from "./types";

export type Timeframe = "1d" | "1wk" | "1mo";

interface FetchStockDataOptions {
  ticker: string;
  timeframe?: Timeframe;
  bars?: number;
}

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        longName?: string;
        shortName?: string;
        currency: string;
        exchangeName: string;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }>;
    error: { code: string; description: string } | null;
  };
}

function resolveRange(timeframe: Timeframe, bars: number): string {
  if (timeframe === "1d") return bars <= 60 ? "3mo" : bars <= 120 ? "6mo" : bars <= 300 ? "1y" : "2y";
  if (timeframe === "1wk") return bars <= 60 ? "1y" : bars <= 200 ? "2y" : "5y";
  return bars <= 60 ? "5y" : "max";
}

/**
 * Fetch OHLCV data from Yahoo Finance Chart API v8.
 * Uses direct fetch — no third-party library needed.
 */
export async function fetchStockData({
  ticker,
  timeframe = "1d",
  bars = 200,
}: FetchStockDataOptions): Promise<StockDataResponse> {
  const symbol = ticker.toUpperCase().trim();
  const range = resolveRange(timeframe, bars);

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${timeframe}&range=${range}&includeTimestamps=true`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TechnicalAI/1.0)",
      Accept: "application/json",
    },
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance returned ${res.status} for "${symbol}"`);
  }

  const json: YahooChartResponse = await res.json();

  if (json.chart.error) {
    throw new Error(json.chart.error.description ?? `Error fetching "${symbol}"`);
  }

  const result = json.chart.result?.[0];
  if (!result?.timestamp?.length) {
    throw new Error(`No data found for ticker "${symbol}"`);
  }

  const { timestamp, indicators, meta } = result;
  const quote = indicators.quote[0];

  const ohlcvBars: OHLCVBar[] = timestamp
    .map((time, i): OHLCVBar | null => {
      const open = quote.open[i];
      const high = quote.high[i];
      const low = quote.low[i];
      const close = quote.close[i];
      if (open == null || high == null || low == null || close == null) return null;
      return { time, open, high, low, close, volume: quote.volume[i] ?? 0 };
    })
    .filter((b): b is OHLCVBar => b !== null)
    .sort((a, b) => a.time - b.time);

  if (ohlcvBars.length === 0) {
    throw new Error(`No valid OHLCV bars returned for "${symbol}"`);
  }

  return {
    ticker: symbol,
    bars: ohlcvBars,
    meta: {
      name: meta.longName ?? meta.shortName ?? symbol,
      currency: meta.currency ?? "USD",
      exchange: meta.exchangeName ?? "",
    },
  };
}
