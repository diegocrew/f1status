"""
Fetches F1 season data from the Jolpica/Ergast API and writes
processed JSON files to data/{year}.json for the GitHub Pages frontend.

Usage:
    python scripts/fetch_data.py            # current year
    python scripts/fetch_data.py 2025 2026  # specific years
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta

import requests

BASE = "https://api.jolpi.ca/ergast/f1"

RACE_CODES = {
    "Australian Grand Prix": "AUS",
    "Chinese Grand Prix": "CHN",
    "Japanese Grand Prix": "JPN",
    "Bahrain Grand Prix": "BHR",
    "Saudi Arabian Grand Prix": "SAU",
    "Miami Grand Prix": "MIA",
    "Emilia Romagna Grand Prix": "IML",
    "Monaco Grand Prix": "MON",
    "Spanish Grand Prix": "ESP",
    "Canadian Grand Prix": "CAN",
    "Austrian Grand Prix": "AUT",
    "British Grand Prix": "GBR",
    "Belgian Grand Prix": "BEL",
    "Hungarian Grand Prix": "HUN",
    "Dutch Grand Prix": "NTL",
    "Italian Grand Prix": "ITA",
    "Azerbaijan Grand Prix": "AZB",
    "Singapore Grand Prix": "SIN",
    "United States Grand Prix": "USA",
    "Mexico City Grand Prix": "MEX",
    "São Paulo Grand Prix": "BRZ",
    "Las Vegas Grand Prix": "LV",
    "Qatar Grand Prix": "QAT",
    "Abu Dhabi Grand Prix": "ABU",
}


def get(path: str, **params) -> dict:
    url = f"{BASE}/{path}"
    params.setdefault("limit", 1000)
    r = requests.get(url, params=params, timeout=30)
    r.raise_for_status()
    return r.json()["MRData"]


def race_code(race: dict) -> str:
    return RACE_CODES.get(race["raceName"],
                          race["Circuit"]["Location"]["country"][:3].upper())


def is_sprint_weekend(race: dict) -> bool:
    return "SprintRace" in race or "SprintQualifying" in race or "Sprint" in race


_DNF_KEYWORDS = (
    "retired", "accident", "collision", "engine", "gearbox", "hydraulics",
    "suspension", "brakes", "electrical", "power unit", "mechanical",
    "overheating", "oil", "fire", "damage", "tyre", "driveshaft",
    "throttle", "fuel", "disqualified",
)

def normalize_status(status: str) -> str:
    s = status.strip()
    # Blank / finished normally / lapped / not classified (started but lapped heavily)
    if not s or s == "Finished" or s.startswith("+") or "not classified" in s.lower():
        return ""
    sl = s.lower()
    # Did not start
    if sl == "dns" or any(x in sl for x in ("not start", "not qualif", "withdrew")):
        return "DNS"
    # Explicit retirement reasons → DNF
    if sl in ("dnf", "retired") or any(x in sl for x in _DNF_KEYWORDS):
        return "DNF"
    # Unknown / ambiguous status → show blank, don't assume DNF
    return ""


def fetch_season(year: int) -> dict:
    print(f"  fetching schedule …")
    sched = get(f"{year}.json")["RaceTable"]["Races"]

    print(f"  fetching race results …")
    res_races = get(f"{year}/results.json")["RaceTable"]["Races"]

    print(f"  fetching sprint results …")
    try:
        spr_races = get(f"{year}/sprint.json")["RaceTable"]["Races"]
    except requests.HTTPError:
        spr_races = []

    # ── index results by round ──────────────────────────────────────────────
    race_results: dict[int, list] = {}
    for r in res_races:
        race_results[int(r["round"])] = r.get("Results", [])

    sprint_results: dict[int, list] = {}
    for s in spr_races:
        sprint_results[int(s["round"])] = s.get("SprintResults", [])

    # ── determine sprint rounds (completed + scheduled) ────────────────────
    sprint_round_set: set[int] = set(
        rnd for rnd, lst in sprint_results.items() if lst
    )
    for race in sched:
        if is_sprint_weekend(race):
            sprint_round_set.add(int(race["round"]))

    # ── completed / cancelled detection ────────────────────────────────────
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=3)   # allow 3-day API lag before marking cancelled

    completed_rounds: set[int] = set(
        rnd for rnd, lst in race_results.items() if lst
    )
    completed_sprint_rounds: set[int] = set(
        rnd for rnd, lst in sprint_results.items() if lst
    )

    cancelled_rounds: set[int] = set()
    for race in sched:
        rnd = int(race["round"])
        race_date = datetime.fromisoformat(race["date"]).replace(tzinfo=timezone.utc)
        if race_date < cutoff and rnd not in completed_rounds:
            cancelled_rounds.add(rnd)

    future_races = [
        r for r in sched
        if int(r["round"]) not in completed_rounds
        and int(r["round"]) not in cancelled_rounds
    ]
    future_sprint_rounds = [
        rnd for rnd in sprint_round_set
        if rnd not in completed_sprint_rounds
        and rnd not in cancelled_rounds
    ]

    # ── collect drivers ─────────────────────────────────────────────────────
    drivers: dict[str, dict] = {}

    def upsert(driver_id: str, driver_obj: dict, constructor_obj: dict):
        if driver_id not in drivers:
            drivers[driver_id] = {
                "id": driver_id,
                "family_name": driver_obj["familyName"],
                "given_name": driver_obj["givenName"],
                "constructor_id": constructor_obj["constructorId"],
                "constructor_name": constructor_obj["name"],
                "race_points": {},
                "race_status": {},
                "sprint_points": {},
            }
        # update constructor (handles mid-season swaps)
        drivers[driver_id]["constructor_id"] = constructor_obj["constructorId"]
        drivers[driver_id]["constructor_name"] = constructor_obj["name"]

    for rnd, results in race_results.items():
        for r in results:
            did = r["Driver"]["driverId"]
            upsert(did, r["Driver"], r["Constructor"])
            pts = float(r.get("points", 0))
            drivers[did]["race_points"][rnd] = pts
            st = normalize_status(r.get("status", ""))
            # Can't score points and also DNF/DNS — API data sometimes inconsistent
            drivers[did]["race_status"][rnd] = "" if (pts > 0 and st) else st

    for rnd, results in sprint_results.items():
        for r in results:
            did = r["Driver"]["driverId"]
            upsert(did, r["Driver"], r["Constructor"])
            drivers[did]["sprint_points"][rnd] = float(r.get("points", 0))

    # ── totals ──────────────────────────────────────────────────────────────
    future_race_pts = len(future_races) * 25
    future_sprint_pts = len(future_sprint_rounds) * 8

    for d in drivers.values():
        d["total"] = (
            sum(d["race_points"].values()) +
            sum(d["sprint_points"].values())
        )
        d["possible"] = d["total"] + future_race_pts + future_sprint_pts
        # convert keys to strings for JSON
        d["race_points"]   = {str(k): v for k, v in d["race_points"].items()}
        d["race_status"]   = {str(k): v for k, v in d["race_status"].items()}
        d["sprint_points"] = {str(k): v for k, v in d["sprint_points"].items()}

    # ── races list for frontend ─────────────────────────────────────────────
    races_out = [
        {
            "round": int(r["round"]),
            "name": r["raceName"],
            "code": race_code(r),
            "date": r["date"],
            "is_sprint_weekend": int(r["round"]) in sprint_round_set,
            "completed": int(r["round"]) in completed_rounds,
            "cancelled": int(r["round"]) in cancelled_rounds,
        }
        for r in sched
    ]

    return {
        "year": year,
        "fetched_at": now.isoformat(),
        "races": races_out,
        "sprint_rounds": sorted(sprint_round_set),
        "completed_rounds": sorted(completed_rounds),
        "completed_sprint_rounds": sorted(completed_sprint_rounds),
        "cancelled_rounds": sorted(cancelled_rounds),
        "drivers": sorted(drivers.values(), key=lambda d: -d["total"]),
    }


def main():
    years = [int(y) for y in sys.argv[1:]] if len(sys.argv) > 1 else [datetime.now().year]

    os.makedirs("data", exist_ok=True)

    for year in years:
        print(f"Processing {year} …")
        data = fetch_season(year)
        path = os.path.join("data", f"{year}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  → saved {path}  ({len(data['drivers'])} drivers, {len(data['races'])} races)")


if __name__ == "__main__":
    main()
