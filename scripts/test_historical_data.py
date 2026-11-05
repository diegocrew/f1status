import json
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import fetch_data


ROOT = Path(__file__).resolve().parents[1]


class HistoricalFetcherTests(unittest.TestCase):
    @patch.object(fetch_data.time, "sleep")
    def test_paginated_results_merge_split_rounds(self, _sleep):
        pages = [
            {"MRData": {"total": "3", "RaceTable": {"Races": [
                {"round": "1", "Results": [{"position": "1"}]},
            ]}}},
            {"MRData": {"total": "3", "RaceTable": {"Races": [
                {"round": "1", "Results": [{"position": "2"}]},
                {"round": "2", "Results": [{"position": "1"}]},
            ]}}},
        ]
        with patch.object(fetch_data, "_get", side_effect=pages) as get:
            races = fetch_data.fetch_jolpica_collection(1980, "results.json", "Results")
        self.assertEqual(len(races), 2)
        self.assertEqual(len(races[0]["Results"]), 2)
        self.assertEqual(get.call_args_list[1].args[1]["offset"], 1)

    @patch.object(fetch_data.time, "sleep")
    def test_incomplete_results_fail_explicitly(self, _sleep):
        payload = {"MRData": {"total": "1", "RaceTable": {"Races": []}}}
        with patch.object(fetch_data, "_get", return_value=payload):
            with self.assertRaisesRegex(RuntimeError, "Incomplete Jolpica"):
                fetch_data.fetch_jolpica_collection(1980, "results.json", "Results")

    @patch.object(fetch_data.time, "sleep")
    def test_counted_points_and_exclusions_do_not_change_race_points(self, _sleep):
        drivers = {
            "prost": {"id": "prost", "total": 105, "race_points": {"1": 9}},
            "msc": {"id": "msc", "total": 78, "race_points": {"1": 10}},
        }
        constructors = [{"id": "mclaren", "total": 199}]
        payloads = [
            {"MRData": {"total": "2", "StandingsTable": {"StandingsLists": [
                {"DriverStandings": [
                    {"Driver": {"driverId": "prost"}, "points": "87", "position": "2"},
                    {"Driver": {"driverId": "michael_schumacher", "code": "MSC"},
                     "points": "78", "positionText": "D"},
                ]},
            ]}}},
            {"MRData": {"total": "1", "StandingsTable": {"StandingsLists": [
                {"ConstructorStandings": [
                    {"Constructor": {"name": "McLaren"}, "points": "199", "position": "1"},
                ]},
            ]}}},
        ]
        with patch.object(fetch_data, "_get", side_effect=payloads):
            fetch_data.apply_historical_standings(1988, drivers, constructors)
        self.assertEqual(drivers["prost"]["total"], 87)
        self.assertEqual(drivers["prost"]["race_points"], {"1": 9})
        self.assertEqual(drivers["msc"]["championship_status"], "DSQ")
        self.assertNotIn("championship_position", drivers["msc"])
        self.assertEqual(constructors[0]["championship_position"], 1)

    @patch.object(fetch_data.time, "sleep")
    def test_incomplete_standings_fail_explicitly(self, _sleep):
        payload = {"MRData": {"total": "1", "StandingsTable": {"StandingsLists": []}}}
        with patch.object(fetch_data, "_get", return_value=payload):
            with self.assertRaisesRegex(RuntimeError, "Incomplete Jolpica"):
                fetch_data.apply_historical_standings(1980, {}, [])

    @patch.object(fetch_data.time, "sleep")
    def test_constructor_penalties_are_idempotent(self, _sleep):
        constructors = [{"id": "benetton", "total": 147}, {"id": "williams", "total": 118}]
        for points in ((147, 118), (137, 112)):
            payloads = [
                {"MRData": {"total": "1", "StandingsTable": {"StandingsLists": [
                    {"DriverStandings": [
                        {"Driver": {"driverId": "test"}, "points": "0"},
                    ]},
                ]}}},
                {"MRData": {"total": "2", "StandingsTable": {"StandingsLists": [
                    {"ConstructorStandings": [
                        {"Constructor": {"name": "Benetton"},
                         "points": str(points[0]), "position": "1"},
                        {"Constructor": {"name": "Williams"},
                         "points": str(points[1]), "position": "2"},
                    ]},
                ]}}},
            ]
            with self.subTest(source_points=points):
                with patch.object(fetch_data, "_get", side_effect=payloads):
                    fetch_data.apply_historical_standings(1995, {}, constructors)
                self.assertEqual([c["total"] for c in constructors], [137, 112])

    @patch.object(fetch_data.time, "sleep")
    def test_missing_standing_fails_instead_of_using_race_sum(self, _sleep):
        payload = {"MRData": {"total": "1", "StandingsTable": {"StandingsLists": [
            {"DriverStandings": [
                {"Driver": {"driverId": "other"}, "points": "0"},
            ]},
        ]}}}
        with patch.object(fetch_data, "_get", return_value=payload):
            with self.assertRaisesRegex(RuntimeError, "No 1988 driverStandings entry"):
                fetch_data.apply_historical_standings(1988, {"prost": {"id": "prost"}}, [])

    def test_historical_round_codes(self):
        self.assertEqual(fetch_data.race_code("European Grand Prix", "Germany"), "EUR")
        self.assertEqual(fetch_data.race_code("European Grand Prix", "Azerbaijan"), "AZB")
        self.assertEqual(fetch_data.race_code("San Marino Grand Prix", "Italy"), "SMR")
        self.assertEqual(fetch_data.race_code("Pacific Grand Prix", "Japan"), "PAC")


