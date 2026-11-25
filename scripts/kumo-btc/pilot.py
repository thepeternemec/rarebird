"""BTC shadow experiment. Preparation, journal resolution and metrics use only the standard library."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

HOUR = 3600
BAR = 300
VERSION = "btc-kumo-v1"
DATASET_VERSION = "btc-kumo-dataset-v1"
BASELINE_VERSION = "spot-range-hourly-v1"
THRESHOLD = 0.01
FEATURES = ["return_5m", "return_30m", "return_60m", "volatility_1h", "range_1h",
            "volume_1h", "trades_1h", "hour_sin", "hour_cos", "news_count_24h",
            "publishers_24h", "news_coverage_known"]


def stamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Timestamp must include its timezone")
    return parsed.timestamp()


def iso(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")


def probability(value):
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not 0 <= value <= 1:
        raise ValueError("Invalid probability")
    return float(value)


def moved(reference, target):
    return int(abs(target - reference) / reference >= THRESHOLD - 1e-12)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")
    temporary.replace(path)


def download(path):
    url = "https://www.rarebird.network/api/v2/experiments/btc/dataset"
    for attempt in range(13):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Rarebird-BTC-pilot/1"})
            with urllib.request.urlopen(request, timeout=30) as response:
                content = response.read(8_000_001)
            if len(content) > 8_000_000:
                raise ValueError("BTC dataset exceeds its size budget")
            data = json.loads(content)
            if data.get("schema_version") != DATASET_VERSION or data.get("status") == "unavailable":
                raise ValueError("BTC dataset is not ready")
            write_json(path, data)
            return
        except (urllib.error.URLError, ValueError):
            if attempt == 12:
                raise
            time.sleep(20)


def prepare(data):
    if (data.get("schema_version") != DATASET_VERSION or data.get("instrument_id") != "kraken:XBTUSD"
            or data.get("baseline_version") != BASELINE_VERSION
            or data.get("target") != {"horizon_minutes": 60, "threshold_fraction": THRESHOLD}):
        raise ValueError("BTC dataset contract changed")
    generated = stamp(data["generated_at"])
    bars = {}
    for row in data["bars"]:
        at, observed = stamp(row["started_at"]), stamp(row["observed_at"])
        if (at in bars or at % BAR or at + BAR > observed or observed > generated
                or not all(isinstance(row[k], (int, float)) and math.isfinite(row[k]) and row[k] > 0
                           for k in ("open", "high", "low", "close"))
                or row["low"] > min(row["open"], row["close"]) or row["high"] < max(row["open"], row["close"])
                or not math.isfinite(row["volume"]) or row["volume"] < 0
                or not isinstance(row["trades"], int) or row["trades"] < 0):
            raise ValueError("Invalid or duplicate BTC candle")
        bars[at] = {**row, "known": observed}
    news, ids = [], set()
    for row in data["news"]:
        if row["id"] in ids:
            raise ValueError("Duplicate news identity")
        ids.add(row["id"])
        news.append({**row, "known": max(stamp(row["first_indexed_at"]), stamp(row["published_at"]))})
    oldest_news = min((stamp(n["first_indexed_at"]) for n in news), default=generated)
    skipped, examples, references = Counter(), [], set()
    for row in sorted(data["forecasts"], key=lambda row: row["reference_at"]):
        ref, issued, target = map(stamp, (row["reference_at"], row["issued_at"], row["target_at"]))
        if ref in references or ref % HOUR or target != ref + HOUR or not ref <= issued <= ref + 480 or issued > generated:
            raise ValueError("Invalid or duplicate forecast anchor")
        references.add(ref)
        probability(row["probability"])
        probability(row["baseline_probability"])
        window = [bars.get(at) for at in range(int(ref - HOUR - BAR), int(ref), BAR)]
        if any(bar is None or bar["known"] > issued or bar["trades"] <= 0 for bar in window):
            skipped["market_history_unavailable_at_issuance"] += 1
            continue
        closes = [bar["close"] for bar in window]
        if any(abs(math.log(b / a)) > .4 for a, b in zip(closes, closes[1:])):
            skipped["price_discontinuity"] += 1
            continue
        reference = row["reference_price_usd"]
        if not math.isclose(reference, closes[-1], rel_tol=1e-10):
            skipped["reference_price_mismatch"] += 1
            continue
        known_news = sorted((n for n in news if issued - 86400 <= n["known"] <= issued),
                            key=lambda n: (n["known"], n["id"]), reverse=True)
        features = {
            "return_5m": closes[-1] / closes[-2] - 1,
            "return_30m": closes[-1] / closes[-7] - 1,
            "return_60m": closes[-1] / closes[0] - 1,
            "volatility_1h": math.sqrt(sum(math.log(b / a) ** 2 for a, b in zip(closes, closes[1:]))),
            "range_1h": (max(b["high"] for b in window[1:]) - min(b["low"] for b in window[1:])) / reference,
            "volume_1h": sum(b["volume"] for b in window[1:]),
            "trades_1h": sum(b["trades"] for b in window[1:]),
            "hour_sin": math.sin((ref % 86400) / 86400 * 2 * math.pi),
            "hour_cos": math.cos((ref % 86400) / 86400 * 2 * math.pi),
            "news_count_24h": len(known_news), "publishers_24h": len({n["source"] for n in known_news}),
            "news_coverage_known": int(issued - 86400 >= max(stamp(data["coverage"]["since"]), oldest_news if data["coverage"]["news_truncated"] else 0)),
        }
        label = None
        if row["outcome"] in ("above", "at_or_below"):
            target_price = row["target_price_usd"]
            if target > generated or not isinstance(target_price, (float, int)) or not math.isfinite(target_price) or target_price <= 0:
                raise ValueError("Invalid resolved forecast")
            label = moved(reference, target_price)
        examples.append({"id": "btc-" + datetime.fromtimestamp(ref, timezone.utc).strftime("%Y%m%dT%H"),
                         "ref": ref, "features": features, "news": known_news[:10], "label": label, "forecast": row})
    return examples, dict(skipped)


def metrics(rows):
    result = {"scored": len(rows), "events": sum(r["label"] for r in rows)}
    for name in ("kumo", "existing", "base_rate"):
        cohort = [r for r in rows if name in r]
        probabilities = [(probability(r[name]), r["label"]) for r in cohort]
        result[name + "_brier"] = sum((p - y) ** 2 for p, y in probabilities) / len(cohort) if cohort else None
        result[name + "_log_loss"] = -sum(y * math.log(max(1e-7, min(1 - 1e-7, p)))
            + (1 - y) * math.log(max(1e-7, min(1 - 1e-7, 1 - p))) for p, y in probabilities) / len(cohort) if cohort else None
    calibration = []
    for bucket in range(5):
        group = [r for r in rows if "kumo" in r and min(4, int(r["kumo"] * 5)) == bucket]
        calibration.append({"from": bucket / 5, "to": (bucket + 1) / 5, "count": len(group),
                            "mean_probability": sum(r["kumo"] for r in group) / len(group) if group else None,
                            "event_rate": sum(r["label"] for r in group) / len(group) if group else None})
    result["calibration"] = calibration
    return result


def splits(examples):
    labeled = [e for e in examples if e["label"] is not None]
    if len(labeled) < 120:
        return None
    boundaries = [labeled[int(len(labeled) * fraction)]["ref"] for fraction in (.6, .7, .8)]
    # A label can be observed up to six hours after its target. Purge these boundaries.
    train = [e for e in labeled if e["ref"] + 7 * HOUR < boundaries[0]]
    validation = [e for e in labeled if boundaries[0] <= e["ref"] and e["ref"] + 7 * HOUR < boundaries[1]]
    native_test = [e for e in labeled if boundaries[1] <= e["ref"] and e["ref"] + 7 * HOUR < boundaries[2]]
    heldout = [e for e in labeled if e["ref"] >= boundaries[2]]
    cohorts = (train, validation, native_test, heldout)
    if any(not c for c in cohorts) or any(len({e["label"] for e in c}) < 2 for c in cohorts[:3]):
        return None
    return cohorts


def resolve_journal(journal, data):
    if journal.get("version") != VERSION:
        raise ValueError("Unexpected journal version")
    forecasts = {r["reference_at"]: r for r in data["forecasts"]}
    seen = set()
    for entry in journal["predictions"]:
        if entry["reference_at"] in seen:
            raise ValueError("Duplicate prospective prediction")
        seen.add(entry["reference_at"])
        probability(entry["probability"])
        if not stamp(entry["reference_at"]) <= stamp(entry["issued_at"]) <= stamp(entry["reference_at"]) + 480:
            raise ValueError("Prediction was recorded outside its issuance window")
        row = forecasts.get(entry["reference_at"])
        if entry["outcome"] != "pending":
            continue
        if row and row["outcome"] in ("above", "at_or_below") and row["target_price_usd"] is not None:
            if row["reference_price_usd"] != entry["reference_price_usd"]:
                raise ValueError("Reference price changed after prediction")
            entry.update(outcome="scored", label=moved(entry["reference_price_usd"], row["target_price_usd"]),
                         target_price_usd=row["target_price_usd"], resolved_at=data["generated_at"])
        elif (row and row["outcome"] == "missing") or stamp(data["generated_at"]) >= stamp(entry["target_at"]) + 6 * HOUR:
            entry["outcome"] = "missing"
    scored = [{"kumo": e["probability"], "existing": e["existing_probability"], "base_rate": e["base_rate_probability"], "label": e["label"]}
              for e in journal["predictions"] if e["outcome"] == "scored"]
    return {**metrics(scored), "issued": len(journal["predictions"]),
            "pending": sum(e["outcome"] == "pending" for e in journal["predictions"]),
            "missing": sum(e["outcome"] == "missing" for e in journal["predictions"])}


def train(examples, cohorts, directory):
    import pandas as pd
    import torch
    import kumo.engine as kumo
    from kumoapi.train import TrainingTableSpec
    from kumoapi.model_plan import RunMode
    from kumoapi.typing import Stype

    torch.manual_seed(42)
    torch.set_num_threads(2)
    source = directory / "source"
    source.mkdir(parents=True, exist_ok=True)
    kumo.configure(scratch_dir=str(directory / "scratch"))
    train_ids = {e["id"] for e in cohorts[0]}

    def save_sources(population):
        rows = [{"hour_id": e["id"], **e["features"],
                 "large_move": bool(e["label"]) if e["id"] in train_ids else None} for e in population]
        frame = pd.DataFrame(rows)
        frame["large_move"] = pd.array(frame.large_move, dtype="boolean")
        frame.to_parquet(source / "hours.parquet", index=False)
        arrivals = [{"news_id": e["id"] + ":" + n["id"], "hour_id": e["id"], "publisher": n["source"],
                     "age_minutes": (stamp(e["forecast"]["issued_at"]) - n["known"]) / 60}
                    for e in population for n in e["news"]]
        pd.DataFrame(arrivals, columns=["news_id", "hour_id", "publisher", "age_minutes"]).to_parquet(source / "news.parquet", index=False)
        return bool(arrivals)

    fitting = [e for cohort in cohorts[:3] for e in cohort]
    has_news = save_sources(fitting)
    connector = kumo.FileConnector(root_dir=str(source))
    tables = {"hours": kumo.Table.from_source_table(connector["hours.parquet"], primary_key="hour_id")}
    edges = []
    if has_news:
        tables["news"] = kumo.Table.from_source_table(connector["news.parquet"], primary_key="news_id").with_column("hour_id", stype=Stype.ID)
        edges = [kumo.Edge(src_table="news", fkey="hour_id", dst_table="hours")]
    graph = kumo.Graph(tables=tables, edges=edges)
    graph.validate()
    snapshot = graph.snapshot()
    query = kumo.PredictiveQuery(graph, "PREDICT hours.large_move FOR EACH hours.hour_id")
    labeled = [{"ENTITY1": e["id"], "TARGET1": bool(e["label"]), "SPLIT": split}
               for split, cohort in enumerate(cohorts[:3]) for e in cohort]
    pd.DataFrame(labeled).to_parquet(source / "labels.parquet", index=False)
    spec = TrainingTableSpec(split_col="SPLIT")
    training_table = kumo.TrainingTable.from_source_table(connector["labels.parquet"], spec, pq=query, snapshot=snapshot)
    plan = query.suggest_model_plan(snapshot, run_mode=RunMode.FAST, train_table_spec=spec)
    plan.training_job.num_experiments = 1
    plan.training_job.refit_trainval = False
    plan.training_job.refit_full = False
    plan.training_job.disable_explain = True
    plan.optimization.max_epochs = 3
    trainer = kumo.Trainer(plan)
    trainer.fit(training_table, snapshot=snapshot)

    # Held-out entities and their context are added only after fitting finishes.
    save_sources(examples)
    scoring_snapshot = graph.snapshot()
    scoring = cohorts[3] + [e for e in examples if e["label"] is None and e["forecast"]["outcome"] == "pending"]
    pd.DataFrame({"ENTITY1": [e["id"] for e in scoring]}).to_parquet(source / "scoring.parquet", index=False)
    prediction_table = kumo.PredictionTable.from_source_table(connector["scoring.parquet"], pq=query, snapshot=scoring_snapshot)
    output = trainer.predict(prediction_table, snapshot=scoring_snapshot, binary_classification_threshold=.5).frame
    entity = "ENTITY" if "ENTITY" in output.columns else "ENTITY1"
    if entity not in output.columns or "True_PROB" not in output.columns:
        raise ValueError("Kumo prediction schema changed: " + str(list(output.columns)))
    if output[entity].duplicated().any() or set(output[entity]) != {e["id"] for e in scoring}:
        raise ValueError("Kumo did not score the exact requested population")
    scores = {row[entity]: probability(row["True_PROB"]) for _, row in output.iterrows()}
    return scores, {"plan": plan.as_json(), "snapshot_id": snapshot.id,
                    "features": FEATURES, "news_features": ["publisher", "age_minutes"] if has_news else [],
                    "seed": 42, "epochs": 3, "accelerator": "cpu", "kumo_version": kumo.__version__,
                    "training_label_cutoff": iso(max(e["ref"] for e in cohorts[0]) + 7 * HOUR)}


def run(args):
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    dataset = Path(args.dataset)
    if args.download:
        download(dataset)
    data = json.loads(dataset.read_text())
    examples, skipped = prepare(data)
    state = Path(args.state)
    journal = json.loads(state.read_text()) if state.exists() else {"version": VERSION, "predictions": []}
    cohorts = splits(examples)
    baseline_rows = [{"existing": e["forecast"]["probability"], "base_rate": e["forecast"]["baseline_probability"], "label": e["label"]}
                     for e in examples if e["label"] is not None]
    report = {"version": VERSION, "as_of": data["generated_at"], "target": data["target"], "instrument_id": data["instrument_id"],
              "dataset_sha256": hashlib.sha256(dataset.read_bytes()).hexdigest(), "status": "warming_up", "training_ready": cohorts is not None,
              "eligible_hours": len(examples), "resolved_hours": len(baseline_rows),
              "raw_counts": {k: len(data[k]) for k in ("bars", "news", "forecasts")}, "skipped": skipped,
              "news_truncated": data["coverage"]["news_truncated"], "retrospective": metrics([]),
              "baseline_measurements": metrics(baseline_rows), "prospective": resolve_journal(journal, data),
              "note": "BTC close-to-close 1% move probability. Three CPU epochs validate integration. Lower Brier and log loss are better. Historical tests and prospective results have separate cohorts."}
    write_json(output / "journal.json", journal)
    write_json(output / "report.json", report)
    if cohorts is None:
        report["reason"] = "Need at least 120 resolved eligible hours and both classes in each purged fitting split."
        write_json(output / "report.json", report)
    if args.prepare_only:
        return report
    if cohorts is None:
        report["reason"] = "Need at least 120 resolved eligible hours and both classes in each purged fitting split."
        write_json(output / "report.json", report)
        return report
    try:
        scores, model = train(examples, cohorts, output.parent / "kumo-work")
        model_id = hashlib.sha256((report["dataset_sha256"] + iso(time.time())).encode()).hexdigest()[:24]
        model["id"] = model_id
        write_json(output / "model.json", {**model, "dataset_sha256": report["dataset_sha256"]})
        paired = [{"kumo": scores[e["id"]], "existing": e["forecast"]["probability"],
                   "base_rate": e["forecast"]["baseline_probability"], "label": e["label"]} for e in cohorts[3]]
        report.update(status="measuring", retrospective=metrics(paired), split_counts=[len(c) for c in cohorts])
        issued = time.time()
        current = [e for e in examples if e["id"] in scores and e["forecast"]["outcome"] == "pending"
                   and e["ref"] <= issued <= e["ref"] + 480]
        known_refs = {e["reference_at"] for e in journal["predictions"]}
        inserted = 0
        for e in current:
            f = e["forecast"]
            if f["reference_at"] in known_refs:
                continue
            journal["predictions"].append({"reference_at": f["reference_at"], "target_at": f["target_at"],
                "issued_at": iso(issued), "feature_cutoff": f["issued_at"], "reference_price_usd": f["reference_price_usd"],
                "probability": scores[e["id"]], "existing_probability": f["probability"], "base_rate_probability": f["baseline_probability"],
                "outcome": "pending", "dataset_sha256": report["dataset_sha256"], "model_id": model_id})
            inserted += 1
        report["prospective"] = resolve_journal(journal, data)
        report["new_predictions"] = inserted
        report["prospective_issue_status"] = "recorded" if inserted else "No new forecast inside the eight-minute issue window."
        write_json(output / "journal.json", journal)
    except Exception as error:
        report.update(status="model_error", reason=type(error).__name__ + ": " + str(error)[:500])
        write_json(output / "report.json", report)
        raise
    write_json(output / "report.json", report)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--state", default="previous/journal.json")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--prepare-only", action="store_true")
    result = run(parser.parse_args())
    print(json.dumps(result, indent=2))
