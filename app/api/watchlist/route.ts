import sql from "@/lib/db";
import { auth } from "@/auth";
import { PLAN_LIMITS, type Plan } from "@/lib/plans";

export const runtime = "nodejs";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

async function getUserPlan(userId: string, email?: string | null): Promise<Plan> {
  if (ADMIN_EMAIL && email === ADMIN_EMAIL) return "edge";
  try {
    const rows = await sql<Array<{ plan: string; status: string }>>`
      SELECT plan, status FROM subscriptions
      WHERE user_id = ${userId} LIMIT 1
    `;
    if (!rows.length) return "free";
    const { plan, status } = rows[0];
    return (status === "active" || status === "cancelled") ? (plan as Plan) : "free";
  } catch {
    return "free";
  }
}

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

  // Idempotent — already in watchlist, skip limit check
  const existing = await sql<Array<{ ticker: string }>>`
    SELECT ticker FROM watchlist WHERE user_id = ${userId} AND ticker = ${t} LIMIT 1
  `;
  if (existing.length > 0) return Response.json({ ok: true });

  // Enforce plan watchlist limit
  const plan = await getUserPlan(userId, session.user.email);
  const limit = PLAN_LIMITS[plan].watchlist;
  const countRows = await sql<Array<{ count: string }>>`
    SELECT COUNT(*)::text AS count FROM watchlist WHERE user_id = ${userId}
  `;
  const currentCount = parseInt(countRows[0]?.count ?? "0", 10);
  if (currentCount >= limit) {
    return Response.json(
      {
        error: "limit_reached",
        message: `Your ${plan} plan supports up to ${limit} watchlist stock${limit === 1 ? "" : "s"}. Upgrade to add more.`,
        limit,
        plan,
      },
      { status: 403 }
    );
  }

  await sql`
    INSERT INTO watchlist (user_id, ticker, name, status)
    VALUES (${userId}, ${t}, ${name}, 'pending')
    ON CONFLICT (user_id, ticker) DO NOTHING
  `;

  return Response.json({ ok: true });
}