class HistoricalArchiveTests(unittest.TestCase):
    def load(self, year):
        return json.loads((ROOT / "data" / f"{year}.json").read_text(encoding="utf-8"))

    def test_all_twenty_seasons_and_champions(self):
        champions = [
            ("Jones", 67, 14), ("Piquet", 50, 15), ("Rosberg", 44, 16),
            ("Piquet", 59, 15), ("Lauda", 72, 16), ("Prost", 73, 16),
            ("Prost", 72, 16), ("Piquet", 73, 16), ("Senna", 90, 16),
            ("Prost", 76, 16), ("Senna", 78, 16), ("Senna", 96, 16),
            ("Mansell", 108, 16), ("Prost", 99, 16), ("Schumacher", 92, 16),
            ("Schumacher", 102, 17), ("Hill", 97, 16), ("Villeneuve", 81, 17),
            ("H\u00e4kkinen", 100, 16), ("H\u00e4kkinen", 76, 16),
        ]
        for year, (name, points, race_count) in enumerate(champions, 1980):
            with self.subTest(year=year):
                data = self.load(year)
                self.assertEqual(data["year"], year)
                self.assertEqual(data["source"], "jolpica")
                self.assertEqual(len(data["races"]), race_count)
                self.assertEqual(data["completed_rounds"], list(range(1, race_count + 1)))
                champion = data["drivers"][0]
                self.assertEqual(champion["family_name"], name)
                self.assertEqual(champion["total"], points)
                self.assertEqual(champion["championship_position"], 1)
                self.assertFalse(data["sprint_rounds"])
                for driver in data["drivers"]:
                    self.assertEqual(set(driver["race_points"]), set(driver["race_position"]))
                    self.assertEqual(set(driver["race_points"]), set(driver["race_status"]))

    def test_dropped_scores(self):
        data = self.load(1988)
        senna, prost = data["drivers"][:2]
        self.assertEqual([senna["total"], prost["total"]], [90, 87])
        self.assertEqual(sum(senna["race_points"].values()), 94)
        self.assertEqual(sum(prost["race_points"].values()), 105)
        self.assertEqual(data["constructors"][0]["total"], 199)

    def test_every_race_podium_uses_its_seasons_awards(self):
        for year in range(1980, 2000):
            data = self.load(year)
            for race in data["races"]:
                rnd = str(race["round"])
                awards = {1: 9 if year < 1991 else 10, 2: 6, 3: 4}
                if (year, race["name"]) in (
                    (1984, "Monaco Grand Prix"), (1991, "Australian Grand Prix")
                ):
                    awards = {position: points / 2 for position, points in awards.items()}
                if year == 1983 and race["name"] == "Brazilian Grand Prix":
                    awards = {1: 9, 3: 4}
                podium = {d["race_position"][rnd]: d["race_points"][rnd]
                          for d in data["drivers"]
                          if rnd in d["race_position"] and d["race_position"][rnd] <= 3}
                with self.subTest(year=year, race=race["name"]):
                    self.assertEqual(podium, awards)

    def test_brazil_1983_unawarded_second_place(self):
        data = self.load(1983)
        drivers = {d["id"]: d for d in data["drivers"]}
        self.assertEqual(drivers["lauda"]["race_position"]["1"], 3)
        self.assertEqual(drivers["laffite"]["race_position"]["1"], 4)
        self.assertEqual(drivers["lauda"]["race_points"]["1"], 4)
        self.assertFalse(any(d["race_position"].get("1") == 2 for d in data["drivers"]))

    def test_half_point_podiums(self):
        for year, race_name, awards in (
            (1984, "Monaco Grand Prix", {1: 4.5, 2: 3, 3: 2}),
            (1991, "Australian Grand Prix", {1: 5, 2: 3, 3: 2}),
        ):
            data = self.load(year)
            rnd = str(next(r["round"] for r in data["races"] if r["name"] == race_name))
            podium = {d["race_position"][rnd]: d["race_points"][rnd]
                      for d in data["drivers"]
                      if rnd in d["race_position"] and d["race_position"][rnd] <= 3}
            with self.subTest(year=year):
                self.assertEqual(podium, awards)

    def test_1997_championship_exclusion(self):
        data = self.load(1997)
        driver = next(d for d in data["drivers"] if d["given_name"] == "Michael"
                      and d["family_name"] == "Schumacher")
        self.assertEqual(driver["total"], 78)
        self.assertEqual(driver["championship_status"], "DSQ")
        self.assertNotIn("championship_position", driver)
        self.assertEqual(data["drivers"][1]["family_name"], "Frentzen")
        self.assertEqual(data["drivers"][-1], driver)

    def test_1995_constructor_penalty(self):
        data = self.load(1995)
        totals = {c["id"]: c["total"] for c in data["constructors"]}
        self.assertEqual(totals["benetton"], 137)
        self.assertEqual(totals["williams"], 112)

    def test_team_timeline_coverage_and_breaks(self):
        data = json.loads((ROOT / "data" / "teams.json").read_text(encoding="utf-8"))
        self.assertEqual((data["from"], data["to"]), (1980, 2026))
        ids = [t["id"] for t in data["teams"]]
        self.assertEqual(len(ids), len(set(ids)))
        for team in data["teams"]:
            for year in range(data["from"], data["to"] + 1):
                with self.subTest(team=team["id"], year=year):
                    names = [p for p in team["names"] if p[0] <= year <= p[1]]
                    engines = [p for p in team["engines"] if p[0] <= year <= p[1]]
                    expected = (team["first_entry"] <= year <= (team["last_entry"] or data["to"])
                                and (team["id"], year) not in (
                                    ("brabham", 1988), ("theodore", 1980)
                                ))
                    self.assertEqual(len(names), int(expected))
                    self.assertEqual(len(names), len(engines))
                    if names:
                        self.assertGreaterEqual(year, team["first_entry"])
                        self.assertLessEqual(year, team["last_entry"] or data["to"])
        teams = {t["id"]: t for t in data["teams"]}
        for team_id, year in (("brabham", 1988), ("theodore", 1980)):
            self.assertFalse(any(p[0] <= year <= p[1] for p in teams[team_id]["names"]))
        for team_id in ("life", "lola_1997", "original_lotus", "renault_original", "haas_lola"):
            self.assertIn(team_id, teams)
        active = [t for t in data["teams"] if any(p[0] <= 2026 <= p[1] for p in t["names"])]
        self.assertEqual(len(active), 11)


if __name__ == "__main__":
    unittest.main()
