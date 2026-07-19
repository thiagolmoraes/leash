---
name: policy
description: Edit the proxy allowlist (proxy/policy.yaml) safely — validate, hot-reload via make restart-proxy, and verify with blocked-flow logs. Use when adding/removing allowed domains, switching enforce/observe mode, or adding ignore_hosts for TLS-pinned services.
---

Workflow for changing `proxy/policy.yaml`. The file is volume-mounted — never rebuild images for policy changes.

1. Read `proxy/policy.yaml` and make the requested change:
   - New allowed domain → add under the allowlist section, with a comment saying why.
   - TLS-pinned host breaking MitM → add to `ignore_hosts` instead.
   - Profiling a new CLI's traffic → set `mode: observe` (remember to flip back to `enforce` after).

2. Validate:
   ```
   python3 -c "import yaml,sys; yaml.safe_load(open('proxy/policy.yaml'))"
   ```

3. Hot-reload:
   ```
   make restart-proxy
   ```
   (Runs inside the Lima VM via the Makefile. If it fails because the VM is down, say so — `make vm-up && make up` first.)

4. Verify: check that legit traffic flows and blocks still fire:
   ```
   make logs-blocked
   ```
   For a domain just allowed, confirm it no longer appears in blocked logs when exercised. Suggest `make test-block` for a quick canary.

5. If `mode` was changed to `observe`, remind at the end: observe mode disables enforcement — flip back to `enforce` when profiling is done.
