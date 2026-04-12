# TechnicalAI — Subscription Model & Pricing

> Paste this document into Claude Code. This covers the full subscription model, tier structure, limits, pricing, draft rules, and LemonSqueezy payment integration.

---

## Overview

Three tiers. Growth-first pricing. Every subscriber locks in their launch rate for life as long as they stay active.

The goal at this stage is volume over revenue — get traders using the platform, let the track record and features do the selling, raise prices once the product is proven.

---

## Tiers

### Free — $0/month

The hook. Enough to show the value, not enough to replace a paid plan.

**Screener:**

- Top 3 AI picks daily (read-only, no filters, no sorting)
- Market sentiment banner
- Hot sector widget

**Watchlist & Draft:**

- Draft queue: 3 slots, 24h expiry
- Watchlist: 2 stocks

**Analysis:**

- Chart analysis on AI picks only

**Track Record:**

- Not available

**Other:**

- No setup refinement
- No setup validation (screenshot import)

---

### Pro — $12/month

The core tier. Where most users should land. Everything needed to use the platform seriously as a daily trading tool.

**Screener:**

- Full screener — all setups, all filters, all sorting
- Market sentiment with AI confidence adjustment
- R/R filter (≥1:2 enforced)
- Hot sector widget

**Watchlist & Draft:**

- Draft queue: 8 slots, 48h expiry
- Watchlist: 10 stocks

**Analysis:**

- Full chart analysis
- Smart setup lifecycle (validity checks on all active setups, daily re-validation)
- Setup refinement — push back on AI levels in plain text, full versioning (v1, v2, v3...)

**Track Record:**

- Full track record
- Win rate + expectancy metric
- Per-pattern breakdown
- Voided setup tracking (excluded from win rate)
- Version tracking (which version of the setup was committed)

**Other:**

- Launch price locked for life while subscribed

---

### Edge — $29/month

For traders who do their own analysis and want AI as a structured second opinion. Every Pro feature plus the tools that serious traders need.

**Everything in Pro, plus:**

**Watchlist & Draft:**

- Draft queue: 15 slots, 72h expiry
- Watchlist: 25 stocks

**Analysis:**

- Validate your own chart — paste any TradingView/thinkorswim screenshot, AI validates levels and suggests corrections
- Priority re-validation — validity checks run more frequently than daily
- Sector rotation heatmap — all 11 GICS sectors ranked by score

**Track Record:**

- AI-only setups vs user-refined setups performance split
- Imported setups vs screener setups performance split

**Other:**

- Early access to new features
- Launch price locked for life while subscribed

---

## Draft rules — why limits exist

The draft is a temporary queue, not a storage solution. Without limits, users would leave everything in draft permanently and never need the watchlist — the draft becomes a free unlimited watchlist.

Two constraints enforce the intended behavior:

**Slot limit** — caps how many stocks can sit in draft at once. Forces the user to decide and move on.

**Time expiry** — stocks auto-expire from draft if not moved to watchlist within the window. This is also good trading discipline: if you haven't reviewed a setup in 48 hours, the chart has probably moved anyway.

| Tier | Draft slots | Expiry   |
| ---- | ----------- | -------- |
| Free | 3           | 24 hours |
| Pro  | 8           | 48 hours |
| Edge | 15          | 72 hours |

When a stock is about to expire, show a notification: "EXAS expires from your draft in 2 hours — move to watchlist or it will be removed."

When a user hits their slot limit, show: "Draft is full (8/8) — move a stock to your watchlist or remove one to add more."

---

## Watchlist limits

| Tier | Watchlist size |
| ---- | -------------- |
| Free | 2 stocks       |
| Pro  | 10 stocks      |
| Edge | 25 stocks      |

When a user hits their watchlist limit and tries to add another: show a modal explaining the limit and offering an upgrade path. Do not silently fail.

When a user downgrades and their watchlist exceeds the new plan's limit: ask them to choose which stocks to keep before the downgrade takes effect. Never auto-remove stocks without user confirmation.

---

## Pricing

| Tier | Monthly   | Annual                                  |
| ---- | --------- | --------------------------------------- |
| Free | $0        | $0                                      |
| Pro  | $12/month | $10/month (billed $120/year — save $24) |
| Edge | $29/month | $24/month (billed $288/year — save $60) |

Annual is 2 months free. Launch with monthly only — introduce annual once monthly retention is validated.

---

## Launch pricing lock

Every subscriber who joins during the launch period keeps their price for life as long as their subscription stays active. If prices rise later, existing subscribers are grandfathered at their original rate.

This is the primary conversion lever for the Instagram audience who are following the build. Communicate it clearly: "Subscribe now and never pay more."

If a subscriber cancels and re-subscribes, they pay the current rate at the time of re-subscription — not their original locked rate. This creates an incentive to stay subscribed.

---

## Upgrade / downgrade rules

- **Upgrade:** Takes effect immediately. Prorated charge for the remainder of the billing cycle.
- **Downgrade:** Takes effect at end of current billing cycle. User keeps their current plan until then.
- **Cancel:** Access continues until end of billing cycle. No refunds on partial months.

---

## LemonSqueezy integration

### Why LemonSqueezy

- Built for SaaS subscriptions
- Handles taxes, VAT, and compliance globally
- Overlay checkout (no redirect away from app)
- Webhook system for subscription events
- Simple API for checking subscription status

### Setup steps

**1. Create products in LemonSqueezy dashboard**

Create one product per paid tier, with variants for monthly and annual:

```
Product: TechnicalAI Pro
  Variant: Pro Monthly — $12/month
  Variant: Pro Annual  — $120/year

Product: TechnicalAI Edge
  Variant: Edge Monthly — $29/month
  Variant: Edge Annual  — $288/year
```

