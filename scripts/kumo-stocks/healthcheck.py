"""Local container health. This does not call the API or publish a prediction."""
import json
import sys
import time
from pathlib import Path
from datetime import datetime


def healthy(record, now):
    try:
        seen = datetime.fromisoformat(record["last_seen_at"].replace("Z", "+00:00")).timestamp()
        return (-5 <= now - seen <= 180 and record["state"] not in ("stopped", "degraded")
                and not record.get("heartbeat_error_code"))
    except (KeyError, ValueError, TypeError):
        return False


if __name__ == "__main__":
    try:
        record = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else "/data/status.json").read_text())
        sys.exit(0 if healthy(record, time.time()) else 1)
    except (OSError, ValueError):
        sys.exit(1)
