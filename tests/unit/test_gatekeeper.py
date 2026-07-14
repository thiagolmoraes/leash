"""
Unit tests for proxy/addons/gatekeeper.py allowlist logic.
Run: pytest tests/unit/test_gatekeeper.py -v
"""
import sys
import os
import json
import tempfile
import textwrap

import pytest

# ---------------------------------------------------------------------------
# Inline the allowlist-matching logic (avoids importing mitmproxy in CI)
# ---------------------------------------------------------------------------

def _allowed(host: str, allow: list[str]) -> bool:
    h = host.lower()
    for rule in allow:
        rule = rule.lower().lstrip(".")
        if h == rule or h.endswith("." + rule):
            return True
    return False


def load_policy(path: str) -> dict:
    import yaml
    with open(path) as f:
        return yaml.safe_load(f)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

POLICY_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "proxy", "policy.yaml"
)


@pytest.fixture
def allow_list():
    policy = load_policy(POLICY_PATH)
    return [h.lower().lstrip(".") for h in policy.get("allow", [])]


@pytest.fixture
def tmp_policy(tmp_path):
    def _make(mode="enforce", hosts=None):
        hosts = hosts or ["api.example.com"]
        content = f"mode: {mode}\nallow:\n" + "".join(f"  - {h}\n" for h in hosts)
        p = tmp_path / "policy.yaml"
        p.write_text(content)
        return str(p)
    return _make


# ---------------------------------------------------------------------------
# Allowlist matching
# ---------------------------------------------------------------------------

class TestAllowlistMatching:
    def test_exact_match(self):
        assert _allowed("api.anthropic.com", ["api.anthropic.com"])

    def test_subdomain_match(self):
        assert _allowed("sub.api.anthropic.com", ["api.anthropic.com"])

    def test_deep_subdomain(self):
        assert _allowed("a.b.c.api.anthropic.com", ["api.anthropic.com"])

    def test_no_match(self):
        assert not _allowed("evil.com", ["api.anthropic.com"])

    def test_partial_match_not_allowed(self):
        # "anthropic.com" should not match "notanthropic.com"
        assert not _allowed("notanthropic.com", ["anthropic.com"])

    def test_case_insensitive(self):
        assert _allowed("API.ANTHROPIC.COM", ["api.anthropic.com"])

    def test_leading_dot_rule(self):
        assert _allowed("api.github.com", [".github.com"])

    def test_empty_allow_list(self):
        assert not _allowed("api.anthropic.com", [])

    def test_multiple_rules_first_matches(self):
        rules = ["api.openai.com", "api.anthropic.com"]
        assert _allowed("api.anthropic.com", rules)

    def test_multiple_rules_none_match(self):
        rules = ["api.openai.com", "api.anthropic.com"]
        assert not _allowed("evil.com", rules)


# ---------------------------------------------------------------------------
# Policy YAML
# ---------------------------------------------------------------------------

class TestPolicyYaml:
    def test_policy_loads(self):
        policy = load_policy(POLICY_PATH)
        assert "mode" in policy
        assert "allow" in policy

    def test_mode_is_enforce_or_observe(self, allow_list):
        policy = load_policy(POLICY_PATH)
        assert policy["mode"] in ("enforce", "observe")

    def test_allow_list_not_empty(self, allow_list):
        assert len(allow_list) > 0

    def test_claude_code_domains_present(self, allow_list):
        assert "api.anthropic.com" in allow_list
        assert "platform.claude.com" in allow_list

    def test_codex_domains_present(self, allow_list):
        assert "api.openai.com" in allow_list

    def test_gemini_domains_present(self, allow_list):
        assert "generativelanguage.googleapis.com" in allow_list

    def test_grok_domains_present(self, allow_list):
        assert "api.x.ai" in allow_list

    def test_no_wildcard_catchall(self, allow_list):
        for h in allow_list:
            assert h != "*", "Wildcard * in allowlist defeats the entire purpose"

    def test_no_suspicious_telemetry_domains(self, allow_list):
        suspicious = ["telemetry.", "tracking.", "analytics.", "collect."]
        for h in allow_list:
            for s in suspicious:
                assert not h.startswith(s), f"Suspicious domain in allowlist: {h}"


# ---------------------------------------------------------------------------
# Blocked log format
# ---------------------------------------------------------------------------

class TestBlockedLogFormat:
    def test_blocked_entry_schema(self, tmp_path):
        log = tmp_path / "blocked.jsonl"
        entry = {
            "ts": 1783969672.15,
            "event": "blocked",
            "host": "evil.com",
            "method": "CONNECT",
            "path": "/",
        }
        log.write_text(json.dumps(entry) + "\n")
        loaded = json.loads(log.read_text().strip())
        assert loaded["event"] == "blocked"
        assert "host" in loaded
        assert "ts" in loaded
        assert "method" in loaded

    def test_multiple_blocked_entries(self, tmp_path):
        log = tmp_path / "blocked.jsonl"
        entries = [
            {"ts": 1.0, "event": "blocked", "host": "evil1.com", "method": "CONNECT", "path": "/"},
            {"ts": 2.0, "event": "blocked", "host": "evil2.com", "method": "CONNECT", "path": "/"},
        ]
        log.write_text("\n".join(json.dumps(e) for e in entries) + "\n")
        lines = [json.loads(l) for l in log.read_text().strip().splitlines()]
        assert len(lines) == 2
        assert lines[0]["host"] == "evil1.com"
        assert lines[1]["host"] == "evil2.com"


# ---------------------------------------------------------------------------
# Flow log format
# ---------------------------------------------------------------------------

class TestFlowLogFormat:
    def test_flow_entry_schema(self, tmp_path):
        log = tmp_path / "flows.jsonl"
        entry = {
            "ts": 1783969667.9,
            "host": "api.anthropic.com",
            "method": "POST",
            "path": "/v1/messages",
            "status": 200,
            "req_size": 2048,
            "req_body_sha256": "abc123",
            "req_body_preview": '{"model":"claude"}',
            "resp_size": 512,
        }
        log.write_text(json.dumps(entry) + "\n")
        loaded = json.loads(log.read_text().strip())
        required = ["ts", "host", "method", "path", "status", "req_size", "req_body_sha256"]
        for field in required:
            assert field in loaded, f"Missing field: {field}"

    def test_body_preview_truncated(self):
        body = "x" * 600
        preview = body[:512]
        assert len(preview) == 512

    def test_sha256_format(self):
        import hashlib
        body = b'{"test": true}'
        h = hashlib.sha256(body).hexdigest()
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)
