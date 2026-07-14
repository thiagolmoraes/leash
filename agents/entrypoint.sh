#!/bin/bash
set -e

# Install mitmproxy CA at runtime (proxy container generates it on first boot)
MITM_CA_SRC="/certs/mitmproxy-ca-cert.pem"
MITM_CA_DST="/usr/local/share/ca-certificates/mitm-ca.crt"

if [ -f "$MITM_CA_SRC" ]; then
    cp "$MITM_CA_SRC" "$MITM_CA_DST"
    update-ca-certificates --fresh 2>/dev/null || true
    echo "[entrypoint] mitm CA installed → TLS interception active"
else
    echo "[entrypoint] WARN: $MITM_CA_SRC not found."
    echo "[entrypoint] Run 'make up' first to let proxy generate the CA, then restart agents:"
    echo "[entrypoint]   docker compose restart agents"
fi

# Drop to non-root agent user for all agent commands
exec gosu agent "$@"
