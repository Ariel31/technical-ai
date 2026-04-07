# TechnicalAI — Smart Setup Lifecycle: Logic & Architecture

> Paste this document into Claude Code alongside the UX doc. This covers the data model, state machine, validity check system, and Track Record integrity rules.

---

## The core principle

**The setup is the source of truth — not the AI analysis.**

When the AI generates a trade setup (entry, stop, target, pattern type), that setup is locked to the date it was created. It represents a thesis fitted to a specific price structure on a specific day. Everything that follows — daily re-checks, track record outcomes, validity states — exists to answer one question:

> "Is the original price structure from [date] still intact given what price has done since?"

The AI does not generate new opinions daily. It acts only as a validator: "is the original setup still alive?" The setup is the anchor. The AI is the watchman.

**There are no time-based expiry rules.** Date limits are a proxy for what actually matters — whether the price structure is still intact. A setup lives as long as the market respects it, and dies the moment the market breaks it, regardless of how many days have passed. Time is not the arbiter — price is.

---

## 1. Setup data model

Every setup stored in the system must carry these fields from the moment it is created:

```
setup_id                    unique identifier
ticker                      e.g. "TSLA"
pattern_type                e.g. "Inverse H&S", "SMA Bounce"
direction                   LONG or SHORT
created_at                  timestamp of AI generation (e.g. "Apr 6, 2025 22:53")
fitted_price                price at time of analysis (e.g. $375.00)
entry                       planned entry level
stop                        stop loss level
target                      profit target
key_levels                  array of support/resistance the pattern depends on
pattern_invalidation_level  the single price level that structurally kills the thesis
                            if breached — set by the AI at generation time, not after
validity_state              one of: Active / Weakened / Invalidated / Triggered / Completed / Voided
last_checked_at             timestamp of most recent validity check
ai_validation_note          one-sentence AI verdict from last check
```

### pattern_invalidation_level — examples by pattern type

This is the most important field. The AI must encode it at generation time because it knows the pattern's structural dependencies when it creates the setup.

| Pattern                | Invalidation level                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Inverse H&S            | Neckline — if price closes back below it after breakout, or breaks it to downside before trigger                      |
| SMA Bounce             | The moving average being bounced from — if price closes cleanly below it                                              |
| Cup & Handle           | Lip of the cup / breakout level — if price breaks back below it                                                       |
| Consolidation Breakout | Top of the consolidation range — if price falls back inside the range                                                 |
| Momentum Continuation  | Prior swing low — if price undercuts it, momentum is broken                                                           |
| Flags / Pennants       | The apex zone price — if price drifts into the apex without breaking out, the pattern has resolved without triggering |

Note on flags and pennants: these patterns compress toward an apex. If price reaches the apex zone without breaking out, the pattern has resolved. This is still encoded as a **price level** (the apex zone), not a date. The Tier 1 check catches it as a level breach.

---

## 2. Validity state machine

```
[Generated]
     |
     v
 [Active] ──────────────────────────────────────────────────────┐
     |                                                           |
     |── pattern_invalidation_level breached ──► [Invalidated]  |
     |── entry irrelevant / AI Tier 2 judgment ─► [Voided]      |
     |── price hits entry ──────────────────────► [Triggered]   |
     |── AI Tier 2 returns "Weakened" ──────────► [Weakened] ───┤
                                                       |         |
                                                       |── price recovers ───────►┘
                                                       |── price worsens ──► [Invalidated]

[Triggered] — price entered the trade
     |── price hits target ──► [Completed: WIN]
     |── price hits stop ───► [Completed: LOSS]
     |── setup invalidated ─► [Completed: LOSS] — user was in the trade, stop counts
```

### Critical rule: Triggered vs not Triggered

- Setup was **never triggered** and pattern breaks → **Voided** — user never entered, not counted in win rate or expectancy
- Setup was **triggered** (price reached entry) and pattern then breaks → **Completed: LOSS** — user was in the trade, the stop is the exit

This distinction is what makes the Track Record trustworthy. Voided setups are excluded from all performance calculations.

---

## 3. Daily validity check — two-tier system

Run on every app open and on a daily cron (e.g. market close, 4:30 PM ET).

### Tier 1 — programmatic checks (no AI cost, run first)

Pure price logic, no AI needed. Fast and cheap.

**Check 1 — Invalidation level breach:**

```
if current_price crossed pattern_invalidation_level (on a closing basis):
    validity_state = "Invalidated"
    stop — do not proceed to Tier 2
```

