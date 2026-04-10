Overview
A hot sector widget sits between the page headline and the Top Picks cards. It gives the user a 5-second market orientation before they evaluate individual setups — answering "where is the market's energy concentrated right now?" before showing the best individual ideas.
The widget is context, not a filter. Top Picks ranking is never influenced by sector. If today's #1 setup is in healthcare during an energy-led market, it stays #1. The sector widget simply adds conviction when setups happen to align with the leading sector, and raises awareness when they don't.

Page layout — where the widget lives
[Nav bar]

[Hero: "Top Breakout Stocks of the Day"]
[Subtitle + scan stats]

────────────────────────────────────────
HOT SECTOR WIDGET ← inserted here
────────────────────────────────────────

[Top Picks cards: COP · PAA · ARM]

[All Setups list]
The widget sits directly above the Top Picks cards. It is not a full-width section — it reads as a slim contextual banner, not a competing feature.

Feature 1 — Sector scoring
What makes a sector "hot"
Do not rank by single-day performance — that is noisy and can be driven by one large-cap stock moving. A sector is genuinely hot when it shows sustained, broad, institutionally-backed outperformance. Measure three signals:
Signal 1 — Relative strength vs SPY
rs_5d = (sector_etf_return_5d - spy_return_5d)
rs_20d = (sector_etf_return_20d - spy_return_20d)

rs_score = (rs_5d _ 0.6) + (rs_20d _ 0.4)
Weight the 5-day more heavily — recent momentum matters more than the 20-day trend for setup timing. But include the 20-day to filter out one-day spikes.
Signal 2 — Breadth
breadth = percentage of stocks in sector trading above their 50-day MA

breadth_score:

> = 65% → +2
> 50–64% → +1
> 35–49% → 0
> < 35% → -1
> Breadth confirms the move is broad, not driven by one or two mega-caps carrying the ETF.
> Signal 3 — Volume expansion
> volume_ratio = sector_etf_volume_today / sector_etf_20d_avg_volume

volume_score:

> = 1.5x → +2
> 1.2–1.5x → +1
> 0.8–1.2x → 0
> < 0.8x → -1
> Volume expansion signals institutional participation — the move has conviction behind it.
> Final sector score
> sector_score = (rs_score \* 5) + breadth_score + volume_score
> rs_score is the dominant signal — relative strength is the most predictive of continuation. Breadth and volume are confirmation signals that add or subtract from it.
> Run this for all 11 GICS sectors using their standard ETFs:
> SectorETFEnergyXLETechnologyXLKFinancialsXLFHealthcareXLVIndustrialsXLIConsumer DiscretionaryXLYConsumer StaplesXLPMaterialsXLBUtilitiesXLUReal EstateXLRECommunication ServicesXLC
> Sort by sector_score descending. Surface the top 1 sector as the primary hot sector. If the top two sectors are within 10% of each other in score, show both.
> Minimum threshold to show "hot"
> Only show a sector as "hot" if its rs_5d is positive (it is actually outperforming SPY, not just the least-bad sector). If no sector clears this bar — rare, but possible in broad market sell-offs — show a neutral state: "No clear leading sector today."

Feature 2 — Hot stocks from the sector
Source
Pull directly from today's screener results. Do not run a separate stock scan. Any setup that already passed the screener pipeline (technical filters + AI scoring + R/R gate) and belongs to the hot sector is a hot sector stock.
Selection logic
hot_sector_setups = [
setup for setup in todays_screener_results
if setup.sector == hot_sector
]

sort by setup.score descending
take top 3
If fewer than 3 screener results belong to the hot sector, show however many there are. If zero screener results belong to the hot sector, show the sector data but note "No setups in this sector today" — do not manufacture stocks that didn't pass the screener.
What to display per stock
[Ticker] [Pattern type badge] [Score] [→ Analyze]
Minimal — these stocks are already visible in the full Top Picks and All Setups lists below. The widget is a spotlight, not a duplicate card view.

UI spec
Widget container
background: var(--color-background-secondary)
border: 0.5px solid var(--color-border-tertiary)
border-radius: var(--border-radius-lg)
padding: 1rem 1.5rem
margin-bottom: 1.5rem
Layout — two columns
Left column (60%): Sector identity and stats
Right column (40%): Top setups from the sector
┌─────────────────────────────────────────────────────────┐
│ HOT SECTOR │
│ │
│ ⚡ Energy │ Top setups today │
│ XLE +4.2% vs SPY · 5d │ │
│ 72% stocks above 50MA │ COP Momentum 83 → │
│ Volume 1.6× average │ PAA SMA Bounce 79 → │
│ │ FANG SMA Bounce 72 → │
└─────────────────────────────────────────────────────────┘
Sector name + icon
Use a small colored icon or emoji per sector to aid quick visual recognition:

Energy → flame icon or amber color
Technology → circuit/chip icon or blue color
Financials → chart icon or green color
Healthcare → cross icon or teal color
etc.

Sector name: 20px, weight 500, var(--color-text-primary)
Stats line
Three stats displayed as a single muted line below the sector name:
font-size: 13px
color: var(--color-text-secondary)

"XLE +4.2% vs SPY · 5d · 72% above 50MA · Vol 1.6×"
The relative strength number is colored:

Positive → #3B6D11 (green)
Negative → #A32D2D (red)

Divider between columns
border-left: 0.5px solid var(--color-border-tertiary) on the right column, with padding-left: 1.25rem
Setup rows (right column)
Each row:
[Ticker 13px 500] [pattern badge] [score number amber/green] [→ link]

height: 28px per row
gap between rows: 4px
Clicking the → navigates to Chart Analysis with that stock loaded. Same behavior as "Analyze Chart" on the main cards.
Two hot sectors state
When two sectors are within 10% of each other in score, show both in a tab toggle inside the widget:
[ Energy ✓ ] [ Technology ]
Clicking switches the left column content and the right column setups. No page reload.
No clear leader state
When no sector has positive relative strength vs SPY:
background: #F1EFE8
text: "No clear leading sector today — broad market conditions are mixed"
No stocks shown. Widget is slim — single line. This state is honest and useful: it tells the user the market is not in a trending environment and to be more selective.
Loading state
On scan, show skeleton placeholders:

Sector name: gray bar 120px wide
Stats line: gray bar 260px wide
Each setup row: gray bar full width
Fade in when data is ready.

Data refresh
The sector widget refreshes on the same cadence as the screener scan:

On every manual "Rescan" click
On scheduled daily scan (pre-market or market open)
Not on page reload if the scan data is less than 60 minutes old

Show the same "Updated Xh ago" timestamp that appears on the main scan summary.

What NOT to show

Do not show sector performance in isolation (e.g. "XLE up 1.2% today") — this is meaningless without context vs SPY
Do not show more than 3 stocks in the widget — it becomes a duplicate of the screener
Do not rank the hot sector's stocks separately from the main screener — the scores shown in the widget are the same scores from the main pipeline, not a re-ranking
Do not show the widget if the scan has not run yet today — show a prompt to scan instead

Future extension — Sector rotation view
Once the sector scoring is live, a natural next feature is a sector rotation heatmap — a simple grid showing all 11 sectors ranked by score with color intensity. This would live in its own tab or as an expandable panel, not on the homepage. The scoring infrastructure built for the hot sector widget supports this with no changes.
