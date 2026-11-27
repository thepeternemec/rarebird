"""Kumo Engine scoring for frozen S&P 500 setups. Predictions are prospective and immutable."""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

TARGET = "positive_15m_cost_adjusted_relative_return"
FEATURES = ["asset_return_bps", "benchmark_return_bps", "relative_return_bps", "residual_z", "relative_volume", "spread_bps", "beta", "news_count"]

def stamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timezone required")
    return parsed.timestamp()

def iso(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")

def prepare(data):
    if data.get("schema_version") != "sp500-kumo-v1" or data.get("truncated") or not isinstance(data.get("setups"), list):
        raise ValueError("Incomplete stock dataset")
    now = stamp(data["generated_at"])
    examples, seen = [], set()
    for alert in data.get("setups", []):
        if alert["id"] in seen:
            raise ValueError("Duplicate setup")
        seen.add(alert["id"])
        issued = stamp(alert["created_at"])
        if issued > now or alert.get("universe_version") != data["universe_version"] or alert["feed"] != data["feed"]:
            raise ValueError("Stock cohort mismatch")
        reference = alert["reference"]
        if stamp(reference["measured_at"]) > issued or stamp(reference["quote_at"]) > issued:
            raise ValueError("Future reference data")
        context = [item for item in alert["evidence"] if max(stamp(item["known_at"]), stamp(item["published_at"])) <= issued]
        features = {key: reference[key] for key in FEATURES if key != "news_count"}
        features["news_count"] = len(context)
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in features.values()):
            raise ValueError("Non-finite screening feature")
        outcome = next(item for item in alert["outcomes"] if item["minutes"] == 15)
        due = stamp(outcome["due_at"])
        if due != issued + 900:
            raise ValueError("Target horizon changed")
        label, known = None, due + 120
        if outcome["status"] == "observed":
            measured, cost = stamp(outcome["measured_at"]), outcome["cost_scenario_bps"]
            if not due <= measured <= known or measured > now or isinstance(cost, bool) or not isinstance(cost, (float, int)) or not math.isfinite(cost):
                raise ValueError("Invalid forward outcome")
            if known <= now:
                label = int(cost > 0)
        examples.append({"id": alert["id"], "symbol": alert["symbol"], "issued": issued, "known": known,
                         "features": features, "news": context, "label": label,
                         "has_prediction": bool(alert.get("prediction")),
                         "active": alert["state"] == "active" and not alert["closed_at"] and now < min(stamp(alert["valid_until"]), stamp(alert["expires_at"]))})
    return examples

def split(examples):
    labeled = sorted((row for row in examples if row["label"] is not None), key=lambda row: (row["issued"], row["id"]))
    days = sorted({iso(row["issued"])[:10] for row in labeled})
    if len(labeled) < 120 or len(days) < 6:
        return None
    boundaries = [stamp(days[min(len(days)-1, max(1, int(len(days)*fraction)))] + "T00:00:00Z") for fraction in (.5, .67, .84)]
    starts, ends = [float("-inf"), *boundaries], [*boundaries, float("inf")]
    cohorts = [[row for row in labeled if start <= row["issued"] < end and row["known"] < end] for start, end in zip(starts, ends)]
    if any(not group for group in cohorts) or any(len({row["label"] for row in group}) < 2 for group in cohorts[:3]):
        return None
    return cohorts

def metrics(rows, scores, baseline):
    return {"count": len(rows), "brier": sum((scores[row["id"]]-row["label"])**2 for row in rows)/len(rows),
            "baseline_brier": sum((baseline-row["label"])**2 for row in rows)/len(rows)}

