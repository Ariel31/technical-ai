"use client";

import Link from "next/link";
import { Lock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/plans";
import { PLAN_LABELS } from "@/lib/plans";

interface UpgradePromptProps {
  /** Minimum plan required to unlock this feature */
  requiredPlan: Plan;
  /** Short description of what gets unlocked */
  featureLabel: string;
  /** Visual variant — 'inline' for small in-context prompts, 'card' for page-level gates */
  variant?: "inline" | "card";
  className?: string;
}

export default function UpgradePrompt({
  requiredPlan,
  featureLabel,
  variant = "inline",
  className,
}: UpgradePromptProps) {
  if (variant === "card") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-5 rounded-2xl border border-border bg-surface/60 p-10 text-center",
          className
        )}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-elevated">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-foreground">{featureLabel}</p>
          <p className="text-sm text-muted-foreground">
            Available on the{" "}
            <span className="font-semibold text-accent">
              {PLAN_LABELS[requiredPlan]}
            </span>{" "}
            plan and above.
          </p>
        </div>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Upgrade to {PLAN_LABELS[requiredPlan]}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  // inline variant
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3",
        className
      )}
    >
      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          <span className="font-medium">{featureLabel}</span>
          {" "}is available on the{" "}
          <span className="font-semibold text-accent">{PLAN_LABELS[requiredPlan]}</span> plan.
        </p>
      </div>
      <Link
        href="/pricing"
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20"
      >
        Upgrade
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
