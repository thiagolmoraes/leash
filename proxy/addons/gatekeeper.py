"""
Gatekeeper addon: enforces domain allowlist from policy.yaml.
Blocked requests → 403 + entry in /logs/blocked.jsonl.
"""
import json
import time
from pathlib import Path


POLICY_PATH = Path("/app/policy.yaml")
BLOCKED_LOG = Path("/logs/blocked.jsonl")


def normalize_rules(allow: list[str]) -> list[str]:
    """Lowercase rules and strip leading dots for suffix matching."""
    return [h.lower().lstrip(".") for h in allow]


def host_allowed(host: str, allow: list[str]) -> bool:
    """True if `host` matches any rule (exact or dotted-suffix). Pure, stdlib-only.

    `allow` must already be normalized via normalize_rules().
    """
    h = host.lower()
    for rule in allow:
        if h == rule or h.endswith("." + rule):
            return True
    return False


def _load_policy():
    import yaml
    with open(POLICY_PATH) as f:
        return yaml.safe_load(f)


# mitmproxy is imported lazily inside methods so this module can be imported
# by unit tests (which exercise host_allowed / normalize_rules) without the dep.


class Gatekeeper:
    def __init__(self):
        self.mode = "enforce"
        self.allow: list[str] = []
        self._reload()

    def _reload(self):
        from mitmproxy import ctx
        policy = _load_policy()
        self.mode = policy.get("mode", "enforce")
        self.allow = normalize_rules(policy.get("allow", []))
        ctx.log.info(f"[gatekeeper] mode={self.mode} allow={len(self.allow)} hosts")

    def _allowed(self, host: str) -> bool:
        return host_allowed(host, self.allow)

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
        from mitmproxy import ctx
        ctx.log.warn(f"[gatekeeper] BLOCKED {host}{path}")

    # HTTPS tunnel (CONNECT) — checked before TLS handshake
    def http_connect(self, flow):
        from mitmproxy import http
        host = flow.request.host
        if not self._allowed(host):
            # Always log the disallowed host; only block when enforcing.
            self._log_block(host, "CONNECT", "/")
            if self.mode == "enforce":
                flow.response = http.Response.make(
                    403,
                    f"Blocked by gatekeeper policy: {host}",
                    {"content-type": "text/plain"},
                )

    # Decrypted HTTP/HTTPS requests
    def request(self, flow):
        from mitmproxy import http
        host = flow.request.pretty_host
        if not self._allowed(host):
            # Always log the disallowed request; only block when enforcing.
            self._log_block(host, flow.request.method, flow.request.path)
            if self.mode == "enforce":
                flow.response = http.Response.make(
                    403,
                    f"Blocked by gatekeeper policy: {host}",
                    {"content-type": "text/plain"},
                )


# mitmproxy loads `addons` at startup (in the container, where /app/policy.yaml
# exists). Guarded so importing this module for unit tests has no side effects.
if POLICY_PATH.exists():
    addons = [Gatekeeper()]
else:
    addons = []
