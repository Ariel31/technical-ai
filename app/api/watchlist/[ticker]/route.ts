import sql from "@/lib/db";

export const runtime = "nodejs";

// PATCH /api/watchlist/[ticker] — update status and optional error message
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();

  const { status, errorMessage } = await req.json();

  await sql`
    UPDATE watchlist
    SET status        = ${status},
        error_message = ${errorMessage ?? null}
    WHERE ticker = ${ticker}
  `;

  return Response.json({ ok: true });
}

// DELETE /api/watchlist/[ticker] — remove from watchlist
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();

  await sql`DELETE FROM watchlist WHERE ticker = ${ticker}`;

  return Response.json({ ok: true });
}
