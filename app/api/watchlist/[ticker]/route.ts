import sql from "@/lib/db";
import { auth } from "@/auth";

export const runtime = "nodejs";

// PATCH /api/watchlist/[ticker] — update status and optional error message
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();
  const { status, errorMessage } = await req.json();

  await sql`
    UPDATE watchlist
    SET status        = ${status},
        error_message = ${errorMessage ?? null}
    WHERE ticker = ${ticker} AND user_id = ${userId}
  `;

  return Response.json({ ok: true });
}

// DELETE /api/watchlist/[ticker] — remove from watchlist
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();

  await sql`DELETE FROM watchlist WHERE ticker = ${ticker} AND user_id = ${userId}`;

  return Response.json({ ok: true });
}
