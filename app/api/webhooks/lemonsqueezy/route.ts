/**
 * POST /api/webhooks/lemonsqueezy
 *
 * Handles LemonSqueezy subscription lifecycle events.
 * Configure in LemonSqueezy dashboard → Webhooks → add endpoint.
 * Required events: subscription_created, subscription_updated,
 *                  subscription_cancelled, subscription_expired, subscription_resumed
 *
 * Env vars needed:
 *   LEMONSQUEEZY_WEBHOOK_SECRET — from LS dashboard webhook signing secret
 */

import crypto from "crypto";
import sql from "@/lib/db";
import type { Plan } from "@/lib/plans";

export const runtime = "nodejs";

// Map LemonSqueezy variant IDs → plan names.
// Fill these in once you create products in the LS dashboard.
const VARIANT_TO_PLAN: Record<string, Plan> = {
  // "123456": "pro",
  // "789012": "edge",
};

function variantToPlan(variantId: string | number): Plan {
  return VARIANT_TO_PLAN[String(variantId)] ?? "free";
}

async function upsertSubscription(params: {
  userId: string;
  plan: Plan;
  lsSubscriptionId: string;
  lsVariantId: string;
  status: "active" | "cancelled" | "expired";
  currentPeriodEnd: string | null;
}) {
  await sql`
    INSERT INTO subscriptions
      (user_id, plan, ls_subscription_id, ls_variant_id, status, current_period_end, updated_at)
    VALUES
      (${params.userId}, ${params.plan}, ${params.lsSubscriptionId}, ${params.lsVariantId},
       ${params.status}, ${params.currentPeriodEnd}, now())
    ON CONFLICT (user_id) DO UPDATE SET
      plan                = EXCLUDED.plan,
      ls_subscription_id  = EXCLUDED.ls_subscription_id,
      ls_variant_id       = EXCLUDED.ls_variant_id,
      status              = EXCLUDED.status,
      current_period_end  = EXCLUDED.current_period_end,
      updated_at          = now()
  `;
}

async function getUserIdByEmail(email: string): Promise<string | null> {
  const rows = await sql<Array<{ id: string }>>`
    SELECT id FROM users WHERE email = ${email} LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export async function POST(req: Request) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[ls-webhook] LEMONSQUEEZY_WEBHOOK_SECRET not set");
    return new Response("Misconfigured", { status: 500 });
  }

  const rawBody = await req.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);
  const signature = req.headers.get("x-signature") ?? "";

  // Verify HMAC-SHA256 signature
  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(bodyBuffer).digest("hex");
  if (signature !== digest) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: { meta: { event_name: string }; data: { attributes: Record<string, unknown>; id: string } };
  try {
    event = JSON.parse(bodyBuffer.toString("utf-8"));
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const { meta, data } = event;
  const attrs = data.attributes;
  const lsSubId = data.id;
  const variantId = String(attrs.variant_id ?? "");
  const email = String(attrs.user_email ?? "");
  const endsAt = (attrs.ends_at as string | null) ?? null;
  const renewsAt = (attrs.renews_at as string | null) ?? null;

  const userId = email ? await getUserIdByEmail(email) : null;
  if (!userId) {
    // User hasn't signed up yet — ignore silently (they'll get free plan on first login)
    return new Response("OK", { status: 200 });
  }

  const plan = variantToPlan(variantId);

  switch (meta.event_name) {
    case "subscription_created":
    case "subscription_updated":
    case "subscription_resumed":
      await upsertSubscription({
        userId,
        plan,
        lsSubscriptionId: lsSubId,
        lsVariantId: variantId,
        status: "active",
        currentPeriodEnd: renewsAt,
      });
      break;

    case "subscription_cancelled":
      await upsertSubscription({
        userId,
        plan,
        lsSubscriptionId: lsSubId,
        lsVariantId: variantId,
        status: "cancelled",
        currentPeriodEnd: endsAt,
      });
      break;

    case "subscription_expired":
      await upsertSubscription({
        userId,
        plan: "free",
        lsSubscriptionId: lsSubId,
        lsVariantId: variantId,
        status: "expired",
        currentPeriodEnd: null,
      });
      break;

    default:
      // Unhandled event — acknowledge to prevent retries
      break;
  }

  return new Response("OK", { status: 200 });
}
