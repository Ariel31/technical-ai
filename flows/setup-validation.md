Overview
This feature is the inverse of the AI-generated setup flow. Instead of the platform finding setups and the user refining them, the user brings their own chart analysis and the AI validates it — checking whether the pattern is correctly identified, whether the levels are placed well, and whether the risk/reward makes sense.
The output is a proper setup card in the same format as any screener-generated setup. It enters the Track Record on equal footing. The source field distinguishes it: source: "user_import" vs source: "screener".

Where it lives — UI placement
Recommended: dedicated "Validate" tab
Add a fourth tab to the main navigation, positioned between Chart Analysis and Track Record:
Top Picks | Chart Analysis | Validate | Track Record
Why a separate tab:

Signals the feature clearly to new users — they immediately see there is a place to bring their own analysis
The workflow is meaningfully different from Chart Analysis (you navigate to a stock there; here you paste an image)
Keeps Chart Analysis clean — that tab is for AI-initiated analysis, this tab is for user-initiated validation
The left-to-right tab order now maps to a natural trading workflow:

Find ideas → Analyze AI picks → Validate your own ideas → Track results
Alternative: mode toggle inside Chart Analysis
If a fourth tab feels too heavy at this stage, add a mode toggle at the top of the Chart Analysis tab:
[ AI Analysis | Validate My Setup ]
"AI Analysis" is the current behavior. "Validate My Setup" loads the upload interface described below. Same tab, different mode. The nav stays at 3 items.
This is the lower-effort option. It is less discoverable but keeps the nav simpler.
Recommendation: start with the toggle, ship the dedicated tab once the feature is validated with users. The backend and AI logic are identical either way — only the nav placement changes.

Feature flow
User opens Validate tab (or toggles mode)
|
v
Upload interface — paste or drag screenshot
|
v
User selects mode:
A) "I have levels drawn" → AI validates user's levels
B) "Just analyze the chart" → AI identifies setup from scratch
|
v
User confirms ticker (always required)
|
v
AI processes image → returns validated setup card
|
v
User reviews AI feedback — accepts, modifies, or discards
|
v
Commit to Track Record (same flow as screener setups)

UI — Upload interface
Empty state (no image uploaded yet)
┌─────────────────────────────────────────────────────────┐
│ │
│ Validate your own setup │
│ │
│ Paste or upload a chart screenshot from TradingView, │
│ thinkorswim, or any charting platform. The AI will │
│ validate your analysis and check your levels. │
│ │
│ ┌─────────────────────────────────────────────────┐ │
│ │ │ │
│ │ Drag and drop or click to upload │ │
│ │ PNG, JPG — max 10MB │ │
│ │ │ │
│ └─────────────────────────────────────────────────┘ │
│ │
│ Or paste directly: Cmd+V / Ctrl+V │
│ │
└─────────────────────────────────────────────────────────┘
Support both file upload and direct paste (clipboard image). Ctrl+V / Cmd+V is how most traders will use this — they screenshot TradingView and paste immediately. Make the entire page a paste target so the user doesn't need to click into a specific field first.
Styling:
upload zone:
border: 1.5px dashed var(--color-border-secondary)
border-radius: var(--border-radius-lg)
background: var(--color-background-secondary)
min-height: 160px
display: flex; align-items: center; justify-content: center

