import { auth } from "@/auth";
import sql from "@/lib/db";
import type { Plan } from "@/lib/plans";

export const runtime = "nodejs";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

// GET /api/user/plan — returns the signed-in user's current plan
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ plan: "free" as Plan });

  // Admin always gets edge plan with no restrictions
  if (ADMIN_EMAIL && session.user.email === ADMIN_EMAIL) {
    return Response.json({ plan: "edge" as Plan, status: "active", isAdmin: true });
  }

  const userId = session.user.id;

  try {
    const rows = await sql<Array<{
      plan: string;
      status: string;
      current_period_end: string | null;
      launch_price_locked: boolean;
    }>>`
      SELECT plan, status, current_period_end, launch_price_locked
      FROM subscriptions
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    if (rows.length === 0) return Response.json({ plan: "free" as Plan });

    const sub = rows[0];
    // Treat expired or cancelled-past-period as free
    const plan: Plan =
      sub.status === "active" || sub.status === "cancelled"
        ? (sub.plan as Plan)
        : "free";

    return Response.json({
      plan,
      status: sub.status,
      currentPeriodEnd: sub.current_period_end,
      launchPriceLocked: sub.launch_price_locked,
    });
  } catch {
    // subscriptions table may not exist yet — default to free
    return Response.json({ plan: "free" as Plan });
  }
}
