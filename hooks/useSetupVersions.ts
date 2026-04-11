"use client";

import { useState, useEffect, useCallback } from "react";
import type { SetupVersion } from "@/lib/types";

export function useSetupVersions(setupId: string | null) {
  const [versions, setVersions]               = useState<SetupVersion[]>([]);
  const [isLoading, setIsLoading]             = useState(false);
  const [isRefining, setIsRefining]           = useState(false);
  const [refinementError, setRefinementError] = useState<string | null>(null);
  const [refinementWarning, setRefinementWarning] = useState<string | null>(null);
  const [refinementDisagreed, setRefinementDisagreed] = useState<string | null>(null);

  useEffect(() => {
    if (!setupId) { setVersions([]); return; }
    setIsLoading(true);
    fetch(`/api/setups/${setupId}/versions`)
      .then((r) => r.json())
      .then((data: unknown) => setVersions(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [setupId]);

  const committedVersion = versions.find((v) => v.isCommitted) ?? null;

  const refine = useCallback(async (userInput: string): Promise<boolean> => {
    if (!setupId) return false;
    setIsRefining(true);
    setRefinementError(null);
    setRefinementWarning(null);
    setRefinementDisagreed(null);

    try {
      const res = await fetch(`/api/setups/${setupId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput }),
      });
      const data = await res.json();

      if (!res.ok) {
        setRefinementError(data.error ?? "Refinement failed");
        return false;
      }
      if (data.noNewVersion) {
        setRefinementWarning(data.warning);
        return false;
      }
      // If first refinement, also add the seeded v1 by re-fetching
      if (versions.length === 0) {
        const all = await fetch(`/api/setups/${setupId}/versions`).then((r) => r.json());
        setVersions(Array.isArray(all) ? all : [data]);
      } else {
        setVersions((prev) => [...prev, data as SetupVersion]);
      }
      if (data.disagreed) {
        setRefinementDisagreed(data.changeSummary ?? "AI disagreed and adjusted the levels.");
      }
      return true;
    } catch {
      setRefinementError("Refinement failed — please try again.");
      return false;
    } finally {
      setIsRefining(false);
    }
  }, [setupId, versions.length]);

  const commit = useCallback((versionId: string) => {
    if (!setupId) return;
    // Optimistic update immediately — no waiting for API
    setVersions((prev) => prev.map((v) => ({ ...v, isCommitted: v.id === versionId })));
    // Persist in background — UI is already updated
    fetch(`/api/setups/${setupId}/versions/${versionId}/commit`, { method: "POST" }).catch(() => {});
  }, [setupId]);

  return {
    versions,
    committedVersion,
    isLoading,
    isRefining,
    refinementError,
    refinementWarning,
    refinementDisagreed,
    refine,
    commit,
  };
}
