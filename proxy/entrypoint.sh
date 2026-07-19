#!/bin/sh
# Proxy entrypoint: launches mitmweb with an optional UI password and any
# ignore_hosts from policy.yaml.
# MITMWEB_PASSWORD (from compose env) protects the 8081 web UI, which
# exposes all decrypted flows. If unset, the UI runs without a password
# and prints a warning.
set -eu

# Build the arg list positionally (POSIX sh has no arrays) so an optional
# password flag can be added without unquoted word-splitting.
set -- \
    --listen-host 0.0.0.0 \
    --listen-port 8080 \
    --web-host 0.0.0.0 \
    --web-port 8081 \
    --set confdir=/certs \
    -s /app/addons/gatekeeper.py \
    -s /app/addons/flowlog.py

if [ -n "${MITMWEB_PASSWORD:-}" ]; then
    set -- "$@" --set "web_password=${MITMWEB_PASSWORD}"
else
    echo "[proxy] WARN: MITMWEB_PASSWORD unset — mitmweb UI (:8081) has no auth." >&2
fi

# Hosts with TLS cert pinning break MitM — policy.yaml's `ignore_hosts` lets
# those pass through un-intercepted instead of failing cert validation.
# --ignore-hosts is a start-time flag (unlike allow/mode, it can't hot-reload
# without a restart), so read it fresh here on every boot.
IGNORE_HOSTS=$(python3 -c "
import yaml
try:
    with open('/app/policy.yaml') as f:
        policy = yaml.safe_load(f) or {}
    for h in policy.get('ignore_hosts', []) or []:
        print(h)
except FileNotFoundError:
    pass
")
if [ -n "$IGNORE_HOSTS" ]; then
    while IFS= read -r host; do
        [ -n "$host" ] || continue
        echo "[proxy] ignore_hosts: passing through $host un-intercepted" >&2
        set -- "$@" --ignore-hosts "$host"
    done <<EOF
$IGNORE_HOSTS
EOF
fi

exec mitmweb "$@"