on drag-over:
border-color: #185FA5
background: #E6F1FB
After image is pasted/uploaded
The image renders in a preview panel (left side, ~60% width). The right side shows the configuration panel.
┌──────────────────────────┬──────────────────────────┐
│ │ │
│ [Chart preview] │ Ticker │
│ │ [TSLA ] │
│ Image fills this │ │
│ panel, maintains │ What do you have drawn? │
│ aspect ratio │ ○ I have levels drawn │
│ │ ○ Just analyze the chart│
│ │ │
│ [× Remove] │ Notes (optional) │
│ │ [ ] │
│ │ [ Any context about ] │
│ │ [ your analysis... ] │
│ │ │
│ │ [ Validate → ] │
└──────────────────────────┴──────────────────────────┘
Ticker input
Required field. Pre-populate if the AI can read the ticker from the image (many TradingView screenshots show it clearly) — but always show the field so the user can confirm or correct it. Validation: must be a recognized US equity ticker.
Mode selection
Two radio options:
"I have levels drawn"
The AI looks for entry, stop, and target lines already marked on the chart. It validates their placement against the price structure and suggests corrections where needed.
"Just analyze the chart"
The AI identifies the setup and proposes levels from scratch. Effectively the same as the existing Chart Analysis feature but on a user-provided image instead of a live chart.
Notes field (optional)
Free text, max 300 characters. The user can add context the chart doesn't show:

"I think this is a bull flag on the daily"
"Entry is based on the VWAP reclaim"
"This is a 1-hour chart"

This context is passed to the AI prompt and helps it give a more accurate validation.
Image quality check
Before sending to AI, check image dimensions client-side:
if image width < 600px or height < 400px:
show warning: "This image may be too small for accurate analysis.
For best results use a full-size screenshot."
user can still proceed

AI prompt — Mode A (user has levels drawn)
System:
You are a technical analysis validator. The user has provided a chart screenshot
with their own analysis drawn on it. Your job is to:

1. Identify the pattern they are analyzing
2. Read their drawn levels (entry, stop, target if visible)
3. Validate whether each level is correctly placed on the price structure
4. Check the R/R ratio
5. Suggest only the changes that are clearly wrong or significantly improvable
6. Do not redraw the whole setup — respond to what the user has drawn

If you cannot clearly read a level from the image, say so explicitly
rather than guessing.

Respond in JSON only:
{
"ticker": "string — confirmed or corrected from image",
"pattern_identified": "string — what pattern you see",
"timeframe": "string — daily / weekly / 4h / 1h etc if readable",
"direction": "LONG or SHORT",
"levels_read": {
"entry": number or null,
"stop": number or null,
"target": number or null
},
"rr_ratio": number or null,
"validation": {
"entry": { "verdict": "Good" | "Adjust" | "Unreadable", "note": "one sentence" },
"stop": { "verdict": "Good" | "Adjust" | "Unreadable", "note": "one sentence" },
"target": { "verdict": "Good" | "Adjust" | "Unreadable", "note": "one sentence" }
},
"suggested_levels": {
"entry": number or null,
"stop": number or null,
"target": number or null
},
"pattern_invalidation_level": number,
"overall_verdict": "Valid" | "Valid with adjustments" | "Invalid",
"overall_note": "two sentences maximum — overall read on the setup",
"confidence": number between 0 and 100,
"image_quality_issues": "string or null — if any levels were unreadable"
}

User:
Ticker: [ticker]
User notes: [notes text or "none"]
[image attached]

AI prompt — Mode B (just analyze the chart)
System:
You are a technical analysis expert. The user has provided a chart screenshot
and wants you to identify any valid setup present.

Analyze the chart and if a valid setup exists, return the setup details.
If no clear setup is present, say so.

Respond in JSON only:
{
"ticker": "string",
"pattern_identified": "string or null",
"timeframe": "string",
"direction": "LONG or SHORT or null",
"setup_found": true or false,
"entry": number or null,
"stop": number or null,
"target": number or null,
"rr_ratio": number or null,
"pattern_invalidation_level": number or null,
"confidence": number between 0 and 100,
"rationale": "two to three sentences",
"no_setup_reason": "one sentence if setup_found is false, otherwise null",
"image_quality_issues": "string or null"
}

User:
Ticker: [ticker]
User notes: [notes text or "none"]
[image attached]

