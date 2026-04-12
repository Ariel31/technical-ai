"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check, X, ArrowRight, Zap, Shield, TrendingUp, ChevronDown,
} from "lucide-react";
import AppHeader from "@/components/ui/AppHeader";
import { cn } from "@/lib/utils";
import { useUserPlan } from "@/hooks/useUserPlan";
import { PLAN_PRICES, type Plan } from "@/lib/plans";

// ─── LemonSqueezy checkout ────────────────────────────────────────────────────

// Fill these in once you've created products in the LemonSqueezy dashboard.
const LS_STORE = "YOUR_STORE_SLUG";
const LS_VARIANTS: Record<string, string> = {
  pro_monthly:  "VARIANT_ID",
  pro_annual:   "VARIANT_ID",
  edge_monthly: "VARIANT_ID",
  edge_annual:  "VARIANT_ID",
};

function openCheckout(plan: "pro" | "edge", isAnnual: boolean) {
  const key = `${plan}_${isAnnual ? "annual" : "monthly"}`;
  const variantId = LS_VARIANTS[key];
  const url = `https://${LS_STORE}.lemonsqueezy.com/checkout/buy/${variantId}`;
  (window as unknown as { LemonSqueezy?: { Url?: { Open: (u: string) => void } } })
    .LemonSqueezy?.Url?.Open(url);
}

// ─── Feature rows ─────────────────────────────────────────────────────────────

interface FeatureRow {
  label: string;
  free: string | boolean;
  pro: string | boolean;
  edge: string | boolean;
}

