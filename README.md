<div align="center">

<picture>
  <img src="assets/leash-logo.svg" width="160" alt="Leash Logo"/>
</picture>

# Leash

**Run AI coding agents. See everything. Control what escapes.**

[![License: MIT](https://img.shields.io/badge/License-MIT-00d4aa.svg?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20arm64%20%7C%20Linux-0099cc.svg?style=for-the-badge)](https://github.com/thiagolmoraes/leash)
[![Stack](https://img.shields.io/badge/stack-Lima%20%2B%20mitmproxy%20%2B%20Falco%20%2B%20Bun-00d4aa.svg?style=for-the-badge)](https://github.com/thiagolmoraes/leash)
[![Tests](https://img.shields.io/badge/tests-19%20passing-00d4aa.svg?style=for-the-badge)](tests/run_tests.sh)

</div>

---

## Why Leash exists

In early 2026, an incident involving the **Grok CLI** exposed a real risk that most developers were ignoring: AI coding agents running on your machine have **unconstrained access to your filesystem and network**. During a routine coding session, the agent silently read local credential files and exfiltrated data to an undisclosed endpoint — all while appearing to work normally.

The problem isn't unique to Grok. Every AI coding agent — Claude Code, Codex, Gemini CLI — runs as your user, can read your `~/.ssh` keys, your `.env` files, your `~/.aws` credentials, and can make arbitrary HTTPS requests to any destination. You have no visibility into what they actually send.

There's a second, newer version of the same problem: **agent skills and plugins**. They're just files an agent reads and follows — a malicious one can inject instructions, exfiltrate data, or escalate privileges, and until you scan it, you're installing it blind.

**Leash** was built to fix both. It gives you:

- A **fully isolated environment** where agents can't reach the internet directly
- **Full TLS decryption** of every HTTPS request — you see the exact body, not just the destination
- An **enforced domain allowlist** — anything outside the list gets blocked and logged
- **Syscall-level monitoring** via Falco — credential reads, writes outside the workspace, unexpected processes
- A **web dashboard** to see all of the above live, manage the allowlist, and control the sandbox without touching a terminal
- A **security scan before install** for any skill/plugin you add — see the risk before it runs, not after

Agents run. You watch everything.

---

## Architecture

```
macOS host (arm64)
└── Lima VM  "agent-lab"  (Ubuntu 24.04, Virtualization.framework)
    ├── Falco  ─── modern eBPF on VM kernel ──▶ logs/falco.jsonl
    └── Docker Compose
        ├── network "jail"   (internal: true — zero direct egress)
        ├── network "egress" (bridge — proxy, dashboard, skillspector reach internet)
        │
        ├── proxy   mitmproxy 11              [jail + egress]
        │           ├── full TLS decrypt (CA injected into agents)
        │           ├── domain allowlist enforcement → 403 + blocked.jsonl
        │           └── request body logging → flows.jsonl
        │
        ├── agents  node:22                   [jail only]
        │           ├── Claude Code
        │           ├── OpenAI Codex CLI
        │           ├── Gemini CLI
        │           └── Grok CLI
        │
        ├── dashboard  bun + hono + react     [egress only]
        │           ├── live flows/blocked/falco viewer (WebSocket)
        │           ├── policy editor + container control (docker.sock)
        │           └── Skills tab → calls skillspector, writes named volumes
        │
        └── skillspector  python + fastapi    [egress only]
                    └── scans a pasted skill/plugin URL before install
```

Traffic flow: `agent → proxy (decrypt + enforce) → internet`
Direct egress from `agents`: **impossible** — `internal: true` network has no gateway.
`dashboard` and `skillspector` sit outside the jail (they're operator tooling, not agent-controlled) and reach the internet directly over `egress`.

---

## What gets logged

| Log file | Contents |
|---|---|
| `logs/flows.jsonl` | Every decrypted request: host, method, path, status, body hash, body preview (512 bytes) |
| `logs/blocked.jsonl` | Every blocked attempt: timestamp, host, method |
| `logs/falco.jsonl` | Syscall alerts: credential reads, bypass attempts, unexpected processes |

**Example — catching data exfiltration:**
```jsonc
// logs/blocked.jsonl — agent tried to reach unknown endpoint
{"ts": 1783969672, "event": "blocked", "host": "telemetry.unknown-vendor.io", "method": "CONNECT", "path": "/"}

// logs/flows.jsonl — body of an allowed request, fully decrypted
{"host": "api.anthropic.com", "method": "POST", "path": "/v1/messages",
 "req_size": 54564, "req_body_preview": "{\"model\":\"claude-opus-4\",\"messages\":[...]}"}

// logs/falco.jsonl — agent read your SSH key
{"rule": "Agent reads sensitive credentials", "priority": "Critical",
 "output": "proc=node file=/home/agent/.ssh/id_rsa container=agents"}
```

---

## Quick start

**Prerequisites:** macOS arm64, [Lima](https://lima-vm.io) (`brew install lima`), Docker Desktop (for local image builds only).

```sh
# 1. Clone
git clone https://github.com/thiagolmoraes/leash
cd leash

# 2. Add your API keys
cp .env.example .env
# edit .env with real keys (and set MITMWEB_PASSWORD to protect the :8081 UI)

# 3. Bring everything up
make
```

Bare `make`:

- **First run** (no VM yet) → creates the Lima VM (downloads Ubuntu 24.04, ~500MB, one time), builds images, and starts the stack.
- **VM already exists** → shows an interactive menu to open a shell, start the stack, open the proxy UI, or stop the VM — pick a number, no command to type.

The individual steps are still available: `make vm-up` (VM only), `make up` (build + start stack).

---

## Usage

```sh
make claude        # run Claude Code inside the sandbox
make codex         # run OpenAI Codex CLI
make gemini        # run Gemini CLI
make grok          # run Grok CLI
make shell         # interactive bash as non-root agent user

make ui            # open mitmweb at http://localhost:8081 (live TLS flows)
make dashboard     # open the Leash dashboard at http://localhost:8082
make logs          # tail blocked.jsonl + falco.jsonl
make logs-flows    # tail all decrypted flows
make logs-blocked  # tail blocked attempts only
make logs-falco    # tail Falco syscall alerts

make test          # run full security test suite (19 tests)
make restart-proxy # reload after editing proxy/policy.yaml
make down          # stop containers
make vm-down       # stop Lima VM
```

---

## Adjusting the allowlist

Edit `proxy/policy.yaml`. Switch to `mode: observe` to profile an agent without blocking anything — useful when adding a new CLI and you need to discover what domains it legitimately needs.

```yaml
mode: enforce   # enforce | observe

allow:
  - api.anthropic.com
  - platform.claude.com
  - api.openai.com
  - generativelanguage.googleapis.com
  - api.x.ai
  # add domains here

# Optional — hosts to pass through un-intercepted (see "TLS cert pinning" below)
# ignore_hosts:
#   - pinned-api\.example\.com
```

After editing:
```sh
make restart-proxy   # no rebuild needed — policy is volume-mounted
```

Or use the dashboard's **Policy** tab instead of editing YAML by hand (see below) — note the Policy tab manages `allow`/`mode` only; `ignore_hosts` is YAML-only for now.

---

## Dashboard

```sh
make dashboard   # opens http://localhost:8082
```

A web UI for everything the CLI/mitmweb/jq combo above does manually:

- **Flows** — live table of every decrypted request/response (host, method, path, status, size), updated in real time over a WebSocket. Click a row for the body preview + sha256.
- **Blocked** — attempted requests the allowlist rejected, with an "Allow this host" button.
- **Falco** — syscall alerts, color-coded by priority.
- **Policy** — edit the allowlist and toggle `enforce`/`observe` mode without touching YAML; "Save & Reload Proxy" applies it immediately.
- **Containers** — status + start/stop/restart for `proxy`, `agents`, `falco`, `skillspector`. Shows running state, not network membership — see [How the isolation claims are verifiable](#how-the-isolation-claims-are-verifiable).
- **Skills** — paste a skill/plugin git URL, scan it with [SkillSpector](https://github.com/nvidia/skillspector) before installing, pick which harness (Claude Code, Codex, Gemini, or Grok) to install it for.

**Security note:** the dashboard container mounts `/var/run/docker.sock`, which gives it **host-Docker-equivalent access** — anyone who can reach `:8082` can control any container on the host, not just this project's. It has no authentication of its own. Only expose port 8082 on a trusted network; don't port-forward it beyond localhost.

---

## Skills tab — scan before you install

Agent skills/plugins run with the same trust as the CLI itself — a malicious one can read files, exfiltrate data, or hijack the agent's behavior. The **Skills** tab (in the dashboard) scans a pasted URL with SkillSpector — 68 vulnerability patterns across prompt injection, data exfiltration, privilege escalation, and more — before it lands in the sandbox.

**The scan never blocks.** It reports a 0–100 risk score and a full findings breakdown; you decide whether to install anyway. A high score just gets a louder warning, not a locked button — Leash's job is to show you what's there, not to make the call for you.

Supported git hosts: `github.com`, `gitlab.com`, `bitbucket.org` (same allowlist SkillSpector itself uses, plus an SSRF guard against private/internal IPs).

A pasted URL can point at either a single skill (`SKILL.md` at the repo root) or a collection (a repo with multiple `skills/<name>/SKILL.md` subdirectories, like `anthropics/skills`) — Leash detects which and installs one skill or all of them accordingly.

Install targets, one per harness (all four converge on "drop a folder," so no CLI exec is involved):

| Harness | Installed to (inside `agents`) | Status |
|---|---|---|
| Claude Code | `~/.claude/skills/<name>/` | stable |
| Codex CLI | `~/.agents/skills/<name>/` | stable |
| Gemini CLI | `~/.gemini/extensions/<name>/` | stable (manifest synthesized if the source doesn't ship one) |
| Grok CLI | `~/.grok/skills/<name>/` | **experimental** — xAI hasn't published the manifest format; installs use the same layout as the others on a best-effort basis |

v1 runs static analysis only (`--no-llm`) — no API key required. Semantic/LLM-assisted scanning is wired for later (`SKILLSPECTOR_PROVIDER` in `.env`, works with both Anthropic-compatible and OpenAI-compatible endpoints) but not enabled by default.

**Installed skills stay inside the sandbox.** Each harness's install directory is a named Docker volume (`skills-claude`, `skills-codex`, `skills-gemini`, `skills-grok`) shared only between `dashboard` and `agents` — not a bind mount to the macOS filesystem. A skill you install never touches the host outside Docker's own storage.

---

## Falco rules

Five detection rules ship by default (`falco/rules.local.yaml`):

| Rule | Priority | Triggers on |
|---|---|---|
| Agent reads sensitive credentials | **Critical** | Read of `~/.ssh/*`, `~/.aws/*`, `~/.config/gcloud/*`, `*.pem`, `.env*` |
| Agent direct outbound (proxy bypass) | **Critical** | TCP connect not destined for proxy |
| Agent spawns network tool | Warning | `nc`, `ncat`, `ssh`, `scp`, `socat`, `nmap` spawned |
| Agent writes outside workspace | Warning | File write outside `/workspace` and `/tmp` |
| Unexpected interactive shell | Notice | TTY shell spawned by unexpected parent |

Honeypot files are pre-seeded in the agent home (`~/.ssh/id_rsa`, `~/.aws/credentials`) to make credential-read detection reliable even if the agent never touches real keys.

---

## Test suite

```sh
make test
```

```
── pre-flight ──
PASS  container proxy is running
PASS  container agents is running
PASS  container falco is running

── TLS interception ──
PASS  TLS interception: HTTPS reaches API (HTTP 401, not SSL error)
PASS  TLS interception: mitm CA in system trust store

── egress isolation ──
PASS  egress isolation: direct outbound blocked (no route)
PASS  egress isolation: direct DNS bypass blocked

── allowlist enforcement ──
PASS  allowlist: blocked domain returns 403/reset
PASS  allowlist: block logged to blocked.jsonl
PASS  allowlist: allowed domain passes

── flow logging ──
PASS  flow logging: request logged
PASS  flow logging: JSON has required fields

── Falco detection ──
PASS  Falco: credential read detected (rule: Agent reads sensitive credentials)
PASS  Falco: still running after tests

── filesystem isolation ──
PASS  Falco: write outside workspace triggered alert

── CLI availability ──
PASS  CLI installed: claude
PASS  CLI installed: codex
PASS  CLI installed: gemini
PASS  CLI installed: grok

Results: 19 passed  0 failed  0 skipped
```

---

## How the isolation claims are verifiable

"Agents can't reach the host" isn't something you have to take on faith from this README — here's exactly where to check it yourself:

- **Network topology** — `docker-compose.yml`'s `networks:` section: `agents` is declared on `jail` only, `dashboard` on `egress` only, and `jail` has no bridge to `egress`. Read it directly; there's no hidden config elsewhere.
- **That the isolation actually holds at runtime, not just in config** — `make test-bypass` and `make test-block` (see [Test suite](#test-suite)) run real commands from inside the `agents` container and assert the network-level result (connection refused, 403), not just check a config file.
- **The dashboard's `docker.sock` exposure** (the one place a compromise would be severe if reachable — see below) — `dashboard/src/docker.ts`'s `MANAGED` allowlist and `docker-compose.yml`'s network assignment for `dashboard` are both plain text, not obfuscated or dynamic.

**Current gap, called out plainly:** the dashboard's **Containers** tab shows each container's running state, but not which Docker network it's on. So today, verifying the network isolation itself means reading `docker-compose.yml` or running the test suite — not something the UI surfaces yet. If that matters to you, treat the compose file as the source of truth, not the dashboard.

---

## Known limitations

| Issue | Workaround |
|---|---|
| **TLS cert pinning** — CLI pins its cert, MitM breaks for that host | Add host to `ignore_hosts` in proxy config, or use `mode: observe` |
| **OAuth login flows** — browser-based auth is awkward inside a container | Use API keys in `.env` instead of interactive login |
| **Falco on macOS** — runs inside Lima VM kernel (Linux 6.x), not on macOS host directly | No workaround needed — eBPF works on the VM kernel |
| **Firecracker/KVM** — not available on macOS arm64 (no hardware KVM) | Lima with Virtualization.framework provides sufficient isolation |

---

## License

MIT
