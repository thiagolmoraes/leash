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
    echo "[entrypoint] WARN: $MITM_CA_SRC not found." >&2
    echo "[entrypoint] Run 'make up' first to let proxy generate the CA, then restart agents:" >&2
    echo "[entrypoint]   docker compose restart agents" >&2
    # Without the CA, HTTPS to intercepted hosts fails cert validation. Refuse to
    # start unless REQUIRE_MITM_CA=0 explicitly opts out (e.g. first-boot debugging).
    if [ "${REQUIRE_MITM_CA:-1}" != "0" ]; then
        echo "[entrypoint] FATAL: refusing to start without mitm CA (set REQUIRE_MITM_CA=0 to override)." >&2
        exit 1
    fi
fi

# Skill directories are named Docker volumes (not host bind mounts) written
# to by the dashboard's Skills tab. Reclaim them for `agent` so the CLIs
# (running as `agent` below) own what got installed — the dashboard also
# chowns at write time, this covers anything present before this boot.
for dir in \
    /home/agent/.claude/skills \
    /home/agent/.agents/skills \
    /home/agent/.gemini/extensions \
    /home/agent/.grok/skills; do
    if [ -d "$dir" ]; then
        chown -R agent:agent "$dir" 2>/dev/null || true
    fi
done

# Drop to non-root agent user for all agent commands
exec gosu agent "$@"
