"""
Gatekeeper addon: enforces domain allowlist from policy.yaml.
Blocked requests → 403 + entry in /logs/blocked.jsonl.
"""
import json
import time
import yaml
from pathlib import Path
from mitmproxy import http, ctx


POLICY_PATH = Path("/app/policy.yaml")
BLOCKED_LOG = Path("/logs/blocked.jsonl")


def _load_policy():
    with open(POLICY_PATH) as f:
        return yaml.safe_load(f)


class Gatekeeper:
    def __init__(self):
        self.mode = "enforce"
        self.allow: list[str] = []
        self._reload()

    def _reload(self):
        policy = _load_policy()
        self.mode = policy.get("mode", "enforce")
        self.allow = [h.lower().lstrip(".") for h in policy.get("allow", [])]
        ctx.log.info(f"[gatekeeper] mode={self.mode} allow={len(self.allow)} hosts")

    def _allowed(self, host: str) -> bool:
        h = host.lower()
        for rule in self.allow:
            if h == rule or h.endswith("." + rule):
                return True
        return False

    def _log_block(self, host: str, method: str, path: str):
        entry = {
            "ts": time.time(),
            "event": "blocked",
            "host": host,
            "method": method,
            "path": path,
        }
        BLOCKED_LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(BLOCKED_LOG, "a") as f:
            f.write(json.dumps(entry) + "\n")
        ctx.log.warn(f"[gatekeeper] BLOCKED {host}{path}")

    # HTTPS tunnel (CONNECT) — checked before TLS handshake
    def http_connect(self, flow: http.HTTPFlow):
        host = flow.request.host
        if not self._allowed(host):
            if self.mode == "enforce":
                self._log_block(host, "CONNECT", "/")
                flow.response = http.Response.make(
                    403,
                    f"Blocked by gatekeeper policy: {host}",
                    {"content-type": "text/plain"},
                )

    # Decrypted HTTP/HTTPS requests
    def request(self, flow: http.HTTPFlow):
        host = flow.request.pretty_host
        if not self._allowed(host):
            if self.mode == "enforce":
                self._log_block(host, flow.request.method, flow.request.path)
                flow.response = http.Response.make(
                    403,
                    f"Blocked by gatekeeper policy: {host}",
                    {"content-type": "text/plain"},
                )
            else:
                self._log_block(host, flow.request.method, flow.request.path)


addons = [Gatekeeper()]
