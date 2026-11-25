"""Exercise the pinned Kumo SDK on synthetic rows. These are integration checks."""
import math
import tempfile
from pathlib import Path

from pilot import FEATURES, HOUR, train

examples = []
for index in range(240):
    examples.append({
        "id": f"synthetic-btc-{index:04d}", "ref": index * HOUR, "label": index % 2,
        "features": {name: math.sin(index / (position + 1)) for position, name in enumerate(FEATURES)},
        "news": [], "forecast": {"outcome": "above"},
    })
cohorts = (examples[:120], examples[128:152], examples[160:184], examples[192:])
with tempfile.TemporaryDirectory(prefix="btc-kumo-smoke-") as directory:
    scores, model = train(examples, cohorts, Path(directory))
    assert set(scores) == {e["id"] for e in cohorts[3]}
    assert all(math.isfinite(p) and 0 <= p <= 1 for p in scores.values())
    print("Synthetic Kumo API integration passed.")
    print({"scored_entities": len(scores), "kumo_version": model["kumo_version"]})