const FEATURES: FeatureRow[] = [
  { label: "AI top picks (daily)",         free: "Top 3",    pro: "Top 3",  edge: "Top 3"  },
  { label: "Full screener + filters",       free: false,      pro: true,     edge: true     },
  { label: "Chart analysis",               free: "AI picks", pro: "Full",   edge: "Full"   },
  { label: "Watchlist",                    free: "2 stocks", pro: "10 stocks", edge: "25 stocks" },
  { label: "Draft queue",                  free: "3 · 24h",  pro: "8 · 48h",  edge: "15 · 72h" },
  { label: "Setup refinement",             free: false,      pro: true,     edge: true     },
  { label: "Smart setup lifecycle",        free: false,      pro: true,     edge: true     },
  { label: "Track record",                 free: false,      pro: true,     edge: true     },
  { label: "Win rate + expectancy",        free: false,      pro: true,     edge: true     },
  { label: "Validate your own chart",      free: false,      pro: false,    edge: true     },
  { label: "Sector rotation heatmap",      free: false,      pro: false,    edge: true     },
  { label: "AI vs refined stats split",    free: false,      pro: false,    edge: true     },
  { label: "Priority re-validation",       free: false,      pro: false,    edge: true     },
  { label: "Early feature access",         free: false,      pro: false,    edge: true     },
  { label: "Launch price lock",            free: false,      pro: true,     edge: true     },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Is the launch price really locked forever?",
    a: "Yes. Every subscriber who joins during the launch period keeps their price for life as long as the subscription stays active. If prices increase later, you're grandfathered at your original rate. If you cancel and re-subscribe, you pay the current rate at that time.",
  },
  {
    q: "What counts toward my watchlist limit?",
    a: "Each unique ticker you add to your watchlist counts as one slot. The draft is separate — stocks in draft don't count toward your watchlist limit until you move them.",
  },
  {
    q: "What happens to my data if I downgrade?",
    a: "Downgrades take effect at the end of your current billing cycle. If your watchlist exceeds the new plan's limit, you'll be asked to choose which stocks to keep before the downgrade is finalized. We never silently delete your data.",
  },
  {
    q: "What is the draft queue?",
    a: "The draft is a temporary holding area for stocks you're watching but haven't committed to. Each draft item expires after the time window for your plan. This enforces trading discipline — if you haven't reviewed a setup in 48 hours, the chart has probably moved anyway.",
  },
  {
    q: "Can I upgrade or downgrade at any time?",
    a: "Upgrades take effect immediately with a prorated charge for the remainder of your billing cycle. Downgrades take effect at the end of the current billing period.",
  },
  {
    q: "Is this financial advice?",
    a: "No. TechnicalAI is a technical analysis tool. Nothing on this platform constitutes financial advice, investment recommendations, or trading signals. Always do your own research.",
  },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function FeatureValue({ value }: { value: string | boolean }) {
  if (value === true)  return <Check className="w-4 h-4 text-emerald-400 mx-auto" />;
  if (value === false) return <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />;
  return <span className="text-sm text-foreground/80 font-medium">{value}</span>;
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 py-4 text-left"
      >
        <span className="text-sm font-medium text-foreground">{q}</span>
        <ChevronDown className={cn("w-4 h-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <p className="pb-4 text-sm text-muted-foreground leading-relaxed">{a}</p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const { plan: currentPlan } = useUserPlan();

  const proPrice  = isAnnual ? PLAN_PRICES.pro.annual  / 12 : PLAN_PRICES.pro.monthly;
  const edgePrice = isAnnual ? PLAN_PRICES.edge.annual / 12 : PLAN_PRICES.edge.monthly;

  function PlanCTA({ plan }: { plan: Plan }) {
    const isCurrent = plan === currentPlan;

    if (plan === "free") {
      return (
        <Link
          href="/app"
          className="block w-full rounded-xl border border-border bg-surface-elevated py-2.5 text-center text-sm font-semibold text-foreground/70 transition-colors hover:text-foreground"
        >
          {isCurrent ? "Current plan" : "Get started free"}
        </Link>
      );
    }
    if (isCurrent) {
      return (
        <div className="block w-full rounded-xl border border-accent/30 bg-accent/10 py-2.5 text-center text-sm font-semibold text-accent">
          Current plan
        </div>
      );
    }
    return (
      <button
        onClick={() => openCheckout(plan as "pro" | "edge", isAnnual)}
        className={cn(
          "block w-full rounded-xl py-2.5 text-center text-sm font-semibold transition-opacity hover:opacity-90 flex items-center justify-center gap-2",
          plan === "pro"  ? "bg-accent text-white" : "bg-emerald-500 text-white"
        )}
      >
        Get {plan === "pro" ? "Pro" : "Edge"}
        <ArrowRight className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader activePage="pricing" />

      <main className="flex-1">

        {/* Hero */}
        <section className="max-w-4xl mx-auto px-4 pt-16 pb-10 text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1.5 text-xs font-semibold text-accent">
            <Zap className="w-3.5 h-3.5" />
            Launch pricing — lock your rate forever
          </div>
          <h1 className="text-4xl font-bold text-foreground tracking-tight">
            Simple pricing.<br />No surprises.
          </h1>
          <p className="text-base text-muted-foreground max-w-xl mx-auto">
            Subscribe now at launch rates and never pay more — your price is locked for life
            as long as you stay active.
          </p>

          {/* Annual / monthly toggle */}
          <div className="inline-flex items-center gap-3 rounded-xl border border-border bg-surface/60 p-1 mt-2">
            <button
              onClick={() => setIsAnnual(false)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                !isAnnual ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2",
                isAnnual ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Annual
              <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                2 months free
              </span>
            </button>
          </div>
        </section>

        {/* Plan cards */}
        <section className="max-w-5xl mx-auto px-4 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Free */}
            <div className="flex flex-col rounded-2xl border border-border bg-surface/60 p-6 gap-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Free</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-foreground">$0</span>
                  <span className="text-muted-foreground text-sm mb-1">/month</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">Enough to show the value.</p>
              </div>
              <PlanCTA plan="free" />
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-start gap-2 text-foreground/80"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />Top 3 AI picks daily</li>
                <li className="flex items-start gap-2 text-foreground/80"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />Watchlist: 2 stocks</li>
                <li className="flex items-start gap-2 text-foreground/80"><Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />Draft: 3 slots · 24h expiry</li>
                <li className="flex items-start gap-2 text-muted-foreground/50"><X className="w-4 h-4 shrink-0 mt-0.5" />Full screener</li>
                <li className="flex items-start gap-2 text-muted-foreground/50"><X className="w-4 h-4 shrink-0 mt-0.5" />Track record</li>
                <li className="flex items-start gap-2 text-muted-foreground/50"><X className="w-4 h-4 shrink-0 mt-0.5" />Setup refinement</li>
              </ul>
            </div>

            {/* Pro — featured */}
            <div className="flex flex-col rounded-2xl border border-accent/20 bg-accent/5 p-6 gap-6 relative opacity-70">
              {/* Coming soon ribbon */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                <span className="bg-muted-foreground text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap">
                  Coming soon
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-accent/60 uppercase tracking-widest mb-2">Pro</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-foreground">${proPrice}</span>
                  <span className="text-muted-foreground text-sm mb-1">/month</span>
                </div>
                {isAnnual && (
                  <p className="text-xs text-muted-foreground mt-1">Billed ${PLAN_PRICES.pro.annual}/year — save $24</p>
                )}
                <p className="text-sm text-muted-foreground mt-2">Everything you need to trade seriously.</p>
              </div>
              {/* Disabled CTA */}
              <div className="block w-full rounded-xl border border-border bg-surface-elevated py-2.5 text-center text-sm font-semibold text-muted-foreground/50 cursor-not-allowed">
                Coming soon
              </div>
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />Full screener — all setups + filters</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />Watchlist: 10 stocks</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />Draft: 8 slots · 48h expiry</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />Full chart analysis</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />Setup refinement + versioning</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />Track record + win rate</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-accent/50 shrink-0 mt-0.5" /><Shield className="w-3.5 h-3.5 text-accent/50 shrink-0 mt-0.5 -ml-1.5" />Launch price locked for life</li>
              </ul>
            </div>

            {/* Edge */}
            <div className="flex flex-col rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 gap-6 relative opacity-70">
              {/* Coming soon ribbon */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                <span className="bg-muted-foreground text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap">
                  Coming soon
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-400/60 uppercase tracking-widest mb-2">Edge</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-bold text-foreground">${edgePrice}</span>
                  <span className="text-muted-foreground text-sm mb-1">/month</span>
                </div>
                {isAnnual && (
                  <p className="text-xs text-muted-foreground mt-1">Billed ${PLAN_PRICES.edge.annual}/year — save $60</p>
                )}
                <p className="text-sm text-muted-foreground mt-2">For traders who do their own analysis.</p>
              </div>
              {/* Disabled CTA */}
              <div className="block w-full rounded-xl border border-border bg-surface-elevated py-2.5 text-center text-sm font-semibold text-muted-foreground/50 cursor-not-allowed">
                Coming soon
              </div>
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />Everything in Pro</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />Watchlist: 25 stocks</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />Draft: 15 slots · 72h expiry</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />Validate your own chart</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />Sector rotation heatmap</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />AI vs refined performance split</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" />Early access to new features</li>
                <li className="flex items-start gap-2 text-foreground/50"><Check className="w-4 h-4 text-emerald-400/50 shrink-0 mt-0.5" /><Shield className="w-3.5 h-3.5 text-emerald-400/50 shrink-0 mt-0.5 -ml-1.5" />Launch price locked for life</li>
              </ul>
            </div>

          </div>
        </section>

        {/* Comparison table */}
        <section className="max-w-5xl mx-auto px-4 pb-20">
          <h2 className="text-xl font-bold text-foreground mb-6">Full comparison</h2>
          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-elevated">
                  <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Feature</th>
                  <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Free</th>
                  <th className="text-center py-3 px-4 font-semibold text-accent">Pro</th>
                  <th className="text-center py-3 px-4 font-semibold text-emerald-400">Edge</th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((row, i) => (
                  <tr
                    key={row.label}
                    className={cn(
                      "border-b border-border last:border-0",
                      i % 2 === 0 ? "bg-surface/40" : "bg-surface/20"
                    )}
                  >
                    <td className="py-3 px-4 text-foreground/80">{row.label}</td>
                    <td className="py-3 px-4 text-center"><FeatureValue value={row.free} /></td>
                    <td className="py-3 px-4 text-center"><FeatureValue value={row.pro} /></td>
                    <td className="py-3 px-4 text-center"><FeatureValue value={row.edge} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Early access banner */}
        <section className="max-w-5xl mx-auto px-4 pb-20">
          <div className="rounded-2xl border border-accent/30 bg-accent/5 p-8 text-center space-y-3">
            <div className="inline-flex items-center gap-2 text-accent text-sm font-semibold">
              <TrendingUp className="w-4 h-4" />
              Launch offer
            </div>
            <h2 className="text-2xl font-bold text-foreground">Subscribe now. Never pay more.</h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">
              Every subscriber during the launch period locks in their price for life.
              When prices increase, you&apos;re grandfathered at your original rate — forever.
            </p>
            <div className="pt-2">
              <div className="inline-flex items-center gap-2 rounded-xl bg-muted-foreground/30 px-6 py-3 text-sm font-semibold text-muted-foreground cursor-not-allowed">
                Payments coming soon
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-2xl mx-auto px-4 pb-24">
          <h2 className="text-xl font-bold text-foreground mb-6">FAQ</h2>
          <div className="rounded-2xl border border-border bg-surface/60 px-6 divide-y-0">
            {FAQ.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </section>

        {/* Footer disclaimer */}
        <footer className="text-center pb-12 text-xs text-muted-foreground/50 space-x-3">
          <span>Not financial advice</span>
          <span>·</span>
          <span>Payments by LemonSqueezy</span>
        </footer>

      </main>
    </div>
  );
}
