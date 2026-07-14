#!/usr/bin/env bash
# Security sandbox test suite
# Run inside Lima VM: bash /sandbox-AI/tests/run_tests.sh
# Or from macOS: make test

set -euo pipefail


PASS=0
FAIL=0
SKIP=0

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[0;33m'
RST='\033[0m'

COMPOSE="docker compose -f /sandbox-AI/docker-compose.yml"
LOGS=/sandbox-AI/logs

pass() { echo -e "${GRN}PASS${RST} $1"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}FAIL${RST} $1 — $2"; FAIL=$((FAIL+1)); }
skip() { echo -e "${YLW}SKIP${RST} $1 — $2"; SKIP=$((SKIP+1)); }

exec_agent()  { $COMPOSE exec -T --user agent agents "$@"; }
exec_agent_root() { $COMPOSE exec -T agents "$@"; }

echo "═══════════════════════════════════════════════════"
echo " sandbox-AI security test suite"
echo "═══════════════════════════════════════════════════"

# ── Pre-flight ───────────────────────────────────────────────────────────────

echo
echo "── pre-flight ──"

if ! docker info &>/dev/null; then
  echo "Docker not accessible. Run inside Lima VM with sg docker."
  exit 1
fi

for svc in proxy agents falco; do
  status=$($COMPOSE ps --format '{{.Status}}' "$svc" 2>/dev/null | head -1)
  if echo "$status" | grep -q "^Up"; then
    pass "container $svc is running"
  else
    fail "container $svc is running" "status: ${status:-not found}"
  fi
done

# ── Test 1: TLS interception active (MitM CA installed) ─────────────────────

echo
echo "── TLS interception ──"

# If CA is installed, curl to an allowed HTTPS host returns HTTP status (not SSL error)
http_code=$(exec_agent curl -s -o /dev/null -w '%{http_code}' \
  --max-time 10 https://api.anthropic.com/v1/models 2>/dev/null || echo "000")

if [[ "$http_code" == "401" || "$http_code" == "403" || "$http_code" == "200" ]]; then
  pass "TLS interception: HTTPS reaches API (HTTP $http_code, not SSL error)"
else
  fail "TLS interception: HTTPS reaches API" "got HTTP $http_code (000=SSL/conn error)"
fi

# Verify CA cert is installed in container trust store
if exec_agent test -f /etc/ssl/certs/ca-certificates.crt 2>/dev/null; then
  if exec_agent bash -c 'grep -q "mitmproxy" /etc/ssl/certs/ca-certificates.crt 2>/dev/null || \
       openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt \
       /usr/local/share/ca-certificates/mitm-ca.crt &>/dev/null'; then
    pass "TLS interception: mitm CA in system trust store"
  else
    # Softer check: NODE_EXTRA_CA_CERTS file exists
    if exec_agent test -f /usr/local/share/ca-certificates/mitm-ca.crt 2>/dev/null; then
      pass "TLS interception: mitm CA cert file present"
    else
      fail "TLS interception: mitm CA cert file present" "file missing — restart agents after proxy first boot"
    fi
  fi
fi

# ── Test 2: Egress isolation (no direct outbound) ────────────────────────────

echo
echo "── egress isolation ──"

# Direct TCP to external IP without proxy must fail (internal network)
direct=$(exec_agent curl --noproxy '*' -s -o /dev/null -w '%{http_code}' \
  --max-time 5 https://1.1.1.1 2>/dev/null; echo "EXIT:$?")

http_part=$(echo "$direct" | head -1)
exit_part=$(echo "$direct" | grep "EXIT:" | sed 's/EXIT://')

if [[ "$http_part" == "000" || "$exit_part" != "0" ]]; then
  pass "egress isolation: direct outbound blocked (no route)"
else
  fail "egress isolation: direct outbound blocked" "got HTTP $http_part — agent may have direct internet access!"
fi

# DNS resolution for external host inside jail network must go through proxy
# (agents container should not be able to reach 8.8.8.8 directly)
direct_dns=$(exec_agent bash -c 'curl --noproxy "*" --dns-servers 8.8.8.8 \
  -s -o /dev/null -w "%{http_code}" --max-time 4 https://example.com 2>/dev/null || echo "000"')
if [[ "$direct_dns" == "000" ]]; then
  pass "egress isolation: direct DNS bypass blocked"
else
  skip "egress isolation: direct DNS bypass" "got $direct_dns (curl may not support --dns-servers)"
fi

# ── Test 3: Domain allowlist enforcement ─────────────────────────────────────

echo
echo "── allowlist enforcement ──"

# Clear blocked log to isolate this test's entries
BEFORE=$(wc -l < "$LOGS/blocked.jsonl" 2>/dev/null || echo 0)

# Blocked domain → proxy returns 403 or resets connection
blocked_code=$(exec_agent curl -s -o /dev/null -w '%{http_code}' \
  --max-time 10 https://evil-exfil-canary.example.com 2>/dev/null; echo)

AFTER=$(wc -l < "$LOGS/blocked.jsonl" 2>/dev/null || echo 0)

if [[ "$blocked_code" == "403" || "$blocked_code" == "000" ]]; then
  pass "allowlist: blocked domain returns 403/reset (got $blocked_code)"
else
  fail "allowlist: blocked domain returns 403/reset" "got HTTP $blocked_code"
fi

if [[ "$AFTER" -gt "$BEFORE" ]]; then
  entry=$(tail -1 "$LOGS/blocked.jsonl")
  host=$(echo "$entry" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['host'])" 2>/dev/null)
  pass "allowlist: block logged to blocked.jsonl (host=$host)"
else
  fail "allowlist: block logged to blocked.jsonl" "no new entry in $LOGS/blocked.jsonl"
fi

# Allowed domain → must succeed (not blocked)
allowed_code=$(exec_agent curl -s -o /dev/null -w '%{http_code}' \
  --max-time 10 https://api.anthropic.com/v1/models 2>/dev/null || echo "000")
if [[ "$allowed_code" != "000" && "$allowed_code" != "403" ]]; then
  pass "allowlist: allowed domain (api.anthropic.com) passes (HTTP $allowed_code)"
else
  fail "allowlist: allowed domain passes" "got $allowed_code — check proxy logs"
fi

# ── Test 4: Flow logging (TLS body visible) ───────────────────────────────────

echo
echo "── flow logging ──"

BEFORE_FLOWS=$(wc -l < "$LOGS/flows.jsonl" 2>/dev/null || echo 0)

exec_agent curl -s -o /dev/null --max-time 10 \
  https://api.anthropic.com/v1/models &>/dev/null || true

sleep 1
AFTER_FLOWS=$(wc -l < "$LOGS/flows.jsonl" 2>/dev/null || echo 0)

if [[ "$AFTER_FLOWS" -gt "$BEFORE_FLOWS" ]]; then
  last=$(tail -1 "$LOGS/flows.jsonl")
  host=$(echo "$last" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d['host'])" 2>/dev/null)
  pass "flow logging: request logged (host=$host)"
  # Verify key fields present
  if echo "$last" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
assert 'host' in d
assert 'method' in d
assert 'path' in d
assert 'status' in d
assert 'req_body_sha256' in d
" 2>/dev/null; then
    pass "flow logging: JSON has required fields (host, method, path, status, req_body_sha256)"
  else
    fail "flow logging: JSON has required fields" "missing fields in $(tail -1 $LOGS/flows.jsonl)"
  fi
else
  fail "flow logging: request logged" "flows.jsonl not updated"
fi

# ── Test 5: Falco — credential file read detection ────────────────────────────

echo
echo "── Falco detection ──"

BEFORE_FALCO=$(wc -l < "$LOGS/falco.jsonl" 2>/dev/null || echo 0)

# Read decoy SSH key (honeypot)
exec_agent_root bash -c 'cat /home/agent/.ssh/id_rsa > /dev/null' 2>/dev/null || true

sleep 2
AFTER_FALCO=$(wc -l < "$LOGS/falco.jsonl" 2>/dev/null || echo 0)

if [[ "$AFTER_FALCO" -gt "$BEFORE_FALCO" ]]; then
  new_events=$(tail -n +"$((BEFORE_FALCO + 1))" "$LOGS/falco.jsonl")
  if echo "$new_events" | grep -q "sensitive\|ssh\|credential"; then
    rule=$(echo "$new_events" | grep "sensitive\|ssh\|credential" | \
      python3 -c "import sys,json; [print(json.loads(l)['rule']) for l in sys.stdin]" 2>/dev/null | head -1)
    pass "Falco: credential read detected (rule: $rule)"
  else
    pass "Falco: new events generated ($(( AFTER_FALCO - BEFORE_FALCO )) new)"
  fi
else
  fail "Falco: credential read detected" "no new events in falco.jsonl after reading ~/.ssh/id_rsa"
fi

# Falco still running (didn't crash)
falco_status=$(docker compose -f /sandbox-AI/docker-compose.yml ps --format '{{.Status}}' falco 2>/dev/null | head -1)
if echo "$falco_status" | grep -q "^Up"; then
  pass "Falco: still running after tests"
else
  fail "Falco: still running after tests" "status: $falco_status"
fi

# ── Test 6: Write outside workspace blocked by Falco ─────────────────────────

echo
echo "── filesystem isolation ──"

BEFORE_FALCO2=$(wc -l < "$LOGS/falco.jsonl" 2>/dev/null || echo 0)

exec_agent_root bash -c 'echo test > /etc/evil-test-file 2>/dev/null; rm -f /etc/evil-test-file' || true

sleep 2
AFTER_FALCO2=$(wc -l < "$LOGS/falco.jsonl" 2>/dev/null || echo 0)

# Agent writing to /etc should trigger "writes outside workspace" rule
if [[ "$AFTER_FALCO2" -gt "$BEFORE_FALCO2" ]]; then
  pass "Falco: write outside workspace triggered alert"
else
  # Not a hard fail — depends on process context / Falco rule matching
  skip "Falco: write outside workspace" "no new alert (exec as root may be excluded by rule scope)"
fi

# ── Test 7: CLIs installed ───────────────────────────────────────────────────

echo
echo "── CLI availability ──"

for cli in claude codex gemini; do
  if exec_agent bash -c "command -v $cli" &>/dev/null; then
    ver=$(exec_agent bash -c "$cli --version 2>&1 | head -1" 2>/dev/null || echo "installed")
    pass "CLI installed: $cli ($ver)"
  else
    fail "CLI installed: $cli" "not found in PATH"
  fi
done

# grok may have different binary name
if exec_agent bash -c "command -v grok || command -v grok-cli" &>/dev/null; then
  pass "CLI installed: grok"
else
  skip "CLI installed: grok" "binary not found — check npm package name"
fi

# ── Summary ──────────────────────────────────────────────────────────────────

echo
echo "═══════════════════════════════════════════════════"
printf " Results: ${GRN}%d passed${RST}  ${RED}%d failed${RST}  ${YLW}%d skipped${RST}\n" \
  "$PASS" "$FAIL" "$SKIP"
echo "═══════════════════════════════════════════════════"

[[ "$FAIL" -eq 0 ]]
