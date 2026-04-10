Overview
The setup refinement feature lets the user push back on any part of an AI-generated setup using plain text. The AI reads the original setup and the user's note, makes only the minimum change needed, and produces a new version of the setup. The original is never overwritten — both versions are preserved.
This creates a feedback loop where the user's market knowledge and personal judgment refines the AI's output rather than replacing it. Over time the version history becomes an educational record: did the user's manual adjustments improve or hurt their results?

Core design rules

1. Free text input — no forms or dropdowns.
   The user types naturally. "I think the stop is too tight" is a valid input. "Move target to 355" is a valid input. "I disagree with the pattern" is a valid input. Structured fields would constrain the user to changes the designer anticipated — free text captures anything.
2. Minimum change — the AI touches only what the user challenged.
   If the user questions the target, only the target changes. The pattern interpretation, entry, stop, and key levels stay exactly as the AI set them unless the user's change structurally forces an update. The AI is not re-analyzing the chart — it is responding to a specific objection.
3. Versioning — never overwrite, always append.
   Every refinement produces a new version. v1 is the original AI output. v2 is after the first user refinement. v3 after the second, and so on. The user selects which version they commit to — that version is what the Track Record tracks. v1 is always preserved.
4. The AI can push back — but must comply.
   If the user's requested change has no technical basis (e.g. a target with no resistance level to justify it), the AI flags this in one sentence and explains why. But it still makes the change. The user is informed, not blocked.
5. No threading — one refinement box per version.
   This is not a chat interface attached to the setup. The refinement box is a single input. The user writes their objection, submits, gets v2. If they want to refine again they use the same box on v2 to produce v3. Clean version history, no comment threads.

UI — where it lives
The refinement UI lives in the Chart Analysis tab, inside the Trade Setup panel on the right sidebar (currently showing Entry / Stop / Target / Risk:Reward).
Current Trade Setup panel layout (reference)
Trade Setup NO ENTRY YET
Entry $375 | Stop $388 | Target $347
Risk / Reward 1 : 2.1

[text describing the setup rationale]
Updated Trade Setup panel layout
Trade Setup NO ENTRY YET [v1]
Entry $375 | Stop $388 | Target $347
Risk / Reward 1 : 2.1

[AI rationale text]

─────────────────────────────────────
Refine this setup
[ ]
[ I think the target is too ]
[ aggressive — resistance at $355 ]
[ ]
[Refine →]
─────────────────────────────────────
Version badge
When a refined version exists, a small version badge appears next to "Trade Setup":

v1 — original AI output (gray badge)
v2 — first user refinement (blue badge)
v3 — second user refinement (blue badge)

Clicking the badge opens a version history dropdown (see Version History section below).

UI — refinement input box
Styling
textarea:
width: 100%
min-height: 72px
max-height: 160px (scrollable beyond this)
font-size: 13px
color: var(--color-text-primary)
background: var(--color-background-secondary)
border: 0.5px solid var(--color-border-secondary)
border-radius: var(--border-radius-md)
padding: 10px 12px
resize: vertical
placeholder: "What do you disagree with? e.g. 'The target feels too aggressive' or 'I'd tighten the stop to $385'"
Submit button
label: "Refine →"
style: primary button — background: #E6F1FB; color: #185FA5; font-weight: 500
position: bottom-right of the input box
disabled state: when input is empty
loading state: spinner while AI is processing ("Refining setup...")
Character limit
500 characters. Show a counter at bottom-right of the textarea when the user is within 100 characters of the limit: "342 / 500". This keeps inputs focused and prevents the user from writing a full re-analysis request.

AI prompt — refinement call
When the user submits, send this prompt. It is a constrained edit, not a full chart analysis:
System:
You are a technical analysis assistant. A setup has already been generated.
The user disagrees with one aspect of it and wants a specific change.

Your job:

1. Identify exactly what the user is challenging (entry / stop / target / pattern type / key levels)
2. Make only that change — do not alter anything else unless the user's change structurally requires it
3. Validate whether the requested change is technically defensible
4. Return the result in JSON only — no prose outside the JSON

Response format:
{
"changed_fields": {
"target": 355.00 (only include fields that actually changed)
},
"unchanged_fields": {
"entry": 375.00,
"stop": 388.00,
"rr_ratio": 2.46 (recalculate if a level changed)
},
"change_summary": "one sentence — what was changed and why",
"technical_warning": "one sentence if the change lacks technical basis, otherwise null"
}

