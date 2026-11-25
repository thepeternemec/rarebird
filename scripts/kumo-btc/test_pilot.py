import copy
import math
import unittest

from pilot import BAR, HOUR, VERSION, iso, metrics, moved, prepare, resolve_journal, splits, stamp


def dataset():
    reference = 1795608000
    reference -= reference % HOUR
    bars = [{"started_at": iso(at), "observed_at": iso(at + BAR + 10),
             "open": 100., "high": 100.5, "low": 99.5, "close": 100., "volume": 2., "trades": 5}
            for at in range(reference - HOUR - BAR, reference, BAR)]
    forecast = {"reference_at": iso(reference), "issued_at": iso(reference + 60), "target_at": iso(reference + HOUR),
                "reference_price_usd": 100., "probability": .2, "baseline_probability": .1,
                "outcome": "above", "target_price_usd": 101.}
    return {"schema_version": "btc-kumo-dataset-v1", "generated_at": iso(reference + 2 * HOUR),
            "instrument_id": "kraken:XBTUSD", "baseline_version": "spot-range-hourly-v1",
            "target": {"horizon_minutes": 60, "threshold_fraction": .01},
            "coverage": {"since": iso(reference - 30 * 86400), "news_truncated": False, "news_limit": 6000},
            "bars": bars, "news": [], "forecasts": [forecast]}


class BtcPilotTests(unittest.TestCase):
    def test_only_information_available_at_issue_is_used(self):
        data = dataset()
        cutoff = stamp(data["forecasts"][0]["issued_at"])
        data["news"] = [
            {"id": "known", "source": "A", "published_at": iso(cutoff - 300), "first_indexed_at": iso(cutoff - 100)},
            {"id": "backdated", "source": "B", "published_at": iso(cutoff - 5000), "first_indexed_at": iso(cutoff + 1)},
            {"id": "future-publication", "source": "C", "published_at": iso(cutoff + 10), "first_indexed_at": iso(cutoff - 100)},
        ]
        examples, skipped = prepare(data)
        self.assertEqual(skipped, {})
        self.assertEqual([n["id"] for n in examples[0]["news"]], ["known"])
        self.assertEqual(examples[0]["features"]["news_count_24h"], 1)

    def test_late_backfill_cannot_rewrite_historical_features(self):
        data = dataset()
        data["bars"][0]["observed_at"] = iso(stamp(data["forecasts"][0]["issued_at"]) + 1)
        rows, skipped = prepare(data)
        self.assertEqual(rows, [])
        self.assertEqual(skipped, {"market_history_unavailable_at_issuance": 1})

    def test_outcomes_do_not_change_features(self):
        first = dataset()
        other = copy.deepcopy(first)
        other["forecasts"][0]["target_price_usd"] = 100.1
        one, two = prepare(first)[0][0], prepare(other)[0][0]
        self.assertEqual(one["features"], two["features"])
        self.assertEqual((one["label"], two["label"]), (1, 0))
        self.assertEqual(moved(100, 99), 1)
        self.assertEqual(moved(100, 101), 1)

    def test_duplicate_hours_and_future_resolutions_fail(self):
        data = dataset()
        data["forecasts"].append(data["forecasts"][0].copy())
        with self.assertRaises(ValueError):
            prepare(data)
        data = dataset()
        data["generated_at"] = data["forecasts"][0]["issued_at"]
        with self.assertRaises(ValueError):
            prepare(data)

    def test_split_boundaries_purge_delayed_outcomes(self):
        rows = [{"ref": i * HOUR, "label": i % 2} for i in range(400)]
        groups = splits(rows)
        self.assertIsNotNone(groups)
        for left, right in zip(groups, groups[1:]):
            self.assertLess(max(e["ref"] for e in left) + 7 * HOUR, min(e["ref"] for e in right))
        self.assertIsNone(splits([{"ref": i * HOUR, "label": 0} for i in range(400)]))

    def test_paired_metrics_and_empty_cohorts(self):
        result = metrics([{"label": 1, "kumo": .8, "existing": .2, "base_rate": .1}])
        self.assertAlmostEqual(result["kumo_brier"], .04)
        self.assertAlmostEqual(result["existing_brier"], .64)
        self.assertAlmostEqual(result["kumo_log_loss"], -math.log(.8))
        self.assertEqual(metrics([])["kumo_brier"], None)
        self.assertEqual(sum(row["count"] for row in result["calibration"]), 1)

    def test_journal_retries_preserve_prediction_and_missing_is_not_a_loss(self):
        data = dataset()
        f = data["forecasts"][0]
        entry = {"reference_at": f["reference_at"], "issued_at": f["issued_at"], "target_at": f["target_at"],
                 "reference_price_usd": 100., "probability": .8, "existing_probability": .2,
                 "base_rate_probability": .1, "outcome": "pending"}
        journal = {"version": VERSION, "predictions": [entry]}
        self.assertEqual(resolve_journal(journal, data)["scored"], 1)
        self.assertEqual(resolve_journal(journal, data)["scored"], 1)
        self.assertEqual(entry["probability"], .8)
        journal = {"version": VERSION, "predictions": [{**entry, "outcome": "pending"}]}
        data["forecasts"][0]["outcome"] = "missing"
        result = resolve_journal(journal, data)
        self.assertEqual((result["missing"], result["scored"]), (1, 0))

    def test_invalid_probabilities_fail(self):
        with self.assertRaises(ValueError):
            metrics([{"label": 0, "kumo": float("nan")}])
        with self.assertRaises(ValueError):
            metrics([{"label": 0, "kumo": 1.1}])


if __name__ == "__main__":
    unittest.main()
