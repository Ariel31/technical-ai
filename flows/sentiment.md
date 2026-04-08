Overview
Two features are added to the screener pipeline. Both run as gates — one before the AI scores setups, one after. Neither requires user input to function. Together they ensure that every setup shown to the user is both mathematically viable and contextually appropriate for the current market environment.
[Raw stock universe]
|
v
[Screener pipeline — technical filters]
|
v
[AI scores and ranks setups]
|
↑ market sentiment passed as context here
|
v
[R/R gate — discard anything below 1:2]
|
v
[User sees only setups that passed both]

Feature 1 — Market Sentiment
What it is
A macro environment reading that sits above all individual stock analysis. Before the AI scores any setup, it receives the current market temperature as context. The same chart pattern scores differently in a bull market vs a high-VIX sell-off — sentiment makes the AI's confidence output reflect that reality instead of treating every day as identical.

Sentiment calculation
Fetch three signals at scan time. All three are publicly available market data — no AI needed for this step.
SignalBearish · -1Neutral · 0Bullish · +1SPY vs 200-day MAPrice below MAWithin 1% of MAPrice above MAVIX levelAbove 2518 to 25Below 18Advance / Decline ratioBelow 0.80.8 to 1.2Above 1.2
Sum the three scores:

-3 to -1 → Bearish
0 → Neutral
+1 to +3 → Bullish

Store the reading and timestamp it. Refresh at every scan.

Passing sentiment to the AI
Include the sentiment block in every screener scoring prompt, before the stock-specific analysis:
Market context at time of scan: [Bearish / Neutral / Bullish]

- SPY: [X.XX] — [above / below / near] 200-day MA ([MA value])
- VIX: [value]
- Advance/Decline ratio: [value]

Adjust your confidence score to reflect this environment:

- In Bearish conditions: reduce confidence on long breakout setups,
  increase confidence on short setups and high-RS defensive longs.
- In Bullish conditions: reduce confidence on short setups,
  increase confidence on long momentum and breakout setups.
- In Neutral conditions: no adjustment — score the chart on its own merit.
  The AI's output confidence score already reflects sentiment. No post-processing needed.

Recording sentiment on the setup
When a setup is saved, record the sentiment at that moment:
market_sentiment: "Bearish" | "Neutral" | "Bullish"
spy_vs_200ma: "above" | "below" | "near"
vix_at_creation: [number]
ad_ratio: [number]
This enables a future Track Record slice: "your setups generated in Bearish conditions have a 38% win rate vs 67% in Bullish conditions." That is valuable feedback the user cannot get anywhere else.

UI — Sentiment banner
Display a slim banner at the top of the screener (above the setup cards, below the nav) on every scan:
Bearish:
background: #FCEBEB | text: #A32D2D
"Bearish market · SPY below 200MA · VIX 28 · More stocks declining than advancing"
Neutral:
background: #F1EFE8 | text: #5F5E5A
"Neutral market · SPY near 200MA · VIX 21 · Balanced advance/decline"
Bullish:
background: #EAF3DE | text: #3B6D11
"Bullish market · SPY above 200MA · VIX 14 · More stocks advancing than declining"
Banner height: ~32px. Single line. No close button — always visible during a scan session. Clicking it can expand a small tooltip showing the three individual signal values.

UI — Top Picks suppression in extreme conditions
When sentiment score is -3 (fully Bearish): suppress long-only patterns from Top Picks.
When sentiment score is +3 (fully Bullish): suppress short setups from Top Picks.
All Setups always shows everything — suppression applies to Top Picks only.
Add a note inside the banner when suppression is active:
"Bearish market — Top Picks showing short setups and high relative-strength longs only"
[Show all anyway]
"Show all anyway" is a one-tap override that disables suppression for the current session without changing settings.

