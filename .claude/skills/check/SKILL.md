---
name: check
description: Run all host-runnable CI checks locally before committing — shellcheck, YAML validation, docker compose config, and pytest unit tests. Use before any commit or PR, or when asked to verify changes. The full integration suite (make test) needs the Lima VM and is NOT run here.
---

Run the local verification suite mirroring `.github/workflows/` CI. All steps run on the host — no Lima VM needed.

1. **Shellcheck** on the scripts CI checks:
   ```
   shellcheck tests/run_tests.sh agents/entrypoint.sh
   ```
   Also shellcheck any other `.sh` file changed in the working diff.

2. **YAML validation** on every changed/tracked YAML file:
   ```
   python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" <file>
   ```
   At minimum: `proxy/policy.yaml`, `falco/rules.local.yaml`, `lima/agent-lab.yaml`, `docker-compose.yml` if changed.

3. **Compose validation** (needs `.env` present; copy from example if missing):
   ```
   [ -f .env ] || cp .env.example .env
   docker compose config --quiet
   ```
   Note: if `docker` is unavailable on the host, skip and say so — CI covers it.

4. **Unit tests**:
   ```
   pytest tests/unit/ -v
   ```
   If imports fail on missing deps: `pip install mitmproxy pyyaml pytest` then retry.

Report results as a short pass/fail list. If anything fails, show the exact error output and stop — do not auto-fix unless asked. Remind that `make test` (19-test integration suite in the VM) must still pass 19/19 before a PR.
