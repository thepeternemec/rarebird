"""Exercise the pinned Kumo SDK on synthetic rows. These are integration checks."""
import math
import tempfile
from pathlib import Path

from pilot import FEATURES, HOUR, iso, train
import feed_context

examples = []
for index in range(240):
    examples.append({
        "id": f"synthetic-btc-{index:04d}", "ref": index * HOUR, "label": index % 2,
        "features": {name: math.sin(index / (position + 1)) for position, name in enumerate(FEATURES)},
        "news": [{"id": str(index), "source": "Publisher " + str(index % 3), "known": index * HOUR - 60}],
        "forecast": {"outcome": "above", "issued_at": iso(index * HOUR + 60)},
    })
cohorts = (examples[:120], examples[128:152], examples[160:184], examples[192:])
pending = {**examples[-1], "id": "synthetic-btc-pending", "ref": 240 * HOUR, "label": None,
           "forecast": {"outcome": "pending", "issued_at": iso(240 * HOUR + 60)}}
examples.append(pending)
for e in examples:
    cutoff = e["ref"]
    e["context"] = {}
    for kind in feed_context.KINDS:
        e["context"][kind] = [{
            "id": kind + ":" + e["id"], "kind": kind, "entity_id": feed_context.BTC if kind == "news" else "context:entity",
            "asset_class": "crypto", "source": "Synthetic publisher", "source_url": "https://example.com",
            "text": "Company reports strong growth in quarterly revenue and lower debt" if kind in feed_context.TEXT_KINDS else "",
            "values": {"measurement": math.sin(cutoff / 3600)}, "categories": {"ticker": "BTC"},
            "related_ids": [], "known": cutoff - 60, "event": cutoff - 120, "expires": cutoff + 3600,
        }]
    e["extra_features"] = {name: 1 for name in feed_context.EXTRA_FEATURES}
with tempfile.TemporaryDirectory(prefix="btc-kumo-smoke-", dir=Path.cwd()) as directory:
    relative_directory = Path(directory).relative_to(Path.cwd())
    original, _ = train(examples, cohorts, relative_directory / "metadata")
    scores, model = train(examples, cohorts, relative_directory / "shared", expanded=True)
    assert set(original) == set(scores)
    assert set(model["context_tables"]) == set(feed_context.KINDS)
    assert model["text_encoder"] == "glove.6B-50d"
    assert "context_news.text" in model["text_columns"]
    assert "context_interpretation.text" in model["text_columns"]
    assert set(scores) == {e["id"] for e in cohorts[3]} | {pending["id"]}
    assert all(math.isfinite(p) and 0 <= p <= 1 for p in scores.values())
    print("Synthetic Kumo API integration passed for both variants, 14 feed types, text encoding and a pending entity.")
    print({"scored_entities": len(scores), "kumo_version": model["kumo_version"]})
