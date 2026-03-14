import sql from "@/lib/db";
import { auth } from "@/auth";

export const runtime = "nodejs";

// GET /api/watchlist — fetch watchlist items for the signed-in user
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const rows = await sql`
    SELECT ticker, name, status, added_at, error_message
    FROM watchlist
    WHERE user_id = ${userId}
    ORDER BY added_at ASC
  `;
  return Response.json(rows);
}

// POST /api/watchlist — add a ticker (idempotent per user)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { ticker, name } = await req.json();
  const t = (ticker as string).toUpperCase().trim();

  await sql`
    INSERT INTO watchlist (user_id, ticker, name, status)
    VALUES (${userId}, ${t}, ${name}, 'pending')
    ON CONFLICT (user_id, ticker) DO NOTHING
  `;

  return Response.json({ ok: true });
}