Settings — user controls
Add a "Market Filters" section in settings:
SettingDefaultDescriptionUse market sentimentOnPasses sentiment context to AI scoringSuppress conflicting directionsOnHides opposing setups from Top Picks in extreme conditionsMinimum sentiment for longsNoneOptional: only show long setups when sentiment is Neutral or BullishMinimum sentiment for shortsNoneOptional: only show short setups when sentiment is Neutral or Bearish

Feature 2 — Minimum R/R Filter (1:2)
What it is
A hard arithmetic gate applied after the AI generates setup levels. If the math doesn't support at least 2x reward for every 1x risk, the setup is discarded before it is stored or shown. Not ranked lower. Not flagged with a warning. Discarded entirely.
This gate runs silently. The user never sees setups that failed it — they only see setups that passed. Every entry in the Track Record is therefore guaranteed to have been mathematically viable at the time it was generated.

Calculation
Run after the AI returns entry, stop, and target. Before storing the setup:
For LONG setups:
rr_ratio = (entry - target) / (stop - entry)

Example: entry $375, target $347, stop $388
rr_ratio = (375 - 347) / (388 - 375)
= 28 / 13
= 2.15 ✓ passes
For SHORT setups:
rr_ratio = (target - entry) / (entry - stop)

Example: entry $380, target $347, stop $390
rr_ratio = (380 - 347) / (390 - 380)
= 33 / 10
= 3.3 ✓ passes
if rr_ratio < 2.0 → discard setup entirely, do not store, do not display
Store the calculated rr_ratio on every setup that passes:
rr_ratio: 2.15

UI — R/R badge on every card
Every setup card shows the R/R ratio as a badge in the card header, next to the confidence %:

R/R >= 3.0 → green badge: R/R 3.2:1
R/R 2.0 to 2.9 → default gray badge: R/R 2.4:1

Badge style: same pill style as signal tags — font-size: 11px; padding: 2px 8px; border-radius: 4px
Since every displayed setup passed the 1:2 minimum, the badge always shows a number >= 2.0. No red or warning state is needed — the user never sees a sub-2.0 R/R.

UI — Updated scan summary line
The scan summary currently reads:
309 stocks scanned · 50 setups found
Update to:
309 stocks scanned · 50 setups found · 38 shown (R/R ≥ 1:2)
This makes the filter visible and builds trust. The user understands that 12 setups were found but discarded because the math didn't work — they aren't missing anything worth seeing.

Settings — user controls
Add an R/R threshold setting so users with different styles can adjust:
SettingDefaultRangeDescriptionMinimum R/R ratio2.01.5 to 4.0Setups below this threshold are discarded
Step size: 0.5. Display as "1:2", "1:2.5", "1:3" etc. in the UI — not as a decimal.
When the user changes the threshold, re-run the filter on the existing scan results immediately (no re-scan needed — the AI output is already stored, just re-apply the gate).

How the two features interact
Sentiment and R/R are independent gates. A setup must pass both:
Setup generated by AI
|
v
R/R check: rr_ratio >= 2.0?
|── No → discard
|── Yes → continue
|
v
Sentiment suppression (Top Picks only): direction aligned with market?
|── No → show in All Setups only, not Top Picks
|── Yes → show in both Top Picks and All Setups
A short setup with R/R 3.1 in a Bullish market passes the R/R gate but is suppressed from Top Picks. It is still visible in All Setups. The user can still act on it — it just doesn't get promoted as a top recommendation.
A long setup with R/R 1.7 in a Bullish market fails the R/R gate regardless of sentiment. It is discarded entirely.

Impact on Track Record
Both features quietly improve the Track Record's reliability without any Track Record UI changes needed at this stage:

R/R gate — every historical entry had rr_ratio >= 2.0. Expectancy calculations are meaningful because no setup with negative expected value was ever included.
Sentiment recording — future Track Record slice: filter history by market_sentiment to see how the AI's setups perform in different market conditions. This becomes a powerful self-improvement loop for the user.
