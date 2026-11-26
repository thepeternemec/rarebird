import copy
import unittest
from predict import FEATURES, prepare, split, stamp, iso

def fixture():
    issued = stamp("2026-11-25T16:00:00Z")
    reference = {key: 1.0 for key in FEATURES if key != "news_count"}
    reference.update(measured_at=iso(issued), quote_at=iso(issued-1))
    alert = {"id": "stock_test", "symbol": "NVDA", "universe_version": "version", "feed": "iex",
             "created_at": iso(issued), "reference": reference, "evidence": [], "state": "active",
             "closed_at": None, "valid_until": iso(issued+120), "expires_at": iso(issued+900),
             "outcomes": [{"minutes": 15, "due_at": iso(issued+900), "status": "pending", "measured_at": None, "cost_scenario_bps": None}]}
    return {"schema_version": "sp500-kumo-v1", "generated_at": iso(issued+30), "universe_version": "version", "feed": "iex", "setups": [alert]}

class PreparationTests(unittest.TestCase):
    def test_no_future_features_or_labels(self):
        data = fixture()
        self.assertIsNone(prepare(data)[0]["label"])
        data["setups"][0]["reference"]["quote_at"] = iso(stamp(data["generated_at"])+1)
        with self.assertRaisesRegex(ValueError, "Future"):
            prepare(data)
    def test_outcomes_require_observation_and_grace(self):
        data = fixture()
        alert = data["setups"][0]
        due = stamp(alert["outcomes"][0]["due_at"])
        alert["outcomes"][0].update(status="observed", measured_at=iso(due), cost_scenario_bps=-10)
        data["generated_at"] = iso(due+120)
        self.assertEqual(prepare(data)[0]["label"], 0)
        alert["outcomes"][0]["status"] = "missing"
        self.assertIsNone(prepare(data)[0]["label"])
    def test_future_news_is_excluded(self):
        data = fixture()
        data["setups"][0]["evidence"] = [{"source": "publisher", "known_at": data["generated_at"], "published_at": data["generated_at"]}]
        self.assertEqual(prepare(data)[0]["features"]["news_count"], 0)
    def test_membership_feed_duplicates_and_truncation(self):
        for change in [lambda d: d.update(truncated=True), lambda d: d["setups"][0].update(feed="sip"), lambda d: d["setups"][0].update(universe_version="other"), lambda d: d["setups"].append(copy.deepcopy(d["setups"][0]))]:
            data = fixture()
            change(data)
            with self.assertRaises(ValueError):
                prepare(data)
    def test_cross_sectional_rows_stay_on_same_side_of_time_split(self):
        rows = []
        for day in range(12):
            issued = stamp("2026-10-01T16:00:00Z") + day*86400
            for index in range(20):
                rows.append({"id": str(day)+":"+str(index), "issued": issued, "known": issued+1020, "label": index%2})
        cohorts = split(rows)
        self.assertIsNotNone(cohorts)
        for left, right in zip(cohorts, cohorts[1:]):
            self.assertLess(max(row["known"] for row in left), min(row["issued"] for row in right))
        self.assertIsNone(split(rows[:20]))

if __name__ == "__main__":
    unittest.main()
