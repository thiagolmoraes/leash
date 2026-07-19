# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/thiagolmoraes/leash/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

You will receive a response within **72 hours**. If the issue is confirmed, a fix will be prioritized and a CVE requested if applicable.

## Scope

Leash is a **defensive security tool**. Valid reports include:

- Sandbox escape: an agent container reaching the internet without going through the proxy
- Sandbox escape: the `agents` container reaching the `dashboard` container, its Docker socket, or any other host-privileged component — the `jail`/`egress` network split is meant to make this impossible, not just discouraged
- Falco rule bypass: a credential read or suspicious action not triggering an alert
- Policy enforcement bypass: a blocked domain being reachable despite `mode: enforce`
- CA cert exposure: the mitmproxy CA leaking outside the intended trust boundary
- Skills tab: any way a scanned/installed skill URL achieves path traversal, command injection, or SSRF against internal services during scan or install
- Dashboard: any endpoint that forwards unsanitized input into the Docker Engine API call (`dashboard/src/docker.ts`) or a shell command (`Bun.$` calls in `dashboard/src/skills.ts`) beyond the existing allowlists

Out of scope:
- Issues requiring physical access to the host
- Issues in upstream dependencies (report to mitmproxy, Falco, Lima, or NVIDIA SkillSpector maintainers directly)
- The dashboard's lack of authentication — it's documented as trusted-network-only tooling (see README), not a public-facing service

## Supported Versions

Only the latest commit on `main` is supported.
