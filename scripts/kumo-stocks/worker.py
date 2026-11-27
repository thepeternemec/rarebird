"""Persistent worker orchestration. Kumo imports happen only when a fit is needed."""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import signal
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

from predict import TARGET, fit_model, iso, prepare, request, split, stamp


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with open(temporary, "w", encoding="utf-8") as output:
        os.chmod(temporary, 0o600)
        json.dump(value, output, indent=2, allow_nan=False)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)


class WorkerError(Exception):
    pass


class Pulse:
    def __init__(self, directory, origin, publish, fetch=request, clock=time.time):
        self.directory, self.origin, self.publish = Path(directory), origin, publish
        self.fetch, self.clock = fetch, clock
        self.lock, self.stop = threading.Lock(), threading.Event()
        self.cohort = None
        self.value = {"state": "warming_up", "model_id": None, "error_code": None, "phase_started_at": iso(clock())}

    def update(self, state, error_code=None, model_id=None):
        with self.lock:
            if state != self.value["state"]:
                self.value["phase_started_at"] = iso(self.clock())
            self.value.update(state=state, error_code=error_code, model_id=model_id)

    def beat(self):
        # One lock protects the local atomic file and concurrent heartbeat requests.
        with self.lock:
            record = {**self.value, "last_seen_at": iso(self.clock()), "publication_enabled": self.publish}
            try:
                if self.publish and self.cohort:
                    body = {"kind": "heartbeat", **self.cohort,
                            **{key: record[key] for key in ("state", "model_id", "error_code")}}
                    accepted = self.fetch(self.origin + "/api/cron/stock-kumo", body)
                    if accepted.get("accepted") is not True:
                        raise WorkerError("stock_publication_failed")
                record["heartbeat_error_code"] = None
                success = True
            except Exception:
                record["heartbeat_error_code"] = "stock_publication_failed"
                success = False
            atomic_json(self.directory / "status.json", record)
            return success

    def watch(self):
        while not self.stop.wait(30):
            try:
                self.beat()
            except OSError:
                # Main cycle also writes reports and will surface a full/unwritable disk.
                pass


