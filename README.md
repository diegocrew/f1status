# f1status

A real-time Formula 1 season tracker that displays driver and constructor championship standings, sourced from OpenF1 and cross-checked against the Jolpica/Ergast API.

## Features

- **Live Championship Standing**: Real-time driver and constructor points (updated via Ergast API)
- **Sprint Race Tracking**: Separate columns for sprint races (awarding 8, 7, 6 points for top 3)
- **Race Results Grid**: Visual grid showing all race results with color-coded podium positions
- **Form Rating**: Last 5 races form analysis (0-100 scale with color gradient)
- **Season Projection**: Average of last 3 races projected across remaining races
- **DNF/DNS Tracking**: Clearly marked retirements and non-starts
- **Constructor Sidebar**: Constructor championship standings with theoretical maximum points
- **Season history**: Browse 2025–1980 results from the History seasons menu; historical seasons show final points without max, projection, or form
- **Team history**: The Teams button opens a 1980–2026 timeline of names, engine suppliers, new entries, returns, and final seasons, with notes explaining acquisitions and separate teams sharing a brand
- **Responsive Design**: Clean, modern UI with sticky headers and horizontal scrolling

## Data Source

The fetcher uses two APIs:

- **Primary — OpenF1** (https://api.openf1.org/v1): exposes per-driver `points` plus explicit
  `dnf` / `dns` / `dsq` booleans, so retirements and non-starts can never silently render as
  blank cells.
- **Cross-check — Jolpica/Ergast** (https://api.jolpi.ca/ergast/f1): the fetcher compares its
  OpenF1-derived results against Jolpica and prints any discrepancy. It is **reporting only** —
  it never overwrites the data.

The 1980–2023 archives use Jolpica directly because OpenF1 has no or incomplete historical
results for those seasons. The archive uses the points awarded in each season's actual
scoring system. It also stores each driver's finishing position (`race_position`), so podium
colours stay correct even when historical points differ from the modern system.

For 1980–1999, totals and ordering come from Jolpica's final championship standings
rather than summing race points. This preserves dropped-score rules (for example,
Senna's 90 versus Prost's 87 counted points in 1988), constructor penalties, and
championship exclusions. Schumacher's 78 race points in 1997 remain visible with a
DSQ label; he is not ranked second in the championship. Race cells retain the
individual awards, including half points at Monaco 1984 and Australia 1991.
The standard race awards were 9–6–4–3–2–1 in 1980–1990 and 10–6–4–3–2–1 in
1991–2002. A total's tooltip explains any difference from the sum of race points.
The fetcher corrects Jolpica's missing 1995 Brazilian GP constructor-only fuel
penalties to the documented final totals (Benetton 137, Williams 112); driver
race points are unchanged.
It also preserves Brazil 1983's vacant second place after Rosberg's exclusion:
Lauda remains third (bronze), rather than being incorrectly colored silver.

The fetcher also:
- Detects sprint weekends (meeting has a `Sprint` session)
- Handles mid-season driver transfers (team refreshed each round)
- Marks cancelled races — a past Grand Prix with no race classification (e.g. the 2026 Bahrain
  and Saudi Arabian GPs) is flagged `cancelled` and shown as a `cnc` column

Run `python scripts/fetch_data.py 2026` to regenerate the current season, or specify past years
such as `python scripts/fetch_data.py 2025 2024 2023 2022 2021 2020` to generate dedicated
data files. Seasons 1980–2023 use Jolpica for complete historical results.
Add `--no-check` to skip the Jolpica cross-check.

### Team lineage data

The Teams view uses the curated `data/teams.json`, independently of race results.
Each lineage has inclusive `[first year, last year, label]` periods for names and
engine suppliers, plus its first entry and optional final season. Sponsor-only
changes are included; labels are representative, not a race-by-race sponsor archive.
Sources are linked in the Teams view.

Rows follow continuing team operations, with legal-entry exceptions explained in
the notes (notably Andrea Moda in 1992 and Force India in 2018). Breaks in participation
remain blank (for example, Brabham in 1988); a return is marked separately. Attempted
entries are included, such as Life in 1990 and MasterCard Lola in 1997, even when
neither qualified for a race. Original Renault, Lotus, Alfa Romeo, and Haas-Lola
operations are separate from later teams reusing their names. Unrelated teams are not joined merely
because they shared the Lotus name, bought old assets, or occupied the same row
in a source table. Update the coverage range and periods together when adding a year.

## Project Structure

```
f1status/
├── index.html           # Main HTML file with styling
├── app.js               # Frontend logic for data processing & rendering
├── teams.js             # Team lineage timeline rendering
├── data/
│   ├── .gitkeep
│   ├── teams.json       # Curated team names, engines, and lineage notes
│   ├── 1980.json … 2019.json  # Historical season data
│   ├── 2020.json        # Historical season data
│   ├── 2021.json        # Historical season data
│   ├── 2022.json        # Historical season data
│   ├── 2023.json        # Historical season data
│   ├── 2024.json        # Historical season data
│   ├── 2025.json        # Historical season data
│   └── 2026.json        # Current season data (auto-generated)
├── scripts/
│   └── fetch_data.py    # Fetches from OpenF1 (primary) + cross-checks vs Jolpica
├── .github/            # GitHub Pages deployment config
└── README.md           # This file
```

## Display Legend

### Points Display
- **Podium (1st, 2nd, 3rd)**: Color-coded green, silver, bronze by finishing position, independent of the season's points system
  - 2019–2024 fastest-lap bonus: 26, 19, 16 are still 1st/2nd/3rd and keep podium colours
- **Points**: Display each season's actual awarded points (2019–2024 fastest-lap bonus applies where relevant)
- **DNF (Did Not Finish)**: Red text - driver retired during the race
- **DNS (Did Not Start)**: Gray text - driver didn't participate
- **DNQ (Did Not Qualify)**: Brown text - driver failed qualification or pre-qualification
- **Blank cell**: No points scored but completed the race

### Sprint Races
- Top 3: 8, 7, 6 points (same color-coding as race podiums)
- 4th-8th: Standard display

### Columns
- **Form**: 0-100 scale based on last 5 completed races
  - Green (76-100): Excellent form
  - Blue (51-75): Good form
  - Amber (26-50): Struggling
  - Red (0-25): Poor form
- **Proj**: Projected final season points based on last 3 race average

## Data Accuracy

Results come from OpenF1 and are cross-checked against Jolpica/Ergast. Note:
- DNF/DNS come straight from OpenF1's `dnf`/`dns` flags; `dsq` is treated as a non-finish
- Blank/finished-without-points cells mean the driver completed the race outside the points
- 1980–1999 constructor totals use final standings to preserve penalties and scoring eligibility;
  later seasons sum team points by round.   Theoretical maximum assumes a 1-2 finish
    for each team (25+18 per race, 8+7 per sprint), so substitute appearances do not add a third seat.
- A cancelled race is a past Grand Prix that has no race classification in OpenF1

## Technical Details

### Key JavaScript Functions
- `processData()`: Transforms raw API JSON into frontend-ready format
- `buildDriverTable()`: Creates the main standings table with all race results
- `buildConstructors()`: Generates constructor championship sidebar
- `buildTeams()`: Renders the curated team lineage and engine timeline
- `computeForm()`: Calculates form rating (0-100) for last 5 races
- `fetch_season()` / `cross_check()`: Python functions that build the dataset from OpenF1 and validate it against Jolpica

### Performance
- Sticky headers for navigation (first 2 columns and top 2 rows)
- Virtual scrolling-friendly table structure
- Minimal re-rendering on year selection

### Validation

Run `python -m unittest scripts.test_historical_data` for historical archive,
scoring, lineage-coverage, and fetcher pagination/standings regression checks.