UI — Validation results
After the AI responds, replace the right panel with the validation output. The chart preview stays on the left.
Mode A result — level-by-level verdict
┌──────────────────────────┬──────────────────────────┐
│ │ TSLA · Bull Flag │
│ [Chart preview] │ Daily · LONG │
│ │ Confidence: 74% │
│ │ │
│ │ ✓ Entry $375 │
│ │ "Well placed at the │
│ │ flag breakout level" │
│ │ │
│ │ ⚠ Stop $388 │
│ │ "Too loose — consider │
│ │ $383 just below the │
│ │ flag low" │
│ │ Suggested: $383 │
│ │ │
│ │ ✓ Target $347 │
│ │ "Aligns with the │
│ │ measured move" │
│ │ │
│ │ R/R 2.1:1 → 2.8:1 │
│ │ (with suggested stop) │
│ │ │
│ │ Overall: Valid with │
│ │ adjustments │
│ │ │
│ │ [Accept suggestions] │
│ │ [Keep my levels] │
│ │ [Discard] │
└──────────────────────────┴──────────────────────────┘
Verdict icons:

✓ Good → green checkmark
⚠ Adjust → amber warning icon
? Unreadable → gray question mark

R/R display: Show original R/R and the improved R/R with suggested levels side by side. Makes the benefit of the suggestion concrete.
Three action buttons:

"Accept suggestions" — applies all "Adjust" suggestions, creates the setup with modified levels
"Keep my levels" — creates the setup with the user's original levels as-read from the image
"Discard" — closes the result, goes back to upload interface

Mode B result — new setup card
Same layout as the Chart Analysis tab setup panel. Confidence score, entry/stop/target, R/R, rationale. One action button: "Add to Track Record".
No setup found state (Mode B only)
│ No clear setup found │
│ │
│ "The chart shows consolidation following a │
│ sharp decline. No defined pattern or clear │
│ entry level is present at this time." │
│ │
│ [Upload a different chart] │
Image quality issue state
If image_quality_issues is non-null:
amber banner above results:
"Some levels could not be read clearly from the image.
Results may be incomplete — consider uploading a higher-resolution screenshot."

Setup data model — additional fields for imported setups
When a validated setup is committed to the Track Record, add these fields:
source "user_import" (vs "screener" for AI-generated)
source_image_hash hash of the uploaded image (for deduplication)
import_mode "levels_drawn" | "analyze_only"
original_levels { entry, stop, target } — what the user had before AI suggestions
ai_suggestions_applied boolean — did user accept the AI's suggested changes
These fields enable a future Track Record insight: "setups you imported vs setups from the screener — which perform better?" and "when you accepted AI suggestions on imports, did it improve results?"

Track Record — imported setups
Imported setups appear in Live Setups and History alongside screener setups. They are visually distinguished with a small badge:
TSLA bull_flag Waiting for entry
Entry $375 · Stop $383 · Target $347 · R/R 2.8:1
Imported · AI validated · v1
The Imported badge is gray. AI validated confirms it went through the validation flow. Same lifecycle rules apply — Tier 1 and Tier 2 validity checks run on imported setups exactly as they do on screener setups, as long as the ticker was confirmed.

Edge cases
Ticker not readable from image
If the AI returns a ticker that differs from what the user entered, show a conflict warning:
"You entered TSLA but the chart appears to show NVDA.
Which ticker should this setup be tracked under?"
[Use TSLA] [Use NVDA]
Multiple setups visible in the image
If the chart has multiple patterns drawn, the AI picks the most prominent one and notes the others:
overall_note: "Analyzed the primary bull flag. A potential double bottom is also
visible on the longer timeframe but was not the focus of this analysis."
R/R below minimum after validation
Same handling as the refinement feature — amber warning, user is informed but not blocked. The setup is saved with below_minimum_rr: true.
User uploads a non-chart image
Client-side: check that the image is not a solid color or extremely low detail before sending.
AI-side: if the image is clearly not a price chart, return:
{
"setup_found": false,
"no_setup_reason": "The image does not appear to be a price chart."
}
Show: "This doesn't look like a chart — please upload a screenshot of a price chart."
