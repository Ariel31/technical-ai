/**
 * Subscription tier definitions — single source of truth for limits and feature gates.
 *
 * DB setup (run once in Supabase SQL editor):
 *
 * CREATE TABLE subscriptions (
 *   id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id             TEXT        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 *   plan                TEXT        NOT NULL DEFAULT 'free',
 *   ls_subscription_id  TEXT,
 *   ls_variant_id       TEXT,
 *   status              TEXT        NOT NULL DEFAULT 'active',
 *   current_period_end  TIMESTAMPTZ,
 *   launch_price_locked BOOLEAN     NOT NULL DEFAULT true,
 *   created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
 *   updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
 * );
 */

export type Plan = "free" | "pro" | "edge";

export interface PlanLimits {
  watchlist: number;
  draftSlots: number;
  draftExpiryHrs: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free:  { watchlist: 2,  draftSlots: 3,  draftExpiryHrs: 24 },
  pro:   { watchlist: 10, draftSlots: 8,  draftExpiryHrs: 48 },
  edge:  { watchlist: 25, draftSlots: 15, draftExpiryHrs: 72 },
};

export interface PlanFeatures {
  fullScreener:      boolean;
  moreCandidates:    boolean;
  trackRecord:       boolean;
  setupRefinement:   boolean;
  smartLifecycle:    boolean;
  validateOwnChart:  boolean;
  sectorHeatmap:     boolean;
  earlyAccess:       boolean;
}

export const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  free: {
    fullScreener:     false,
    moreCandidates:   false,
    trackRecord:      false,
    setupRefinement:  false,
    smartLifecycle:   false,
    validateOwnChart: false,
    sectorHeatmap:    false,
    earlyAccess:      false,
  },
  pro: {
    fullScreener:     true,
    moreCandidates:   true,
    trackRecord:      true,
    setupRefinement:  true,
    smartLifecycle:   true,
    validateOwnChart: false,
    sectorHeatmap:    false,
    earlyAccess:      false,
  },
  edge: {
    fullScreener:     true,
    moreCandidates:   true,
    trackRecord:      true,
    setupRefinement:  true,
    smartLifecycle:   true,
    validateOwnChart: true,
    sectorHeatmap:    true,
    earlyAccess:      true,
  },
};

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  pro:  "Pro",
  edge: "Edge",
};

export const PLAN_PRICES: Record<Plan, { monthly: number; annual: number }> = {
  free:  { monthly: 0,  annual: 0   },
  pro:   { monthly: 12, annual: 120 },
  edge:  { monthly: 29, annual: 288 },
};

/** Returns true if the given plan can access `feature` */
export function hasFeature(plan: Plan, feature: keyof PlanFeatures): boolean {
  return PLAN_FEATURES[plan][feature];
}

/** Returns true if adding one more item stays within the limit */
export function withinWatchlistLimit(plan: Plan, currentCount: number): boolean {
  return currentCount < PLAN_LIMITS[plan].watchlist;
}

export function withinDraftLimit(plan: Plan, currentCount: number): boolean {
  return currentCount < PLAN_LIMITS[plan].draftSlots;
}

/** Milliseconds before a draft item expires */
export function draftExpiryMs(plan: Plan): number {
  return PLAN_LIMITS[plan].draftExpiryHrs * 60 * 60 * 1000;
}
