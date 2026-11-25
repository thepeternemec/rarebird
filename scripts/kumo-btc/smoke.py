"""Exercise the pinned Kumo SDK on synthetic rows. These are integration checks."""
import math
import tempfile
from pathlib import Path

from pilot import FEATURES, HOUR, iso, train

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
with tempfile.TemporaryDirectory(prefix="btc-kumo-smoke-") as directory:
    scores, model = train(examples, cohorts, Path(directory))
    assert set(scores) == {e["id"] for e in cohorts[3]} | {pending["id"]}
    assert all(math.isfinite(p) and 0 <= p <= 1 for p in scores.values())
    print("Synthetic Kumo API integration passed with news relationships and a pending entity.")
    print({"scored_entities": len(scores), "kumo_version": model["kumo_version"]})
