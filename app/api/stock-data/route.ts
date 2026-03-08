import { NextRequest, NextResponse } from "next/server";
import { fetchStockData } from "@/lib/yahoo-finance";
import type { ApiError } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const ticker = searchParams.get("ticker");
  const timeframe = (searchParams.get("timeframe") ?? "1d") as "1d" | "1wk" | "1mo";
  const bars = parseInt(searchParams.get("bars") ?? "200", 10);

  if (!ticker) {
    return NextResponse.json<ApiError>(
      { error: "Missing required parameter: ticker" },
      { status: 400 }
    );
  }

  // Validate ticker format
  if (!/^[A-Za-z0-9.\-^=]+$/.test(ticker)) {
    return NextResponse.json<ApiError>(
      { error: "Invalid ticker symbol format" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchStockData({ ticker, timeframe, bars });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch stock data";
    const isNotFound = message.toLowerCase().includes("not found") || message.toLowerCase().includes("no data");
    return NextResponse.json<ApiError>(
      { error: message },
      { status: isNotFound ? 404 : 502 }
    );
  }
}
