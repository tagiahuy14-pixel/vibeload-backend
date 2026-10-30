"""Observe an idle service without restarting/redeploying it."""
import argparse
import datetime as dt
import json
import time
from pathlib import Path
from audit_production import api, OUT, save


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--idle-seconds", type=int, default=1020)
    args = parser.parse_args()
    marker = json.loads((OUT / "album.json").read_text(encoding="utf-8"))
    result = {"started": dt.datetime.now(dt.timezone.utc).isoformat(),
              "agent_idle_seconds": args.idle_seconds, "old_job_id": marker["job_id"],
              "old_job_created_at": marker["events"][-1]["response"].get("created_at"),
              "limitation": "Other visitors may keep the service awake; Render runtime logs are needed to confirm sleep.",
              "events": []}
    deadline = time.monotonic() + args.idle_seconds
    (OUT / "cold-start-pending.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print("Idle probe started; no production requests until the deadline.", flush=True)
    while time.monotonic() < deadline:
        time.sleep(min(60, max(0, deadline - time.monotonic())))
    for attempt in range(3):
        try:
            meta, body = api("/api/health")
            result["events"].append({"check": "wake-health", **meta, "body": body})
            if meta["status"] == 200 and body.get("status") == "ok":
                break
        except Exception as error:
            result["events"].append({"check": "wake-health", "error": str(error)})
        time.sleep(2 ** attempt)
    for suffix in ("", "/file"):
        meta, body = api("/api/downloads/" + marker["job_id"] + suffix)
        result["events"].append({"check": "old-job" + suffix, **meta, "body": body})
    result["finished"] = dt.datetime.now(dt.timezone.utc).isoformat()
    save("cold-start", result)
