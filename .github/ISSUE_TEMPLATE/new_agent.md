---
name: New agent CLI request
about: Request support for a new AI coding agent
labels: enhancement
---

**Agent name and npm/pip package**
e.g. `@company/agent-cli`

**Required domains**
List the domains the CLI needs to function (check with `mode: observe` in `proxy/policy.yaml`):
- api.example.com
- telemetry.example.com (flag if this looks suspicious)

**Installation command**
```sh
npm install -g @company/agent-cli
```

**Any known cert pinning or TLS quirks?**
Does it work behind mitmproxy, or does it fail with SSL errors?
