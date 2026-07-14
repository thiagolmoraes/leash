# Changelog

All notable changes to Leash are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] — 2026-07-14

### Added
- Lima VM definition (`lima/agent-lab.yaml`) using Virtualization.framework (vzNAT) — no socket_vmnet required
- Docker Compose stack with `jail` (internal) and `egress` networks enforcing zero direct agent egress
- mitmproxy 11 proxy with full TLS decryption via injected CA cert
- Domain allowlist enforcement (`proxy/policy.yaml`, `mode: enforce | observe`)
- `gatekeeper.py` addon — blocks unlisted domains (403) and logs to `blocked.jsonl`
- `flowlog.py` addon — logs every decrypted request body hash + preview to `flows.jsonl`
- Agent image (`node:22-bookworm`) with Claude Code, OpenAI Codex CLI, Gemini CLI, Grok CLI
- Runtime CA injection via `entrypoint.sh` + `gosu` user drop
- Honeypot credential files (`~/.ssh/id_rsa`, `~/.aws/credentials`) for reliable Falco detection
- Falco `modern_ebpf` container with 5 custom detection rules
- 19-test security suite (`tests/run_tests.sh`) covering: TLS interception, egress isolation, allowlist enforcement, flow logging, Falco detection, filesystem isolation, CLI availability
- `Makefile` with targets: `vm-up`, `up`, `shell`, `claude`, `codex`, `gemini`, `grok`, `ui`, `logs`, `test`, `reset`
- SVG logo (`assets/leash-logo.svg`)
