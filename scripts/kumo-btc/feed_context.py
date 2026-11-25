"""Shared public-feed context. Selection is frozen before each forecast's original issue time."""
from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

KINDS = ("news", "interpretation", "discovery", "filing", "financial", "market_bar", "market_book",
         "market_quote", "funding", "dex_volume", "stablecoins", "sentiment", "tvl", "chain")
BTC = "b_06c91290de1c"
TEXT_KINDS = {"news", "interpretation", "discovery", "filing", "financial"}
EXTRA_FEATURES = [name for kind in KINDS for name in ("ctx_" + kind + "_count", "ctx_" + kind + "_present")]
CATEGORY_COLUMNS = ("category", "direction", "event_state", "channel", "metric", "period", "form",
                    "classification", "symbol", "ticker", "basis", "affected_entities")
CAPS = {kind: 12 for kind in KINDS}
CAPS.update(news=48, market_bar=24, market_quote=50, tvl=16)


def stamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("A feed timestamp must include a timezone")
    return parsed.timestamp()


def iso(value):
    return datetime.fromtimestamp(value, timezone.utc).isoformat().replace("+00:00", "Z")


def download(path, until, require_export=True):
    """A bounded recent export per feed, with one fixed time window for every page."""
    since = iso(stamp(until) - 30 * 86400)

    def one(kind):
        started = time.monotonic()
        records, cursor, seen = [], None, set()
        cap = 24000 if kind == "market_bar" else 12000 if kind == "news" else 4000
        coverage, status = {}, "warming_up"
        while len(records) < cap:
            args = {"kind": kind, "since": since, "until": until, "limit": 1000, "sampling": "hourly"}
            if cursor:
                args["cursor"] = cursor
            url = "https://www.rarebird.network/api/v2/kumo-feeds?" + urllib.parse.urlencode(args)
            for attempt in range(4):
                try:
                    request = urllib.request.Request(url, headers={"User-Agent": "Rarebird-Kumo-feeds/2"})
                    with urllib.request.urlopen(request, timeout=30) as response:
                        content = response.read(8_000_001)
                    if len(content) > 8_000_000:
                        raise ValueError("Feed page exceeded its size budget")
                    page = json.loads(content)
                    if (page.get("schema_version") != "kumo-feeds-v1" or page.get("kind") != kind
                            or page.get("since") != since or page.get("until") != until
                            or page.get("status") not in ("ready", "warming_up")):
                        raise ValueError("Feed export contract changed")
                    break
                except (OSError, ValueError):
                    if attempt == 3:
                        raise
                    time.sleep(3)
            records.extend(page["records"])
            coverage, status = page["coverage"], page["status"]
            cursor = page["next_cursor"]
            if not cursor:
                break
            if cursor in seen:
                raise ValueError("Feed pagination did not advance")
            seen.add(cursor)
        return records, {"status": status, "records": len(records), "truncated": bool(cursor), "download_seconds": round(time.monotonic() - started, 3), **coverage}

    if require_export:
        probe = "https://www.rarebird.network/api/v2/kumo-feeds?kind=funding&limit=1&sampling=hourly"
        for attempt in range(13):
            try:
                with urllib.request.urlopen(probe, timeout=15) as response:
                    probe_page = json.load(response)
                    if (probe_page.get("schema_version") != "kumo-feeds-v1"
                            or probe_page.get("coverage", {}).get("sampling") != "hourly"):
                        raise ValueError("The shared feed route has not deployed")
                break
            except (OSError, ValueError):
                if attempt == 12:
                    raise
                time.sleep(20)
    output, coverage = [], {}
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {kind: executor.submit(one, kind) for kind in KINDS}
        for kind, future in futures.items():
            try:
                records, report = future.result()
                output.extend(records)
                coverage[kind] = report
            except Exception as error:
                # Absence remains explicit; other source histories still train.
                coverage[kind] = {"status": "unavailable", "records": 0, "truncated": False,
                                  "error": type(error).__name__, "detail": str(error)[:180]}
    for kind, state in coverage.items():
        print("Feed", kind, "status", state["status"], "records", state["records"], "truncated", state["truncated"], "error", state.get("error"), flush=True)
    result = {"schema_version": "kumo-context-v1", "since": since, "until": until,
              "records": output, "coverage": coverage}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result, allow_nan=False) + "\n")
    return result