User:
Original setup (generated [created_at]):

- Ticker: [ticker]
- Pattern: [pattern_type]
- Direction: [direction]
- Entry: [entry]
- Stop: [stop]
- Target: [target]
- R/R: [rr_ratio]
- Key levels: [key_levels]
- Pattern invalidation level: [pattern_invalidation_level]
- AI rationale: [original_rationale]

User feedback: "[user input text]"

Make only the change the user is describing.
Handling the response
Parse the JSON. Apply changed_fields to produce the new setup version. Recalculate rr_ratio automatically if entry, stop, or target changed.
If the new rr_ratio drops below the platform minimum (2.0), show a warning inline below the refined setup:
amber warning: "This adjustment brings the R/R to 1.6:1 — below the recommended minimum of 1:2.
The setup has been saved but consider adjusting the stop to restore the ratio."
The user can still commit to this version — they are informed, not blocked.

Version data model
Each version is a child record of the parent setup:
version_id unique identifier
setup_id parent setup reference
version_number 1, 2, 3...
source "ai" (v1 always) | "user_refinement"
created_at timestamp
entry level
stop level
target level
rr_ratio calculated
change_summary one sentence from AI (null for v1)
technical_warning one sentence from AI if applicable (null if none)
user_input_text the raw text the user submitted (null for v1)
is_committed boolean — the version the user chose to track
Only one version per setup can have is_committed: true. This is the version that feeds the Track Record.

Version history UI
Clicking the version badge (v2) in the Trade Setup panel header opens a dropdown:
┌─────────────────────────────────────────────────┐
│ Setup versions │
│ │
│ v1 Apr 6 · AI generated │
│ Entry $375 · Stop $388 · Target $347 │
│ R/R 2.1:1 [Use v1] │
│ │
│ v2 Apr 6 · Your refinement ← committed │
│ Entry $375 · Stop $388 · Target $355 │
│ R/R 2.5:1 │
│ "Target moved to $355 — aligns with │
│ resistance at the prior swing high" │
└─────────────────────────────────────────────────┘

Currently committed version has no button — it is the active version
Other versions have a [Use vN] button to switch commitment
Switching commitment updates the Track Record entry in real time
Each version shows the change_summary from the AI so the user remembers what changed and why

Track Record — versioning impact
Setup card in Live Setups
Show which version is committed:
TSLA triple_top Waiting for entry
Entry $380 · Stop $390 · Target $355
v2 — your refinement · R/R 2.5:1
The version label is a small muted badge next to the R/R. Clicking it opens the version history dropdown.
History tab — completed setups
When a setup completes (WIN or LOSS), record which version was committed at the time of completion. Show in the history row:
TSLA WIN +6.6% v2
This enables a future analytics view: "v1 AI setups vs v2+ user-refined setups — which perform better?" That is a powerful feedback loop that teaches the user whether their manual adjustments add value.
Performance split (future)
Once enough data exists, surface a metric card in Track Record:
AI-only setups (v1): 58% win rate +2.1% avg return
Your refinements (v2+): 64% win rate +3.4% avg return
Or the reverse — if the user's refinements are hurting performance, that's equally valuable to know. This metric card only appears after a minimum of 10 completed setups in each category.

Edge cases
User requests a full re-analysis
If the input is something like "redo the whole analysis" or "I think the pattern is completely wrong":

Do not run the refinement prompt
Show an inline message: "For a full re-analysis, use the Re-analyze button above. Refinement is for adjusting specific levels."
This keeps refinement scoped and prevents the feature from becoming a free re-analysis trigger

User input is too vague to act on
If the AI cannot identify a specific field to change from the input (e.g. "I don't like this setup"):

Return a technical_warning asking for more specificity
Do not create a new version
Show inline below the input box: "Could you be more specific? e.g. 'The target is too high' or 'The stop should be tighter'"

Refined R/R drops below 2.0
Show the amber warning (described above). Do not block. Record the version with a flag: below_minimum_rr: true. This flag is visible in the version history so the user is always aware.
Setup has already triggered
If the setup state is Triggered (user is in the trade), the refinement box is disabled with a label:
"Setup has triggered — levels cannot be modified while in a trade"
Refinement is only available on Active and Weakened setups.
