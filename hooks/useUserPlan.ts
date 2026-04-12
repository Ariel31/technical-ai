"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import type { Plan, PlanLimits, PlanFeatures } from "@/lib/plans";
import { PLAN_LIMITS, PLAN_FEATURES } from "@/lib/plans";

const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

interface UserPlanData {
  plan: Plan;
  status?: string;
  currentPeriodEnd?: string | null;
  launchPriceLocked?: boolean;
  isAdmin?: boolean;
}

export function useUserPlan() {
  const { data: session } = useSession();
  const isAdmin = Boolean(ADMIN_EMAIL && session?.user?.email === ADMIN_EMAIL);

  const { data, isLoading } = useQuery<UserPlanData>({
    queryKey: ["user-plan"],
    queryFn: async () => {
      const res = await fetch("/api/user/plan");
      if (!res.ok) return { plan: "free" as Plan };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    // Skip the fetch entirely for admin — we already know the answer
    enabled: !isAdmin,
  });

  // Admin always gets edge — no DB query needed
  const plan: Plan = isAdmin ? "edge" : (data?.plan ?? "free");
  const limits: PlanLimits = PLAN_LIMITS[plan];
  const features: PlanFeatures = PLAN_FEATURES[plan];

  return {
    plan,
    limits,
    features,
    isLoading: isAdmin ? false : isLoading,
    isAdmin,
    status: isAdmin ? "active" : data?.status,
    currentPeriodEnd: isAdmin ? null : data?.currentPeriodEnd,
    launchPriceLocked: isAdmin ? false : data?.launchPriceLocked,
  };
}