def fit_model(examples, cohorts, directory, epochs=3):
    import pandas as pd
    import torch
    import kumo.engine as kumo
    from kumoapi.model_plan import RunMode
    from kumoapi.train import TrainingTableSpec
    from kumoapi.typing import Stype

    torch.manual_seed(42)
    torch.set_num_threads(2)
    directory = Path(directory).resolve()
    source = directory / "source"
    source.mkdir(parents=True, exist_ok=True)
    kumo.configure(scratch_dir=str(directory / "scratch"))
    fitting = [row for cohort in cohorts[:3] for row in cohort]
    cutoff = max(row["known"] for row in fitting)
    baseline = sum(row["label"] for row in cohorts[0]) / len(cohorts[0])
    def save(population):
        rows = [{"setup_id": row["id"], "symbol": row["symbol"], **row["features"], "positive": None} for row in population]
        pd.DataFrame(rows).assign(positive=lambda frame: frame["positive"].astype("boolean")).to_parquet(source / "setups.parquet", index=False)
        news = [{"news_id": row["id"] + ":" + str(index), "setup_id": row["id"], "publisher": item["source"],
                 "age_minutes": (row["issued"] - max(stamp(item["known_at"]), stamp(item["published_at"]))) / 60}
                for row in population for index, item in enumerate(row["news"])]
        pd.DataFrame(news, columns=["news_id", "setup_id", "publisher", "age_minutes"]).to_parquet(source / "news.parquet", index=False)
        return bool(news)
    has_news = save(fitting)
    connector = kumo.FileConnector(root_dir=str(source))
    setups = kumo.Table.from_source_table(connector["setups.parquet"], primary_key="setup_id")
    for feature in FEATURES:
        setups = setups.with_column(feature, stype=Stype.numerical)
    tables = {"setups": setups.with_column("symbol", stype=Stype.categorical).with_column("positive", stype=Stype.categorical)}
    edges = []
    if has_news:
        tables["news"] = kumo.Table.from_source_table(connector["news.parquet"], primary_key="news_id").with_column("setup_id", stype=Stype.ID).with_column("publisher", stype=Stype.categorical).with_column("age_minutes", stype=Stype.numerical)
        edges = [kumo.Edge(src_table="news", fkey="setup_id", dst_table="setups")]
    graph = kumo.Graph(tables=tables, edges=edges)
    graph.validate()
    snapshot = graph.snapshot()
    query = kumo.PredictiveQuery(graph, "PREDICT setups.positive FOR EACH setups.setup_id")
    labels = [{"ENTITY1": row["id"], "TARGET1": bool(row["label"]), "SPLIT": index} for index, cohort in enumerate(cohorts[:3]) for row in cohort]
    pd.DataFrame(labels).to_parquet(source / "labels.parquet", index=False)
    spec = TrainingTableSpec(split_col="SPLIT")
    training_table = kumo.TrainingTable.from_source_table(connector["labels.parquet"], spec, pq=query, snapshot=snapshot)
    plan = query.suggest_model_plan(snapshot, run_mode=RunMode.FAST, train_table_spec=spec)
    plan.training_job.num_experiments = 1
    plan.training_job.refit_trainval = False
    plan.training_job.refit_full = False
    plan.training_job.disable_explain = True
    plan.optimization.max_epochs = epochs
    trainer = kumo.Trainer(plan)
    fitted = trainer.fit(training_table, snapshot=snapshot)

    def score(population):
        if not population:
            return {}
        requested = {row["id"] for row in population}
        if len(requested) != len(population):
            raise ValueError("Duplicate prediction population")
        by_id = {row["id"]: row for row in fitting}
        by_id.update({row["id"]: row for row in population})
        save(list(by_id.values()))
        scoring_snapshot = graph.snapshot()
        pd.DataFrame({"ENTITY1": [row["id"] for row in population]}).to_parquet(source / "scoring.parquet", index=False)
        prediction_table = kumo.PredictionTable.from_source_table(connector["scoring.parquet"], pq=query, snapshot=scoring_snapshot)
        output = trainer.predict(prediction_table, snapshot=scoring_snapshot, binary_classification_threshold=.5).frame
        entity = "ENTITY" if "ENTITY" in output.columns else "ENTITY1"
        if entity not in output or "True_PROB" not in output or output[entity].duplicated().any() or set(output[entity]) != requested:
            raise ValueError("Unexpected Kumo prediction population")
        scores = {row[entity]: float(row["True_PROB"]) for _, row in output.iterrows()}
        if any(not math.isfinite(value) or not 0 <= value <= 1 for value in scores.values()):
            raise ValueError("Invalid Kumo probabilities")
        return scores
    model_id = "kumo-stock-" + hashlib.sha256(json.dumps({"labels": labels, "features": FEATURES, "plan": plan.as_json(), "snapshot": str(snapshot.id)}, sort_keys=True).encode()).hexdigest()[:16]
    scores = score(cohorts[3])
    return score, {"model_id": model_id, "engine": "kumo-engine", "version": kumo.__version__, "training_cutoff": iso(cutoff),
                   "trained_at": iso(time.time()), "baseline_probability": baseline, "plan": plan.as_json(),
                   "bundle": str(fitted.bundle_dir), "holdout": metrics(cohorts[3], scores, baseline)}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "Redirect refused", headers, fp)

def request(url, body=None):
    headers = {"User-Agent": "Rarebird-SP500-Kumo/1"}
    if body is not None:
        secret = os.environ.get("RAREBIRD_STOCK_MODEL_SECRET") or os.environ["CRON_SECRET"]
        headers.update({"Authorization": "Bearer " + secret, "Content-Type": "application/json"})
    with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers=headers), timeout=60) as response:
        return json.load(response)

def run(args):
    from worker import run_worker
    return run_worker(args)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--origin", default=os.environ.get("RAREBIRD_STOCK_ORIGIN", "https://www.rarebird.network"))
    parser.add_argument("--dataset")
    parser.add_argument("--output", required=True)
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--watch", action="store_true")
    run(parser.parse_args())
