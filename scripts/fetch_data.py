"""
Fetches F1 season data and writes processed JSON to data/{year}.json for the
GitHub Pages frontend.

PRIMARY source : OpenF1   (https://api.openf1.org/v1)  — explicit points + dnf/dns/dsq flags
CROSS-CHECK    : Jolpica   (https://api.jolpi.ca/ergast/f1) — Ergast-compatible, used only to
                 validate OpenF1 and warn on discrepancies. Never overwrites the data.

Why OpenF1 is primary: it exposes per-driver `points`, `dnf`, `dns`, `dsq` booleans directly,
so retirements/non-starts can't silently render as blanks (the failure mode we hit when a
partial Jolpica snapshot dropped 9 round-5 drivers entirely).

Usage:
    python scripts/fetch_data.py                 # current year
    python scripts/fetch_data.py 2026            # specific year(s)
    python scripts/fetch_data.py 2026 --no-check # skip the Jolpica cross-check
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

OPENF1 = "https://api.openf1.org/v1"
JOLPICA = "https://api.jolpi.ca/ergast/f1"

# 3-letter column codes keyed by OpenF1 meeting_name. Falls back to country[:3].
RACE_CODES = {
    "Australian Grand Prix": "AUS",
    "Chinese Grand Prix": "CHN",
    "Japanese Grand Prix": "JPN",
    "Bahrain Grand Prix": "BHR",
    "Saudi Arabian Grand Prix": "SAU",
    "Miami Grand Prix": "MIA",
    "Canadian Grand Prix": "CAN",
    "Monaco Grand Prix": "MON",
    "Barcelona Grand Prix": "SPA",
    "Austrian Grand Prix": "AUT",
    "British Grand Prix": "GBR",
    "Belgian Grand Prix": "BEL",
    "Hungarian Grand Prix": "HUN",
    "Dutch Grand Prix": "NTL",
    "Italian Grand Prix": "ITA",
    "Spanish Grand Prix": "ESP",
    "Azerbaijan Grand Prix": "AZB",
    "Singapore Grand Prix": "SIN",
    "United States Grand Prix": "USA",
    "Mexico City Grand Prix": "MEX",
    "São Paulo Grand Prix": "BRA",
    "Las Vegas Grand Prix": "LV",
    "Qatar Grand Prix": "QAT",
    "Abu Dhabi Grand Prix": "ABU",
}


# ── HTTP ───────────────────────────────────────────────────────────────────────

def _get(url: str, params: dict | None = None, *, retries: int = 4,
         timeout: int = 20) -> list | dict | None:
    """GET JSON with simple backoff. Returns None on a 404 (e.g. no result yet)."""
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params or {}, timeout=timeout)
            if r.status_code == 404:
                return None
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(1.5 * (attempt + 1))
                continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
    return None


def of1(path: str, **params):
    return _get(f"{OPENF1}/{path}", params) or []


# ── helpers ─────────────────────────────────────────────────────────────────────

def race_code(meeting_name: str, country: str) -> str:
    return RACE_CODES.get(meeting_name, (country or "???")[:3].upper())


def split_name(full_name: str) -> tuple[str, str]:
    """OpenF1 full_name is 'Given LAST'. Returns (given, Family)."""
    parts = (full_name or "").split()
    if not parts:
        return "", ""
    family = parts[-1].capitalize()
    given = " ".join(parts[:-1]) or family
    return given, family


def constructor_id(team_name: str) -> str:
    # teamKey() in app.js matches on substrings like 'red_bull', 'racing_bulls',
    # 'aston', 'haas', so underscored lowercase team names resolve correctly.
    return (team_name or "").lower().replace(" ", "_")


def status_from_flags(row: dict) -> str:
    if row.get("dns"):
        return "DNS"
    if row.get("dnf"):
        return "DNF"
    if row.get("dsq"):
        return "DNF"  # frontend has no DSQ style; treat as a non-finish
    return ""


# ── fetch one season from OpenF1 ─────────────────────────────────────────────────

def fetch_season(year: int) -> dict:
    now = datetime.now(timezone.utc)

    print("  fetching meetings + sessions …")
    meetings = of1("meetings", year=year)
    sessions = of1("sessions", year=year)

    # Drop pre-season testing; keep actual Grands Prix, ordered chronologically.
    gp = sorted(
        (m for m in meetings if "grand prix" in m["meeting_name"].lower()),
        key=lambda m: m["date_start"],
    )

    # Index sessions by meeting_key → {session_name: session}
    sess_by_meeting: dict[int, dict[str, dict]] = {}
    for s in sessions:
        sess_by_meeting.setdefault(s["meeting_key"], {})[s["session_name"]] = s

    races_out: list[dict] = []
    drivers: dict[int, dict] = {}        # keyed by driver_number
    completed_rounds, completed_sprint_rounds, cancelled_rounds = [], [], []
    sprint_rounds: list[int] = []

    def upsert(num: int, info: dict):
        given, family = split_name(info.get("full_name", ""))
        if num not in drivers:
            drivers[num] = {
                "id": (info.get("name_acronym") or family).lower(),
                "family_name": family,
                "given_name": given,
                "constructor_id": constructor_id(info.get("team_name", "")),
                "constructor_name": info.get("team_name", ""),
                "race_points": {}, "race_status": {}, "sprint_points": {},
                "_num": num,
            }
        # refresh team each round (handles mid-season swaps)
        drivers[num]["constructor_id"] = constructor_id(info.get("team_name", ""))
        drivers[num]["constructor_name"] = info.get("team_name", "")

    today = now.date().isoformat()
    for rnd, m in enumerate(gp, start=1):
        mk = m["meeting_key"]
        msessions = sess_by_meeting.get(mk, {})
        race_sess = msessions.get("Race")
        sprint_sess = msessions.get("Sprint")
        is_sprint = sprint_sess is not None
        race_date = (race_sess or m)["date_start"][:10]

        # OpenF1 flags cancelled meetings directly (e.g. Bahrain/Saudi 2026) —
        # trust that over inferring cancellation from an empty results fetch,
        # which can't tell "actually cancelled" apart from "API call failed".
        cancelled = bool(m.get("is_cancelled"))

        # Future weekends have no results yet — skip their per-session API calls
        # entirely (this is most of the calendar, and the bulk of the runtime).
        # Fetch today's race too, so same-day results are picked up immediately.
        should_fetch = race_date <= today and not cancelled
        roster, race_results = {}, []
        if should_fetch:
            roster = {d["driver_number"]: d for d in of1("drivers", meeting_key=mk)}
            if race_sess:
                race_results = of1("session_result", session_key=race_sess["session_key"])

        completed = bool(race_results)

        if completed:
            completed_rounds.append(rnd)
            for row in race_results:
                num = row["driver_number"]
                if num in roster:
                    upsert(num, roster[num])
                if num not in drivers:        # roster miss → minimal stub
                    upsert(num, {"full_name": f"#{num}", "team_name": ""})
                drivers[num]["race_points"][str(rnd)] = float(row.get("points") or 0)
                drivers[num]["race_status"][str(rnd)] = status_from_flags(row)
        elif cancelled:
            cancelled_rounds.append(rnd)

        if is_sprint:
            sprint_rounds.append(rnd)
            sprint_results = (of1("session_result", session_key=sprint_sess["session_key"])
                              if should_fetch else [])
            if sprint_results:
                completed_sprint_rounds.append(rnd)
                for row in sprint_results:
                    num = row["driver_number"]
                    if num in roster:
                        upsert(num, roster[num])
                    if num in drivers:
                        drivers[num]["sprint_points"][str(rnd)] = float(row.get("points") or 0)

        races_out.append({
            "round": rnd,
            "name": m["meeting_name"],
            "code": race_code(m["meeting_name"], m.get("country_name", "")),
            "date": race_date,
            "is_sprint_weekend": is_sprint,
            "completed": completed,
            "cancelled": cancelled,
        })

    # ── totals + theoretical max ────────────────────────────────────────────────
    future_races = sum(1 for r in races_out if not r["completed"] and not r["cancelled"])
    future_sprints = sum(
        1 for rnd in sprint_rounds
        if rnd not in completed_sprint_rounds and rnd not in cancelled_rounds
    )
    max_per_driver = future_races * 25 + future_sprints * 8

    for d in drivers.values():
        d["total"] = sum(d["race_points"].values()) + sum(d["sprint_points"].values())
        d["possible"] = d["total"] + max_per_driver
        d.pop("_num", None)

    return {
        "year": year,
        "fetched_at": now.isoformat(),
        "source": "openf1",
        "races": races_out,
        "sprint_rounds": sorted(sprint_rounds),
        "completed_rounds": sorted(completed_rounds),
        "completed_sprint_rounds": sorted(completed_sprint_rounds),
        "cancelled_rounds": sorted(cancelled_rounds),
        "drivers": sorted(drivers.values(), key=lambda d: -d["total"]),
    }


# ── cross-check against Jolpica ──────────────────────────────────────────────────

def cross_check(year: int, data: dict) -> None:
    """Compare OpenF1-derived results against Jolpica. Reports only; never mutates."""
    print("  cross-checking against Jolpica …")
    try:
        # Fail fast: Jolpica is only an optional validator, so don't let a dead
        # host stall the run (one short attempt, not 4×20s of retries).
        mr = _get(f"{JOLPICA}/{year}/results.json", {"limit": 2000},
                  retries=1, timeout=12)
        if not mr:
            print("  ! Jolpica returned no data — skipping cross-check")
            return
        jraces = mr["MRData"]["RaceTable"]["Races"]
    except requests.RequestException as e:
        print(f"  ! Jolpica unreachable ({e}) — skipping cross-check")
        return

    # Jolpica points keyed by (raceName, driver code/family)
    jol = {}
    for r in jraces:
        name = r["raceName"]
        for res in r.get("Results", []):
            drv = res["Driver"]
            key = (name, (drv.get("code") or drv["familyName"]).upper())
            st = res.get("status", "")
            finished = st == "Finished" or st.startswith("+")
            jol[key] = {"points": float(res.get("points", 0)), "finished": finished, "status": st}

    races_by_round = {r["round"]: r for r in data["races"]}
    issues = 0
    for d in data["drivers"]:
        code = d["id"].upper()
        for rnd_str, pts in d["race_points"].items():
            race = races_by_round.get(int(rnd_str))
            if not race:
                continue
            key = (race["name"], code)
            if key not in jol:
                # also try family name
                key = (race["name"], d["family_name"].upper())
            if key not in jol:
                print(f"  ? {d['family_name']:12} {race['code']}: not found in Jolpica")
                issues += 1
                continue
            j = jol[key]
            if abs(j["points"] - pts) > 0.01:
                print(f"  ✗ {d['family_name']:12} {race['code']}: points OpenF1={pts} Jolpica={j['points']}")
                issues += 1
            of1_finished = d["race_status"].get(rnd_str, "") == ""
            if of1_finished != j["finished"]:
                print(f"  ✗ {d['family_name']:12} {race['code']}: status OpenF1="
                      f"{d['race_status'].get(rnd_str) or 'FIN'} Jolpica={j['status']}")
                issues += 1
    print(f"  cross-check complete — {issues} discrepancy(ies)"
          + ("" if issues else " ✓ sources agree"))


# ── main ─────────────────────────────────────────────────────────────────────────

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    years = [int(y) for y in args] if args else [datetime.now().year]

    os.makedirs("data", exist_ok=True)

    for year in years:
        print(f"Processing {year} …")
        data = fetch_season(year)
        if "--no-check" not in flags:
            cross_check(year, data)
        path = os.path.join("data", f"{year}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  → saved {path}  ({len(data['drivers'])} drivers, "
              f"{len(data['races'])} races, {len(data['cancelled_rounds'])} cancelled)")


if __name__ == "__main__":
    main()