def records_for_model(data, btc_dataset):
    if data.get("schema_version") != "kumo-context-v1":
        raise ValueError("Unexpected shared feed dataset")
    end = stamp(data["until"])
    records = {r["id"]: r for r in data["records"]}
    if len(records) != len(data["records"]):
        raise ValueError("Duplicate shared feed identity")
    # Preserve the longer BTC headline history when the catalog-wide export is capped.
    for news in btc_dataset["news"]:
        if news.get("title") and news.get("url"):
            available = max(stamp(news["published_at"]), stamp(news["first_indexed_at"]))
            key = "news:" + news["id"]
            records.setdefault(key, {"id": key, "kind": "news", "entity_id": BTC, "asset_class": "crypto",
                "source": news["source"], "source_url": news["url"], "event_at": news["published_at"],
                "available_at": iso(available), "expires_at": iso(available + 86400),
                "text": news["title"], "values": {}, "categories": {"ticker": "BTC"}, "related_ids": []})
    result = []
    for row in records.values():
        if (row["kind"] not in KINDS or not row["entity_id"] or not row["source"]
                or row["asset_class"] not in ("equity", "crypto", "macro", "chain")
                or not isinstance(row["text"], str) or len(row["text"]) > 4000):
            raise ValueError("Invalid shared feed record")
        event, known, expires = map(stamp, (row["event_at"], row["available_at"], row["expires_at"]))
        if not event <= known <= end or expires <= known:
            raise ValueError("Invalid feed availability")
        for key, value in row["values"].items():
            if key in {"label", "target", "outcome", "target_price_usd", "probability", "baseline_probability"}:
                raise ValueError("Target or comparison output cannot be a feed feature")
            if value is not None and (isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value)):
                raise ValueError("Invalid feed numerical measurement")
        result.append({**row, "known": known, "event": event, "expires": expires})
    return sorted(result, key=lambda r: (r["known"], r["id"]), reverse=True)


def select_context(records, cutoff):
    pools = defaultdict(list)
    for row in records:
        if row["known"] <= cutoff < row["expires"]:
            pools[row["kind"]].append(row)
    selected = {}
    for kind in KINDS:
        rows = pools[kind]
        if kind == "news":
            # Give BTC, other crypto and equities room without letting one topic flood the sample.
            lanes = ([r for r in rows if r["entity_id"] == BTC],
                     [r for r in rows if r["entity_id"] != BTC and r["asset_class"] == "crypto"],
                     [r for r in rows if r["asset_class"] == "equity"],
                     [r for r in rows if r["asset_class"] in ("macro", "chain")])
            chosen, urls = [], set()
            for lane, maximum in zip(lanes, (16, 16, 12, 4)):
                counts, accepted = Counter(), 0
                for row in lane:
                    entity = row["entity_id"]
                    if row["source_url"] in urls or counts[entity] >= (16 if entity == BTC else 3):
                        continue
                    chosen.append(row)
                    urls.add(row["source_url"])
                    counts[entity] += 1
                    accepted += 1
                    if accepted == maximum:
                        break
            selected[kind] = chosen
            continue
        chosen, counts = [], Counter()
        for row in rows:
            # Only the newest revision of an event and newest live observation per identity.
            key = (row["entity_id"], row["categories"].get("event_id", row["id"])) if kind == "interpretation" else (
                row["entity_id"], row["categories"].get("metric", "")) if kind == "financial" else (
                row["id"],) if kind in ("filing", "discovery") else (row["entity_id"],)
            limit = 3 if kind == "market_bar" else 1
            if counts[key] >= limit:
                continue
            chosen.append(row)
            counts[key] += 1
            if len(chosen) == CAPS[kind]:
                break
        selected[kind] = chosen
    return selected


def attach(examples, data, btc_dataset):
    records = records_for_model(data, btc_dataset)
    for e in examples:
        e["context"] = select_context(records, stamp(e["forecast"]["issued_at"]))
        e["extra_features"] = {name: value for kind in KINDS for name, value in (
            ("ctx_" + kind + "_count", len(e["context"][kind])),
            ("ctx_" + kind + "_present", int(bool(e["context"][kind]))))}
    return {"source_coverage": data["coverage"], "exported_records": len(records),
            "hours_with_context": {kind: sum(bool(e["context"][kind]) for e in examples) for kind in KINDS},
            "selected_records": {kind: sum(len(e["context"][kind]) for e in examples) for kind in KINDS},
            "sampling_caps_per_hour": CAPS,
            "note": "Missing and capped feeds are explicit. New snapshot histories start at first capture; earlier hours stay missing."}


def table_specs(population):
    """Freeze the source schema from training observations only."""
    specs = {}
    for kind in KINDS:
        rows = [r for e in population for r in e.get("context", {}).get(kind, [])]
        if rows:
            specs[kind] = {"numbers": sorted({k for r in rows for k in r["values"]}),
                           "text": kind in TEXT_KINDS and any(r["text"].strip() for r in rows)}
    return specs


def graph_rows(population, specs):
    entities, tables = {}, {}
    for kind, spec in specs.items():
        rows = []
        for e in population:
            cutoff = stamp(e["forecast"]["issued_at"])
            for r in e.get("context", {}).get(kind, []):
                entity_key = e["id"] + ":" + r["entity_id"]
                entities[entity_key] = {"entity_key": entity_key, "hour_id": e["id"],
                    "asset_class": r["asset_class"], "ticker": r["categories"].get("ticker", r["categories"].get("symbol", "")),
                    "relation": "target" if r["entity_id"] == BTC else "context"}
                row = {"record_key": e["id"] + ":" + r["id"], "hour_id": e["id"], "entity_key": entity_key,
                       "source": r["source"], "asset_class": r["asset_class"],
                       "age_minutes": (cutoff - r["known"]) / 60, "event_age_minutes": (cutoff - r["event"]) / 60}
                row.update({key: r["categories"].get(key, "unknown") for key in CATEGORY_COLUMNS})
                row.update({"value_" + key: r["values"].get(key) for key in spec["numbers"]})
                if spec["text"]:
                    row["text"] = r["text"]
                rows.append(row)
        tables[kind] = rows
    return list(entities.values()), tables
