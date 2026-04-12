"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, X, Loader2, CheckCircle2, AlertTriangle, HelpCircle,
  TrendingUp, TrendingDown, ArrowRight, BookmarkCheck,
} from "lucide-react";
import AppHeader from "@/components/ui/AppHeader";
import UpgradePrompt from "@/components/ui/UpgradePrompt";
import { useUserPlan } from "@/hooks/useUserPlan";
import { cn } from "@/lib/utils";
import type { ValidationResult, ValidationResultA, ValidationResultB, LevelValidation } from "@/lib/validate-ai";

type CommitStatus = "idle" | "committing" | "committed";

// ─── R/R helper — always compute from levels, never trust AI's rr_ratio ───────

function calcRR(
  entry: number | null,
  stop: number | null,
  target: number | null,
  direction: "LONG" | "SHORT" | null
): number | null {
  if (!entry || !stop || !target) return null;
  const isLong = direction !== "SHORT";
  const risk = isLong ? entry - stop : stop - entry;
  const reward = isLong ? target - entry : entry - target;
  if (risk <= 0 || reward <= 0) return null;
  return Math.round((reward / risk) * 10) / 10;
}

// ─── Verdict icon ─────────────────────────────────────────────────────────────

function VerdictIcon({ verdict }: { verdict: LevelValidation["verdict"] }) {
  if (verdict === "Good")
    return <CheckCircle2 className="w-4 h-4 text-bull shrink-0 mt-0.5" />;
  if (verdict === "Adjust")
    return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />;
  return <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />;
}

// ─── Confidence bar ───────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 70 ? "bg-bull" : value >= 45 ? "bg-amber-400" : "bg-bear";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-8 text-right">{value}%</span>
    </div>
  );
}

// ─── Level row (Mode A) ───────────────────────────────────────────────────────

