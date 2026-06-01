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
- **Responsive Design**: Clean, modern UI with sticky headers and horizontal scrolling

## Data Source

Two independent APIs are used so results can be cross-validated:

- **Primary — OpenF1** (https://api.openf1.org/v1): exposes per-driver `points` plus explicit
  `dnf` / `dns` / `dsq` booleans, so retirements and non-starts can never silently render as
  blank cells.
- **Cross-check — Jolpica/Ergast** (https://api.jolpi.ca/ergast/f1): the fetcher compares its
  OpenF1-derived results against Jolpica and prints any discrepancy. It is **reporting only** —
  it never overwrites the data.

The fetcher also:
- Detects sprint weekends (meeting has a `Sprint` session)
- Handles mid-season driver transfers (team refreshed each round)
- Marks cancelled races — a past Grand Prix with no race classification (e.g. the 2026 Bahrain
  and Saudi Arabian GPs) is flagged `cancelled` and shown as a `cnc` column

Run `python scripts/fetch_data.py 2026` to regenerate; add `--no-check` to skip the Jolpica
cross-check.

## Project Structure

```
f1status/
├── index.html           # Main HTML file with styling
├── app.js               # Frontend logic for data processing & rendering
├── data/
│   ├── 2026.json       # Season data (auto-generated)
│   └── .gitkeep
├── scripts/
│   └── fetch_data.py    # Fetches from OpenF1 (primary) + cross-checks vs Jolpica
├── .github/            # GitHub Pages deployment config
└── README.md           # This file
```

## Display Legend

### Points Display
- **Podium (1st, 2nd, 3rd)**: 25, 18, 15 points - Color-coded green, silver, bronze
- **Points (4th-10th)**: 12, 10, 8, 6, 4, 2, 1 points - Standard display
- **DNF (Did Not Finish)**: Red text - driver retired during the race
- **DNS (Did Not Start)**: Gray text - driver didn't participate
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
- Constructor standings are calculated by summing both drivers' points
- A cancelled race is a past Grand Prix that has no race classification in OpenF1

## Technical Details

### Key JavaScript Functions
- `processData()`: Transforms raw API JSON into frontend-ready format
- `buildDriverTable()`: Creates the main standings table with all race results
- `buildConstructors()`: Generates constructor championship sidebar
- `computeForm()`: Calculates form rating (0-100) for last 5 races
- `fetch_season()` / `cross_check()`: Python functions that build the dataset from OpenF1 and validate it against Jolpica

### Performance
- Sticky headers for navigation (first 2 columns and top 2 rows)
- Virtual scrolling-friendly table structure
- Minimal re-rendering on year selection