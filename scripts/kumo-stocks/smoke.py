"""Exercise actual Kumo graph fitting and prediction on synthetic observations only."""
import tempfile
from predict import FEATURES, fit_model

cohorts = []
for group in range(4):
    rows = []
    for index in range(16):
        rows.append({"id": f"smoke-{group}-{index}", "symbol": "NVDA" if index%2 else "AAPL",
                     "features": {key: float(index%2)+index*.001 for key in FEATURES},
                     "news": [], "label": index%2, "issued": group*86400+index*60, "known": group*86400+index*60+1020,
                     "active": False})
    cohorts.append(rows)
with tempfile.TemporaryDirectory(prefix="rarebird-stock-kumo-") as directory:
    score, model = fit_model([row for cohort in cohorts for row in cohort], cohorts, directory, epochs=1)
    result = score(cohorts[3])
    assert len(result) == 16 and all(0 <= value <= 1 for value in result.values())
    assert model["engine"] == "kumo-engine" and model["holdout"]["count"] == 16
    print("Actual Kumo graph, fit, held-out evaluation and repeat scoring passed.")
