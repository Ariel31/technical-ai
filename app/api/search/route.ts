import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 1) return NextResponse.json({ results: [] });

  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=en-US&region=US&quotesCount=6&newsCount=0&listsCount=0`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!res.ok) return NextResponse.json({ results: [] });

    const data = await res.json();
    const results = (data.quotes ?? [])
      .filter((q: { quoteType: string }) =>
        ["EQUITY", "ETF", "CRYPTOCURRENCY", "INDEX", "FUTURE"].includes(q.quoteType)
      )
      .slice(0, 6)
      .map((q: { symbol: string; shortname?: string; longname?: string; exchange?: string; quoteType?: string }) => ({
        symbol: q.symbol,
        name: q.shortname ?? q.longname ?? q.symbol,
        exchange: q.exchange ?? "",
        type: q.quoteType ?? "",
      }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