Note the variant IDs — you'll need these in the frontend config.

**2. Install the SDK**

```bash
npm install @lemonsqueezy/lemonsqueezy.js
```

**3. Initialize in your app root**

```js
// App.jsx or main.jsx
import { initializeLemonSqueezy } from "@lemonsqueezy/lemonsqueezy.js";

initializeLemonSqueezy(import.meta.env.VITE_LEMONSQUEEZY_API_KEY);
```

Add to your .env:

```
VITE_LEMONSQUEEZY_API_KEY=your_api_key_here
```

**4. Load the overlay script**

Add to your index.html:

```html
<script src="https://assets.lemonsqueezy.com/lemon.js" defer></script>
```

**5. Variant ID config**

Create a config file at `src/config/lemonsqueezy.js`:

```js
export const LS_CONFIG = {
  store: "YOUR_STORE_SLUG",
  variants: {
    pro_monthly: "VARIANT_ID",
    pro_annual: "VARIANT_ID",
    edge_monthly: "VARIANT_ID",
    edge_annual: "VARIANT_ID",
  },
};
```

**6. Open checkout overlay**

```js
import { LS_CONFIG } from "@/config/lemonsqueezy";

function openCheckout(plan, isAnnual) {
  const key = `${plan}_${isAnnual ? "annual" : "monthly"}`;
  const variantId = LS_CONFIG.variants[key];
  const url = `https://${LS_CONFIG.store}.lemonsqueezy.com/checkout/buy/${variantId}`;
  window.LemonSqueezy?.Url?.Open(url);
}
```

**7. Webhooks — handle subscription events**

Set up a webhook endpoint in your backend to receive LemonSqueezy events. Required events to handle:

```
subscription_created    → provision user's plan, update DB
subscription_updated    → plan changed (upgrade/downgrade)
subscription_cancelled  → mark as cancelling, keep access until period end
subscription_expired    → downgrade to Free, enforce limits
subscription_resumed    → re-activate plan
```

Webhook handler example (Node/Express):

```js
app.post("/webhooks/lemonsqueezy", express.raw({ type: "application/json" }), (req, res) => {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const signature = req.headers["x-signature"];

  // Verify signature
  const hmac = crypto.createHmac("sha256", secret);
  const digest = hmac.update(req.body).digest("hex");
  if (signature !== digest) return res.status(401).send("Invalid signature");

  const event = JSON.parse(req.body);
  const { meta, data } = event;

  switch (meta.event_name) {
    case "subscription_created":
      // data.attributes.variant_id → map to plan
      // data.attributes.user_email → find user
      await updateUserPlan(email, planFromVariantId(variantId));
      break;

    case "subscription_cancelled":
      await scheduleDowngrade(email, data.attributes.ends_at);
      break;

    case "subscription_expired":
      await downgradeToFree(email);
      break;
  }

  res.sendStatus(200);
});
```

**8. Checking subscription on the frontend**

Store the user's current plan in your auth/user context. Check it when enforcing limits:

```js
// Example user object from your DB
const user = {
  plan: "pro", // "free" | "pro" | "edge"
  plan_expires_at: null, // null if active, date if cancelling
  launch_price_locked: true,
};

// Enforce watchlist limit
const WATCHLIST_LIMITS = { free: 2, pro: 10, edge: 25 };
const DRAFT_LIMITS = { free: 3, pro: 8, edge: 15 };
const DRAFT_EXPIRY_HRS = { free: 24, pro: 48, edge: 72 };

function canAddToWatchlist(user, currentWatchlistCount) {
  return currentWatchlistCount < WATCHLIST_LIMITS[user.plan];
}
```

---

## Pricing page component

Build as `src/pages/Pricing.jsx` (or wherever your routing puts it).

The page should include:

- Monthly / Annual billing toggle with price flip animation
- Three plan cards: Free, Pro (featured/highlighted), Edge
- Per-card: tier name, price, feature list with included/excluded states, CTA button
- Draft limits shown as a badge on the draft feature row (e.g. "8 slots · 48h")
- Watchlist limit shown as a badge on the watchlist feature row
- Full comparison table below the cards
- Early access banner: "Lock in launch pricing forever"
- FAQ section (5–6 questions)
- Footer with disclaimer: "Not financial advice · Payments by LemonSqueezy"

CTA button behavior:

- Free → navigate to /signup
- Pro / Edge → call openCheckout(plan, isAnnual)

Plan cards color coding (match existing app palette):

- Free: muted gray
- Pro: blue (your existing accent blue)
- Edge: green

---

## Feature gates — enforcement checklist

Every gated feature needs a check before rendering or allowing the action:

| Feature                | Free | Pro | Edge |
| ---------------------- | ---- | --- | ---- |
| Full screener          | ❌   | ✅  | ✅   |
| Draft slots            | 3    | 8   | 15   |
| Draft expiry           | 24h  | 48h | 72h  |
| Watchlist              | 2    | 10  | 25   |
| Track record           | ❌   | ✅  | ✅   |
| Setup refinement       | ❌   | ✅  | ✅   |
| Smart lifecycle        | ❌   | ✅  | ✅   |
| Validate own chart     | ❌   | ❌  | ✅   |
| Priority re-validation | ❌   | ❌  | ✅   |
| Sector heatmap         | ❌   | ❌  | ✅   |
| AI vs refined stats    | ❌   | ❌  | ✅   |
| Early feature access   | ❌   | ❌  | ✅   |

When a user hits a gate, show an upgrade prompt inline — not a full-page redirect. Keep the user in context. The prompt should say what they'd unlock and link to the pricing page.