**Check 2 — Entry so far out of reach it's structurally irrelevant:**

```
if direction == LONG and current_price > entry * 1.15:
    flag for Tier 2 review  (price ran 15%+ past entry, setup is likely stale)

if direction == SHORT and current_price < entry * 0.85:
    flag for Tier 2 review
```

**Check 3 — Volume collapse (for volume-dependent setups):**

```
if volume < 0.5x 50-day average for 3 consecutive days:
    flag for Tier 2 review
```

If Tier 1 produces Invalidated → stop. No AI call. Update validity_state and last_checked_at.

### Tier 2 — AI validation (only for flagged setups or setups Active > 3 days without triggering)

Focused prompt — answers Valid/Weakened/Invalidated, not a new analysis:

```
System:
You are a technical analysis validator. Do not generate new analysis.
Assess only whether the previously generated setup is still valid.
Respond in JSON only:
{
  "verdict": "Valid" or "Weakened" or "Invalidated",
  "reason": "one sentence maximum"
}

User:
Setup generated on [created_at]:
- Ticker: [ticker]
- Pattern: [pattern_type]
- Direction: [direction]
- Entry: [entry], Stop: [stop], Target: [target]
- Pattern invalidation level: [pattern_invalidation_level]
- Key levels: [key_levels]
- Price at generation: [fitted_price]
- Current price: [current_price]
- Recent price action (last 5 candles OHLCV): [data]

Is the original price structure still intact?
```

Store verdict in `validity_state` and reason in `ai_validation_note`.

---

## 4. Track Record — updated outcome model

### Four outcomes (not three)

| Outcome | Color | Counted in win rate? | Description                |
| ------- | ----- | -------------------- | -------------------------- |
| WIN     | Green | Yes                  | Triggered, hit target      |
| LOSS    | Red   | Yes                  | Triggered, hit stop        |
| VOIDED  | Gray  | No                   | Pattern broke before entry |
| ACTIVE  | Blue  | No                   | Still live                 |

### Updated metric cards

```
Total Setups | Win Rate | Avg Return | Expectancy | Voided | Active
     12           58%       +3.2%       +1.8%        3        2
```

- Win Rate and Expectancy: calculated from WIN and LOSS only, never Voided
- Voided card: amber color, tooltip: "Setups where the pattern was invalidated before entry — not counted in performance"
- Expectancy formula: `(win_rate × avg_win_pct) − (loss_rate × avg_loss_pct)`

### History tab — Status column

- WIN → green checkmark
- LOSS → red X
- VOIDED → gray circle-slash, hover shows reason: e.g. "Neckline broken Apr 8"

### Live Setups tab — each card shows

- `Validated [N]h ago`
- Validity badge: `Valid` (green) / `Weakened` (amber) / `Invalidated` (red)
- AI note (one sentence): e.g. "Price remains above neckline, structure intact"

---

## 5. Chart Analysis — validity banners

When a user loads a stock that has an existing active setup, show a banner below the chart:

**Valid:**

```
green banner: "Setup from Apr 6 — validated today · Still intact"
```

**Weakened:**

```
amber banner: "Setup from Apr 6 — conditions have changed · Review before acting"
              [Re-analyze button]
```

Re-analyze triggers a full fresh AI analysis — a new setup entry, not an override of the existing one.

**Invalidated:**

```
red banner: "Setup from Apr 6 — pattern invalidated · Voided"
```

Automatically moves the setup to Voided in Track Record.

---

## 6. Re-validation vs re-analysis — never conflate these

|                        | Re-validation                                          | Re-analysis                                   |
| ---------------------- | ------------------------------------------------------ | --------------------------------------------- |
| What it is             | AI checks if original thesis is alive                  | AI generates a brand new setup                |
| When it runs           | Automatically, on every app open + daily cron          | Only when user explicitly clicks "Re-analyze" |
| Prompt type            | Focused: Valid / Weakened / Invalidated + one sentence | Full chart analysis                           |
| Token cost             | Low                                                    | High                                          |
| Effect on track record | Updates validity_state only                            | Creates a new independent setup entry         |
| Triggered by           | System                                                 | User                                          |

**Never automatically overwrite a setup with a re-analysis.** A new AI opinion on a new day is a new setup with its own lifecycle. The original is preserved. This is what keeps the track record honest — every entry reflects exactly what the AI said on the day it said it, and what the market did in response.