function LevelRow({
  label,
  validation,
  read,
  suggested,
}: {
  label: string;
  validation: LevelValidation;
  read: number | null;
  suggested: number | null;
}) {
  const hasSuggestion = suggested !== null && validation.verdict === "Adjust";
  return (
    <div className={cn(
      "rounded-xl border p-3.5",
      validation.verdict === "Good" && "border-bull/20 bg-bull/5",
      validation.verdict === "Adjust" && "border-amber-400/20 bg-amber-500/5",
      validation.verdict === "Unreadable" && "border-border bg-surface-elevated/40",
    )}>
      <div className="flex items-start gap-2.5">
        <VerdictIcon verdict={validation.verdict} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{label}</span>
            {read !== null && (
              <span className="text-sm font-mono font-semibold text-foreground">${read.toFixed(2)}</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">{validation.note}</p>
          {hasSuggestion && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-[10px] text-amber-400/80 font-medium">Suggested:</span>
              <span className="text-[11px] font-mono font-semibold text-amber-300">${suggested!.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Mode A Results ───────────────────────────────────────────────────────────

function ResultsA({
  result,
  onAdd,
  onDiscard,
  commitStatus,
}: {
  result: ValidationResultA;
  onAdd: () => void;
  onDiscard: () => void;
  commitStatus: CommitStatus;
}) {
  const hasSuggestions = Object.values(result.validation).some((v) => v.verdict === "Adjust");

  // Always compute R/R from actual levels (AI's rr_ratio value is unreliable)
  const originalRR = calcRR(result.levelsRead.entry, result.levelsRead.stop, result.levelsRead.target, result.direction);
  const se = result.suggestedLevels.entry ?? result.levelsRead.entry;
  const ss = result.suggestedLevels.stop ?? result.levelsRead.stop;
  const st = result.suggestedLevels.target ?? result.levelsRead.target;
  const suggestedRR = hasSuggestions ? calcRR(se, ss, st, result.direction) : null;

  const verdictColor =
    result.overallVerdict === "Valid" ? "text-bull border-bull/30 bg-bull/8"
    : result.overallVerdict === "Valid with adjustments" ? "text-amber-300 border-amber-400/30 bg-amber-500/8"
    : "text-bear border-bear/30 bg-bear/8";

  if (commitStatus === "committed") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-bull/15 border border-bull/30 flex items-center justify-center">
          <BookmarkCheck className="w-6 h-6 text-bull" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Added to watchlist</p>
          <p className="text-sm text-muted-foreground mt-1">The AI will analyze it and surface a setup if one exists</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div>
            <span className="text-base font-bold text-foreground">{result.ticker}</span>
            <span className="text-muted-foreground mx-1.5">·</span>
            <span className="text-sm text-muted-foreground">{result.patternIdentified}</span>
          </div>
          {result.direction && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border",
              result.direction === "LONG"
                ? "text-bull border-bull/30 bg-bull/10"
                : "text-bear border-bear/30 bg-bear/10"
            )}>
              {result.direction === "LONG" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {result.direction}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{result.timeframe}</p>
        <div className="mt-2">
          <ConfidenceBar value={result.confidence} />
        </div>
      </div>

      {/* Overall verdict */}
      <div className={cn("rounded-xl border px-3.5 py-2.5 text-sm font-semibold", verdictColor)}>
        {result.overallVerdict}
      </div>

      {/* Image quality warning */}
      {result.imageQualityIssues && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/8 px-3 py-2.5">
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">Image quality</p>
          <p className="text-[11px] text-amber-300/90">{result.imageQualityIssues}</p>
        </div>
      )}

      {/* Level validations */}
      <div className="space-y-2">
        <LevelRow
          label="Entry"
          validation={result.validation.entry}
          read={result.levelsRead.entry}
          suggested={result.suggestedLevels.entry}
        />
        <LevelRow
          label="Stop"
          validation={result.validation.stop}
          read={result.levelsRead.stop}
          suggested={result.suggestedLevels.stop}
        />
        <LevelRow
          label="Target"
          validation={result.validation.target}
          read={result.levelsRead.target}
          suggested={result.suggestedLevels.target}
        />
      </div>

      {/* R/R display */}
      {originalRR !== null && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-elevated border border-border text-sm">
          <span className="text-muted-foreground">R/R</span>
          <span className="font-mono font-semibold text-foreground">{originalRR.toFixed(1)}:1</span>
          {suggestedRR !== null && suggestedRR !== originalRR && (
            <>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-mono font-semibold text-amber-300">{suggestedRR.toFixed(1)}:1</span>
              <span className="text-[10px] text-muted-foreground">(suggested)</span>
            </>
          )}
        </div>
      )}

      {/* Overall note */}
      {result.overallNote && (
        <p className="text-[12px] text-muted-foreground leading-relaxed">{result.overallNote}</p>
      )}

      {/* Action buttons */}
      <div className="space-y-2 pt-1">
        <button
          onClick={onAdd}
          disabled={commitStatus === "committing"}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {commitStatus === "committing" ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkCheck className="w-4 h-4" />}
          Add to Watchlist
        </button>
        <button
          onClick={onDiscard}
          className="w-full py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

// ─── Mode B Results ───────────────────────────────────────────────────────────

function ResultsB({
  result,
  onAdd,
  onDiscard,
  commitStatus,
}: {
  result: ValidationResultB;
  onAdd: () => void;
  onDiscard: () => void;
  commitStatus: CommitStatus;
}) {
  if (commitStatus === "committed") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-bull/15 border border-bull/30 flex items-center justify-center">
          <BookmarkCheck className="w-6 h-6 text-bull" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Added to watchlist</p>
          <p className="text-sm text-muted-foreground mt-1">The AI will analyze it and surface a setup if one exists</p>
        </div>
      </div>
    );
  }

  if (!result.setupFound) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface-elevated/40 px-4 py-5 text-center">
          <p className="font-semibold text-foreground mb-2">No clear setup found</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{result.noSetupReason}</p>
        </div>
        <button onClick={onDiscard} className="w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
          Upload a different chart
        </button>
      </div>
    );
  }

  const computedRR = calcRR(result.entry, result.stop, result.target, result.direction);
  const rrOk = computedRR !== null && computedRR >= 2;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <div>
            <span className="text-base font-bold text-foreground">{result.ticker}</span>
            {result.patternIdentified && (
              <>
                <span className="text-muted-foreground mx-1.5">·</span>
                <span className="text-sm text-muted-foreground">{result.patternIdentified}</span>
              </>
            )}
          </div>
          {result.direction && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border",
              result.direction === "LONG"
                ? "text-bull border-bull/30 bg-bull/10"
                : "text-bear border-bear/30 bg-bear/10"
            )}>
              {result.direction === "LONG" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {result.direction}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{result.timeframe}</p>
        <div className="mt-2">
          <ConfidenceBar value={result.confidence} />
        </div>
      </div>

      {/* Image quality warning */}
      {result.imageQualityIssues && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/8 px-3 py-2.5">
          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">Image quality</p>
          <p className="text-[11px] text-amber-300/90">{result.imageQualityIssues}</p>
        </div>
      )}

      {/* Price grid */}
      {(result.entry || result.stop || result.target) && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Entry", value: result.entry, color: "text-foreground" },
            { label: "Stop", value: result.stop, color: "text-bear" },
            { label: "Target", value: result.target, color: "text-bull" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-border bg-surface-elevated/50 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
              <p className={cn("text-sm font-mono font-semibold", color)}>
                {value != null ? `$${value.toFixed(2)}` : "—"}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* R/R */}
      {computedRR !== null && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm",
          rrOk ? "border-border bg-surface-elevated" : "border-amber-400/20 bg-amber-500/8"
        )}>
          <span className="text-muted-foreground">R/R</span>
          <span className={cn("font-mono font-semibold", rrOk ? "text-foreground" : "text-amber-300")}>
            {computedRR.toFixed(1)}:1
          </span>
          {!rrOk && <span className="text-[10px] text-amber-400/80 ml-1">Below 2:1 minimum</span>}
        </div>
      )}

      {/* Rationale */}
      {result.rationale && (
        <p className="text-[12px] text-muted-foreground leading-relaxed">{result.rationale}</p>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-1">
        <button
          onClick={onAdd}
          disabled={commitStatus === "committing"}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {commitStatus === "committing" ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkCheck className="w-4 h-4" />}
          Add to Watchlist
        </button>
        <button
          onClick={onDiscard}
          className="w-full py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ValidatePage() {
  const router = useRouter();
  const { features, isLoading: planLoading } = useUserPlan();

  const [image, setImage] = useState<{ dataUrl: string; base64: string; mimeType: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [sizeWarning, setSizeWarning] = useState(false);

  const [ticker, setTicker] = useState("");
  const [mode, setMode] = useState<"levels_drawn" | "analyze_only">("levels_drawn");
  const [notes, setNotes] = useState("");

  const [status, setStatus] = useState<"idle" | "validating" | "done" | "error">("idle");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [commitStatus, setCommitStatus] = useState<CommitStatus>("idle");
  const [tickerConflict, setTickerConflict] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse data URL into base64 + mimeType
  function parseDataUrl(dataUrl: string): { base64: string; mimeType: string } | null {
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return null;
    return { mimeType: m[1], base64: m[2] };
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const parsed = parseDataUrl(dataUrl);
      if (!parsed) return;

      // Client-side dimension check
      const img = new Image();
      img.onload = () => {
        setSizeWarning(img.width < 600 || img.height < 400);
      };
      img.src = dataUrl;

      setImage({ dataUrl, base64: parsed.base64, mimeType: parsed.mimeType });
      setResult(null);
      setStatus("idle");
      setErrorMsg(null);
      setCommitStatus("idle");
      setTickerConflict(null);
    };
    reader.readAsDataURL(file);
  }

  // Paste handler — whole page is a paste target
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((i) => i.type.startsWith("image/"));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) handleFile(file);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  async function handleValidate() {
    if (!image || !ticker.trim()) return;

    setStatus("validating");
    setErrorMsg(null);
    setResult(null);
    setTickerConflict(null);

    try {
      const res = await fetch("/api/validate-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData: image.dataUrl,
          ticker: ticker.trim().toUpperCase(),
          mode,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Validation failed");
      }

      const data: ValidationResult = await res.json();
      setResult(data);
      setStatus("done");

      // Check for ticker conflict
      if (data.ticker.toUpperCase() !== ticker.trim().toUpperCase()) {
        setTickerConflict(data.ticker);
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Validation failed");
    }
  }

  async function addToWatchlist() {
    if (!result) return;
    setCommitStatus("committing");

    try {
      const resolvedTicker = tickerConflict ?? ticker.trim().toUpperCase();

      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: resolvedTicker, name: resolvedTicker }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to add to watchlist");
      }

      setCommitStatus("committed");
    } catch (err) {
      setCommitStatus("idle");
      setErrorMsg(err instanceof Error ? err.message : "Failed to add to watchlist");
    }
  }

  function reset() {
    setImage(null);
    setResult(null);
    setStatus("idle");
    setErrorMsg(null);
    setCommitStatus("idle");
    setTickerConflict(null);
    setSizeWarning(false);
  }

  const showResults = status === "done" && result !== null;
  const canValidate = !!image && !!ticker.trim() && status !== "validating";

  // Edge-only gate
  if (!planLoading && !features.validateOwnChart) {
    return (
      <div className="flex flex-col h-dvh overflow-hidden">
        <AppHeader activePage="validate" />
        <main className="flex-1 flex items-center justify-center p-8">
          <UpgradePrompt
            requiredPlan="edge"
            featureLabel="Validate Your Own Chart"
            variant="card"
            className="max-w-md w-full"
          />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <AppHeader activePage="validate" />

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-8">

          {/* Page title */}
          <div className="mb-8">
            <h1 className="text-xl font-bold text-foreground mb-1">Validate Your Setup</h1>
            <p className="text-sm text-muted-foreground">
              Paste or upload a chart screenshot. The AI will validate your levels or identify a new setup.
            </p>
          </div>

          {!image ? (
            /* ── Empty state — upload zone ─────────────────────────────── */
            <div
              className={cn(
                "relative rounded-2xl border-2 border-dashed transition-colors",
                isDragOver
                  ? "border-accent bg-accent/8"
                  : "border-border bg-surface/50 hover:border-border/80"
              )}
              style={{ minHeight: 280 }}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center pointer-events-none">
                <div className={cn(
                  "w-14 h-14 rounded-2xl border flex items-center justify-center transition-colors",
                  isDragOver ? "border-accent/40 bg-accent/15" : "border-border bg-surface-elevated"
                )}>
                  <Upload className={cn("w-6 h-6", isDragOver ? "text-accent" : "text-muted-foreground")} />
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-1">
                    {isDragOver ? "Drop the image here" : "Drag and drop or click to upload"}
                  </p>
                  <p className="text-sm text-muted-foreground">PNG, JPG — max 10MB</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground/70 mt-2">
                  <kbd className="px-2 py-0.5 rounded border border-border bg-surface font-mono">Ctrl+V</kbd>
                  <span>or</span>
                  <kbd className="px-2 py-0.5 rounded border border-border bg-surface font-mono">⌘V</kbd>
                  <span>to paste a screenshot directly</span>
                </div>
              </div>
            </div>

          ) : (
            /* ── Image uploaded — two-panel layout ─────────────────────── */
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">

              {/* Left — chart preview */}
              <div className="relative rounded-2xl border border-border bg-surface overflow-hidden">
                {/* Remove button */}
                <button
                  onClick={reset}
                  className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-surface/80 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground transition-colors"
                  title="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>

                <img
                  src={image.dataUrl}
                  alt="Chart"
                  className="w-full h-full object-contain"
                  style={{ maxHeight: "65vh" }}
                />

                {/* Size warning */}
                {sizeWarning && (
                  <div className="absolute bottom-3 left-3 right-3 px-3 py-2 rounded-lg border border-amber-400/30 bg-amber-500/10 backdrop-blur-sm">
                    <p className="text-[11px] text-amber-300">
                      This image may be too small for accurate analysis. For best results use a full-size screenshot.
                    </p>
                  </div>
                )}
              </div>

              {/* Right — config or results */}
              <div className="rounded-2xl border border-border bg-surface p-5 overflow-y-auto" style={{ maxHeight: "75vh" }}>

                {!showResults ? (
                  /* Config panel */
                  <div className="space-y-5">
                    <h2 className="text-sm font-semibold text-foreground">Configure analysis</h2>

                    {/* Ticker */}
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Ticker</label>
                      <input
                        type="text"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value.toUpperCase())}
                        placeholder="TSLA"
                        maxLength={10}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface-elevated text-foreground font-mono text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
                      />
                    </div>

                    {/* Mode */}
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-2">What do you have drawn?</label>
                      <div className="space-y-2">
                        {[
                          { value: "levels_drawn" as const, label: "I have levels drawn", desc: "AI validates your entry, stop & target" },
                          { value: "analyze_only" as const, label: "Just analyze the chart", desc: "AI identifies a setup from scratch" },
                        ].map((opt) => (
                          <label
                            key={opt.value}
                            className={cn(
                              "flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors",
                              mode === opt.value
                                ? "border-accent/40 bg-accent/8"
                                : "border-border bg-surface-elevated/50 hover:border-border/80"
                            )}
                          >
                            <input
                              type="radio"
                              name="mode"
                              value={opt.value}
                              checked={mode === opt.value}
                              onChange={() => setMode(opt.value)}
                              className="mt-0.5 accent-accent"
                            />
                            <div>
                              <p className="text-sm font-medium text-foreground">{opt.label}</p>
                              <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                        Notes <span className="text-muted-foreground/50">(optional)</span>
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value.slice(0, 300))}
                        placeholder="e.g. Bull flag on the daily, entry based on VWAP reclaim…"
                        rows={3}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface-elevated text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent/50 resize-none leading-relaxed"
                      />
                      <p className="text-right text-[10px] text-muted-foreground/50 mt-1">{notes.length}/300</p>
                    </div>

                    {/* Validate button */}
                    <button
                      onClick={handleValidate}
                      disabled={!canValidate}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {status === "validating" ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Analyzing…
                        </>
                      ) : (
                        "Validate →"
                      )}
                    </button>

                    {status === "error" && errorMsg && (
                      <p className="text-xs text-bear text-center">{errorMsg}</p>
                    )}
                  </div>

                ) : (
                  /* Results panel */
                  <div>
                    {/* Ticker conflict banner */}
                    {tickerConflict && (
                      <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/8 px-3 py-2.5">
                        <p className="text-[11px] text-amber-300 leading-relaxed">
                          You entered <strong>{ticker.toUpperCase()}</strong> but the chart appears to show{" "}
                          <strong>{tickerConflict}</strong>. Which ticker should this setup be tracked under?
                        </p>
                        <div className="flex gap-2 mt-2">
                          {[ticker.toUpperCase(), tickerConflict].map((t) => (
                            <button
                              key={t}
                              onClick={() => setTickerConflict(t === ticker.toUpperCase() ? null : t)}
                              className={cn(
                                "px-3 py-1 rounded-lg text-xs font-mono font-semibold border transition-colors",
                                (t === ticker.toUpperCase() && !tickerConflict) || (t === tickerConflict && tickerConflict !== null)
                                  ? "border-accent/40 bg-accent/15 text-accent"
                                  : "border-border text-muted-foreground hover:text-foreground"
                              )}
                            >
                              Use {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Back button */}
                    <button
                      onClick={() => { setStatus("idle"); setResult(null); setCommitStatus("idle"); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
                    >
                      ← Back to config
                    </button>

                    {result.mode === "levels_drawn" ? (
                      <ResultsA
                        result={result as ValidationResultA}
                        onAdd={addToWatchlist}
                        onDiscard={reset}
                        commitStatus={commitStatus}
                      />
                    ) : (
                      <ResultsB
                        result={result as ValidationResultB}
                        onAdd={addToWatchlist}
                        onDiscard={reset}
                        commitStatus={commitStatus}
                      />
                    )}

                    {commitStatus === "idle" && errorMsg && (
                      <p className="mt-3 text-xs text-bear text-center">{errorMsg}</p>
                    )}

                    {commitStatus === "committed" && (
                      <button
                        onClick={() => router.push("/app")}
                        className="mt-4 w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Go to Chart Analysis →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
