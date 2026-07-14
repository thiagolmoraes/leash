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
- Falco rule bypass: a credential read or suspicious action not triggering an alert
- Policy enforcement bypass: a blocked domain being reachable despite `mode: enforce`
- CA cert exposure: the mitmproxy CA leaking outside the intended trust boundary

Out of scope:
- Issues requiring physical access to the host
- Issues in upstream dependencies (report to mitmproxy, Falco, Lima maintainers directly)

## Supported Versions

Only the latest commit on `main` is supported.
