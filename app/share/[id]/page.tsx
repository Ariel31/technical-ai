import { notFound } from "next/navigation";
import sql from "@/lib/db";
import Link from "next/link";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ id: string }>;
}

async function getShare(id: string) {
  try {
    const rows = await sql`
      SELECT ticker, image_data, created_at
      FROM chart_shares
      WHERE id = ${id}
      LIMIT 1
    ` as { ticker: string; image_data: string; created_at: string }[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const share = await getShare(id);
  if (!share) return { title: "Chart not found" };
  return {
    title: `${share.ticker} Chart Analysis — TechnicalAI`,
    description: `AI-powered chart analysis for ${share.ticker}`,
  };
}

export default async function SharePage({ params }: Props) {
  const { id } = await params;
  const share = await getShare(id);
  if (!share) notFound();

  const date = new Date(share.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div className="min-h-dvh bg-[#0a0a0f] flex flex-col items-center justify-center p-4 gap-6">

      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold text-white font-mono">{share.ticker}</h1>
          <p className="text-sm text-[#94a3b8] mt-0.5">Chart Analysis · {date}</p>
        </div>
        <Link
          href={`/app?ticker=${share.ticker}`}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/30 text-[#22c55e] text-sm font-semibold hover:bg-[#22c55e]/20 transition-colors"
        >
          Analyze Live →
        </Link>
      </div>

      {/* Chart image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={share.image_data}
        alt={`${share.ticker} chart analysis`}
        className="w-full max-w-5xl rounded-2xl border border-[#1e1e30] shadow-2xl"
      />

      {/* Footer */}
      <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
        <span>Powered by</span>
        <Link href="/" className="text-[#94a3b8] hover:text-white transition-colors font-semibold">
          TechnicalAI.app
        </Link>
      </div>

    </div>
  );
}