class StockWorker:
    def __init__(self, args, fetch=request, fit=fit_model, clock=time.time):
        self.args, self.fetch, self.fit, self.clock = args, fetch, fit, clock
        self.origin, self.directory = args.origin.rstrip("/"), Path(args.output)
        parsed = urlsplit(self.origin)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path:
            raise ValueError("Use an HTTPS origin without credentials, path or query")
        if args.dataset and args.publish:
            raise ValueError("A file dataset cannot publish predictions or heartbeats")
        if args.publish and not (os.environ.get("RAREBIRD_STOCK_MODEL_SECRET") or os.environ.get("CRON_SECRET")):
            raise ValueError("RAREBIRD_STOCK_MODEL_SECRET must be configured before publication")
        self.directory.mkdir(parents=True, exist_ok=True)
        self.pulse = Pulse(self.directory, self.origin, args.publish, fetch, clock)
        self.scorer, self.model, self.signature, self.cohort = None, None, None, None
        self.fitted_at, self.failures, self.stage = 0, 0, "stock_model_request_failed"

    def dataset(self):
        self.stage = "stock_model_request_failed"
        data = json.loads(Path(self.args.dataset).read_text()) if self.args.dataset else self.fetch(self.origin + "/api/v2/stock-model?dataset=1")
        if not self.args.dataset and not -5 <= self.clock() - stamp(data["generated_at"]) <= 90:
            raise WorkerError("stock_dataset_unavailable")
        if data.get("schema_version") != "sp500-kumo-v1" or data.get("truncated") or not isinstance(data.get("setups"), list):
            raise WorkerError("stock_dataset_incomplete")
        return data

    def cycle(self):
        data = self.dataset()
        cohort = (data["universe_version"], data["feed"])
        if cohort != self.cohort:
            self.scorer, self.model, self.signature, self.fitted_at = None, None, None, 0
            self.cohort = cohort
        self.pulse.cohort = {"universe_version": cohort[0], "feed": cohort[1]}
        report = {"target": TARGET, **self.pulse.cohort, "generated_at": iso(self.clock()),
                  "publication_enabled": self.args.publish, "status": "warming_up"}
        if data.get("data_status") != "available":
            error = "stock_feed_not_configured" if data.get("data_status") == "not_configured" else "stock_storage_unavailable"
            self.pulse.update("blocked", error)
            self.pulse.beat()
            return {**report, "status": "blocked", "error_code": error}
        self.stage = "stock_dataset_incomplete"
        examples = prepare(data)
        cohorts = split(examples)
        labeled = [row for row in examples if row["label"] is not None]
        report.update(examples=len(examples), training={"observed": len(labeled),
                      "trading_dates": len({iso(row["issued"])[:10] for row in labeled}),
                      "minimum_observed": 120, "minimum_trading_dates": 6})
        if not cohorts:
            self.pulse.update("warming_up")
            self.pulse.beat()
            return {**report, "reason": "Need 120 observed setups, six UTC trading dates and both classes in the purged fitting splits."}
        # Verify the publication connection before spending compute on a fit.
        if self.args.publish and not self.pulse.beat():
            raise WorkerError("stock_publication_failed")
        signature = hashlib.sha256(json.dumps([[{key: row[key] for key in ("id", "label", "features", "news")} for row in group]
                                               for group in cohorts[:3]], sort_keys=True, allow_nan=False).encode()).hexdigest()
        age = self.clock() - self.fitted_at
        if self.scorer is None or (age >= 3600 and signature != self.signature) or age >= 20 * 3600:
            self.stage = "stock_model_fit_failed"
            self.pulse.update("training", model_id=self.model["model_id"] if self.model else None)
            self.pulse.beat()
            scorer, model = self.fit(examples, cohorts, self.directory / ("model-" + str(time.time_ns())))
            self.scorer, self.model, self.signature, self.fitted_at = scorer, model, signature, self.clock()
        current = data if self.args.dataset else self.dataset()
        if (current["universe_version"], current["feed"]) != cohort:
            raise WorkerError("stock_cohort_changed")
        if current.get("data_status") != "available":
            raise WorkerError("stock_dataset_unavailable")
        self.stage = "stock_dataset_incomplete"
        population = [row for row in prepare(current) if row["active"] and not row["has_prediction"]
                      and row["issued"] > stamp(self.model["training_cutoff"])]
        self.stage = "stock_model_score_failed"
        self.pulse.update("scoring", model_id=self.model["model_id"])
        scores = self.scorer(population)
        batch = {key: self.model[key] for key in ("model_id", "training_cutoff", "trained_at", "baseline_probability")}
        batch.update(**self.pulse.cohort, predictions=[{"alert_id": row["id"], "probability": scores[row["id"]]} for row in population])
        atomic_json(self.directory / "batch.json", batch)
        report.update(status="shadow", model=self.model, eligible=len(population))
        self.stage = "stock_publication_failed"
        if self.args.publish and batch["predictions"]:
            report["publication"] = self.fetch(self.origin + "/api/cron/stock-kumo", batch)
        self.pulse.beat()
        return report

    def tick(self):
        try:
            report = self.cycle()
            self.failures = 0
        except Exception as error:
            self.failures += 1
            code = str(error) if isinstance(error, WorkerError) else self.stage
            self.pulse.update("degraded", code, self.model["model_id"] if self.model else None)
            self.pulse.beat()
            # External exception messages can contain URLs or headers. Publish only fixed codes.
            report = {"target": TARGET, "generated_at": iso(self.clock()), "status": "degraded", "error_code": code,
                      "consecutive_failures": self.failures, "retry_in_seconds": min(300, 5 * 2 ** min(self.failures - 1, 6))}
        atomic_json(self.directory / "report.json", report)
        print(json.dumps(report, allow_nan=False), flush=True)
        return report


def run_worker(args):
    worker = StockWorker(args)
    with open(worker.directory / "worker.lock", "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another worker already uses this output directory")
        stop = threading.Event()
        for event in (signal.SIGTERM, signal.SIGINT):
            signal.signal(event, lambda *_: stop.set())
        pulse = threading.Thread(target=worker.pulse.watch, daemon=True)
        pulse.start()
        try:
            while not stop.is_set():
                report = worker.tick()
                if not args.watch:
                    if report["status"] == "degraded":
                        raise SystemExit(1)
                    return
                stop.wait(report.get("retry_in_seconds", 30 if worker.scorer else 60))
        finally:
            worker.pulse.stop.set()
            pulse.join(timeout=65)
            worker.pulse.update("stopped", model_id=worker.model["model_id"] if worker.model else None)
            worker.pulse.beat()
