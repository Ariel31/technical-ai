"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { FileStack } from "lucide-react";

const STORAGE_KEY = "draft_items";

function readDraftTickers(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<{ ticker: string }>;
    return parsed.map((p) => p.ticker);
  } catch {
    return [];
  }
}

export default function DraftBar() {
  const [tickers, setTickers] = useState<string[]>([]);

  useEffect(() => {
    setTickers(readDraftTickers());
    const interval = setInterval(() => setTickers(readDraftTickers()), 1500);
    function onStorage() { setTickers(readDraftTickers()); }
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (tickers.length === 0) return null;

  const displayed = tickers.slice(0, 3);
  const extra = tickers.length - 3;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md">
      <div className="max-w-[1800px] mx-auto px-4 py-2.5 flex items-center gap-3">
        <span className="flex items-center gap-1.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0">
          <FileStack className="w-3 h-3" />
          Draft · {tickers.length}
        </span>
        <span className="text-xs text-muted-foreground font-mono truncate">
          {displayed.join(", ")}{extra > 0 ? ` +${extra} more` : ""}
        </span>
        <div className="flex-1" />
        <Link
          href={`/app?ticker=${tickers[0]}`}
          className="text-xs font-medium text-accent hover:text-accent/80 transition-colors shrink-0 flex items-center gap-0.5"
        >
          Review in Chart Analysis →
        </Link>
      </div>
    </div>
  );
}
