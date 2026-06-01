# f1status

A real-time Formula 1 season tracker that displays driver and constructor championship standings with live updates from the Ergast API.

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

Data fetched from the **Ergast API** (via Jolpica wrapper) at https://api.jolpi.ca/ergast/f1

- Fetches official F1 race results, sprint results, and schedules
- Automatically detects sprint weekends
- Handles mid-season driver transfers
- Tracks cancelled races with 3-day API lag tolerance

## Project Structure

```
f1status/
├── index.html           # Main HTML file with styling
├── app.js               # Frontend logic for data processing & rendering
├── data/
│   ├── 2026.json       # Season data (auto-generated)
│   └── .gitkeep
├── scripts/
│   └── fetch_data.py    # Fetches season data from Ergast API
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

The app relies on official Ergast API data. Note:
- DNF/DNS statuses are normalized from various race status descriptions
- Blank/finished normally statuses are treated as completed without points
- Constructor standings are calculated by summing both drivers' points
- Cancelled races are detected via 3-day API lag (races that should have data but don't get marked as cancelled after 3 days)

## Technical Details

### Key JavaScript Functions
- `processData()`: Transforms raw API JSON into frontend-ready format
- `buildDriverTable()`: Creates the main standings table with all race results
- `buildConstructors()`: Generates constructor championship sidebar
- `computeForm()`: Calculates form rating (0-100) for last 5 races
- `normalize_status()`: Python function that standardizes race status descriptions

### Performance
- Sticky headers for navigation (first 2 columns and top 2 rows)
- Virtual scrolling-friendly table structure
- Minimal re-rendering on year selection