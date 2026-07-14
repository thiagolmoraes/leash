"""
Flowlog addon: logs every decrypted request/response to /logs/flows.jsonl.
Fields include body hash to detect data exfiltration by content fingerprint.
"""
import hashlib
import json
import time
from pathlib import Path
from mitmproxy import http


FLOWS_LOG = Path("/logs/flows.jsonl")


class Flowlog:
    def response(self, flow: http.HTTPFlow):
        req = flow.request
        resp = flow.response

        body = req.content or b""
        body_hash = hashlib.sha256(body).hexdigest() if body else None
        body_size = len(body)

        # Truncate body preview to 512 bytes (avoid storing API keys / full payloads in plain log)
        body_preview = body[:512].decode("utf-8", errors="replace") if body else None

        entry = {
            "ts": time.time(),
            "host": req.pretty_host,
            "method": req.method,
            "path": req.path,
            "status": resp.status_code if resp else None,
            "req_size": body_size,
            "req_body_sha256": body_hash,
            "req_body_preview": body_preview,
            "resp_size": len(resp.content) if resp and resp.content else 0,
        }

        FLOWS_LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(FLOWS_LOG, "a") as f:
            f.write(json.dumps(entry) + "\n")


addons = [Flowlog()]
