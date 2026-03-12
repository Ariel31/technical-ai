import sql from "@/lib/db";

export const runtime = "nodejs";

// GET /api/watchlist — fetch all watchlist items ordered by when they were added
export async function GET() {
  const rows = await sql`
    SELECT ticker, name, status, added_at, error_message
    FROM watchlist
    ORDER BY added_at ASC
  `;
  return Response.json(rows);
}

// POST /api/watchlist — add a ticker (idempotent: ignore if already exists)
export async function POST(req: Request) {
  const { ticker, name } = await req.json();
  const t = (ticker as string).toUpperCase().trim();

  await sql`
    INSERT INTO watchlist (ticker, name, status)
    VALUES (${t}, ${name}, 'pending')
    ON CONFLICT (ticker) DO NOTHING
  `;

  return Response.json({ ok: true });
}
