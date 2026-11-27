import copy
import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from healthcheck import healthy
from predict import NoRedirect, iso, stamp
from test_predict import fixture
from worker import StockWorker


def historical_dataset():
    data = fixture()
    template = data["setups"][0]
    rows = []
    for day in range(12):
        issued = stamp("2026-11-01T16:00:00Z") + day * 86400
        for index in range(20):
            row = copy.deepcopy(template)
            row.update(id=f"stock_{day}_{index}", created_at=iso(issued), state="expired", closed_at=iso(issued+900),
                       valid_until=iso(issued+120), expires_at=iso(issued+900))
            row["reference"].update(measured_at=iso(issued), quote_at=iso(issued-1))
            row["outcomes"][0].update(due_at=iso(issued+900), status="observed", measured_at=iso(issued+900),
                                      cost_scenario_bps=10 if index % 2 else -10)
            rows.append(row)
    data["setups"] = rows + [template]
    return data


class WorkerTests(unittest.TestCase):
    def args(self, output, publish=False):
        return SimpleNamespace(origin="https://www.rarebird.network", output=output, dataset=None, publish=publish, watch=False)

    def test_unconfigured_feed_is_blocked_and_never_fits(self):
        data = fixture()
        data.update(data_status="not_configured", setups=[])
        with tempfile.TemporaryDirectory() as directory:
            worker = StockWorker(self.args(directory), fetch=lambda *_: data,
                                 fit=lambda *_: self.fail("An unconfigured feed must not train"), clock=lambda: stamp(data["generated_at"]))
            report = worker.tick()
            self.assertEqual(report["status"], "blocked")
            self.assertEqual(report["error_code"], "stock_feed_not_configured")
            self.assertEqual(json.loads((Path(directory)/"status.json").read_text())["state"], "blocked")

    def test_request_failure_recovers_without_exposing_exception_content(self):
        data = fixture()
        calls = []
        def fetch(*_):
            calls.append(1)
            if len(calls) == 1:
                raise OSError("PRIVATE-TOKEN in a provider URL")
            return data
        with tempfile.TemporaryDirectory() as directory:
            worker = StockWorker(self.args(directory), fetch=fetch, clock=lambda: stamp(data["generated_at"]))
            first = worker.tick()
            self.assertEqual(first["status"], "degraded")
            self.assertEqual(first["retry_in_seconds"], 5)
            self.assertNotIn("PRIVATE-TOKEN", (Path(directory)/"report.json").read_text())
            self.assertEqual(worker.tick()["status"], "warming_up")
            self.assertEqual(worker.failures, 0)

    def test_stale_or_truncated_exports_never_train(self):
        for change in (lambda d: d.update(truncated=True), lambda d: d.update(generated_at=iso(stamp(d["generated_at"])-1000)), lambda d: d.pop("setups")):
            data = fixture()
            now = stamp(data["generated_at"])
            change(data)
            with tempfile.TemporaryDirectory() as directory:
                worker = StockWorker(self.args(directory), fetch=lambda *_: data, fit=lambda *_: self.fail("Must not fit"), clock=lambda: now)
                self.assertEqual(worker.tick()["status"], "degraded")

    def test_post_fit_refresh_and_first_prediction_are_respected_without_repeated_fitting(self):
        data = historical_dataset()
        now = stamp(data["generated_at"])
        calls, fits, populations, batches, states = [], [], [], [], []
        def fetch(url, body=None):
            if body is not None:
                if body.get("kind") == "heartbeat":
                    states.append(body["state"])
                    return {"accepted": True}
                batches.append(body)
                data["setups"][-1]["prediction"] = {"probability": .8}
                return {"inserted": len(body["predictions"]), "skipped": 0}
            calls.append(url)
            return copy.deepcopy(data)
        def fit(examples, cohorts, directory):
            fits.append(directory)
            def score(population):
                populations.append([row["id"] for row in population])
                return {row["id"]: .8 for row in population}
            return score, {"model_id": "kumo-stock-0123456789abcdef", "training_cutoff": iso(now-86400),
                           "trained_at": iso(now-1), "baseline_probability": .5}
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RAREBIRD_STOCK_MODEL_SECRET": "synthetic-only"}):
            worker = StockWorker(self.args(directory, publish=True), fetch=fetch, fit=fit, clock=lambda: now)
            self.assertEqual(worker.tick()["eligible"], 1)
            self.assertEqual(len(calls), 2, "current episodes are fetched after fitting")
            self.assertEqual(worker.tick()["eligible"], 0)
            worker.fitted_at -= 3700
            self.assertEqual(worker.tick()["status"], "shadow")
            self.assertEqual(len(fits), 1, "unchanged fitting cohorts must not trigger hourly compute")
            self.assertEqual(len(batches), 1)
            self.assertIn("training", states)
            self.assertEqual(populations[0], ["stock_test"])

    def test_publishing_requires_a_secret_and_refuses_file_exports(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, "SECRET"):
                StockWorker(self.args(directory, publish=True))
            args = self.args(directory, publish=True)
            args.dataset = "example.json"
            with self.assertRaisesRegex(ValueError, "file dataset"):
                StockWorker(args)

    def test_bad_publication_access_is_a_recoverable_error_during_warmup(self):
        data = fixture()
        def fetch(url, body=None):
            if body:
                raise OSError("unauthorized with PRIVATE-TOKEN")
            return data
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"RAREBIRD_STOCK_MODEL_SECRET": "synthetic-only"}):
            worker = StockWorker(self.args(directory, publish=True), fetch=fetch, clock=lambda: stamp(data["generated_at"]))
            result = worker.tick()
            self.assertEqual(result["status"], "degraded")
            self.assertEqual(result["error_code"], "stock_publication_failed")
            self.assertNotIn("PRIVATE-TOKEN", json.dumps(result))

    def test_shutdown_during_fit_does_not_score_or_publish(self):
        data = historical_dataset()
        with tempfile.TemporaryDirectory() as directory:
            def fit(*_):
                worker.stop.set()
                return lambda *_: self.fail("A stopped worker must not score"), {"model_id": "kumo-stock-0123456789abcdef"}
            worker = StockWorker(self.args(directory), fetch=lambda *_: data, fit=fit, clock=lambda: stamp(data["generated_at"]))
            self.assertEqual(worker.tick()["status"], "stopped")

    def test_health_requires_recent_liveness_and_successful_heartbeat(self):
        now = stamp("2026-11-27T16:00:00Z")
        good = {"state": "training", "last_seen_at": iso(now), "heartbeat_error_code": None}
        self.assertTrue(healthy(good, now+30))
        self.assertFalse(healthy(good, now+181))
        self.assertFalse(healthy({**good, "state": "stopped"}, now))
        self.assertFalse(healthy({**good, "heartbeat_error_code": "stock_publication_failed"}, now))
        self.assertFalse(healthy({}, now))

    def test_authenticated_requests_refuse_redirects(self):
        import urllib.error
        import urllib.request
        original = urllib.request.Request("https://www.rarebird.network/api/cron/stock-kumo", headers={"Authorization": "Bearer synthetic"})
        with self.assertRaises(urllib.error.HTTPError):
            NoRedirect().redirect_request(original, None, 307, "redirect", {}, "https://other.example")


if __name__ == "__main__":
    unittest.main()
