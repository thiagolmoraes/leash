VM_NAME  := agent-lab
VM_YAML  := lima/agent-lab.yaml
# COMPOSE expands to a partial command — subcommand is appended by each target.
# For targets needing interactive TTY (shell), use RUN_IN_VM directly.
RUN_IN_VM = limactl shell $(VM_NAME) -- sg docker -c
COMPOSE_CMD = cd /sandbox-AI && docker compose

.PHONY: vm-up vm-down vm-shell up down build shell claude codex gemini grok ui logs logs-blocked logs-falco test reset

## ── Lima VM ─────────────────────────────────────────────────────────────────

vm-up:
	@echo "→ Starting Lima VM '$(VM_NAME)'…"
	limactl start --name=$(VM_NAME) $(VM_YAML) || limactl start $(VM_NAME)

vm-down:
	limactl stop $(VM_NAME)

vm-shell:
	limactl shell $(VM_NAME)

## ── Compose (run inside Lima VM) ────────────────────────────────────────────

build:
	$(RUN_IN_VM) "$(COMPOSE_CMD) build"

up: build
	$(RUN_IN_VM) "$(COMPOSE_CMD) up -d"
	@echo "→ Proxy UI: http://localhost:8081 (run 'make ui' to open)"

down:
	$(RUN_IN_VM) "$(COMPOSE_CMD) down"

restart-agents:
	$(RUN_IN_VM) "$(COMPOSE_CMD) restart agents"

restart-proxy:
	$(RUN_IN_VM) "$(COMPOSE_CMD) restart proxy"

## ── Agent shell + CLIs ──────────────────────────────────────────────────────

shell:
	limactl shell $(VM_NAME) -- sg docker -c "$(COMPOSE_CMD) exec -it --user agent agents bash"

claude:
	limactl shell $(VM_NAME) -- sg docker -c "$(COMPOSE_CMD) exec -it --user agent agents claude"

codex:
	limactl shell $(VM_NAME) -- sg docker -c "$(COMPOSE_CMD) exec -it --user agent agents codex"

gemini:
	limactl shell $(VM_NAME) -- sg docker -c "$(COMPOSE_CMD) exec -it --user agent agents gemini"

grok:
	limactl shell $(VM_NAME) -- sg docker -c "$(COMPOSE_CMD) exec -it --user agent agents grok"

## ── Monitoring ──────────────────────────────────────────────────────────────

ui:
	open http://localhost:8081

logs:
	@echo "=== BLOCKED (last 20) ==="; \
	 limactl shell $(VM_NAME) -- tail -n 20 /sandbox-AI/logs/blocked.jsonl 2>/dev/null || echo "(no blocked.jsonl yet)"; \
	 echo; \
	 echo "=== FALCO (last 20) ==="; \
	 limactl shell $(VM_NAME) -- tail -n 20 /sandbox-AI/logs/falco.jsonl 2>/dev/null || echo "(no falco.jsonl yet)"

logs-flows:
	limactl shell $(VM_NAME) -- tail -f /sandbox-AI/logs/flows.jsonl

logs-blocked:
	limactl shell $(VM_NAME) -- tail -f /sandbox-AI/logs/blocked.jsonl

logs-falco:
	limactl shell $(VM_NAME) -- tail -f /sandbox-AI/logs/falco.jsonl

## ── Verification helpers ─────────────────────────────────────────────────────

test-block:
	@echo "→ Testing egress block (expect 403)…"
	$(RUN_IN_VM) "$(COMPOSE_CMD) exec agents curl -sv https://evil-exfil-test.example.com 2>&1 | grep -E '< HTTP|403|Blocked'"

test-bypass:
	@echo "→ Testing direct bypass (expect connection refused / no route)…"
	$(RUN_IN_VM) "$(COMPOSE_CMD) exec agents curl --noproxy '*' -sv --max-time 5 https://api.anthropic.com 2>&1 | tail -5"

test-decoy:
	@echo "→ Reading decoy SSH key (expect Falco CRITICAL alert)…"
	$(RUN_IN_VM) "$(COMPOSE_CMD) exec agents cat /home/agent/.ssh/id_rsa"

## ── Tests ───────────────────────────────────────────────────────────────────

test:
	limactl shell $(VM_NAME) -- sg docker -c \
	  "bash /sandbox-AI/tests/run_tests.sh 2>&1 | tee /sandbox-AI/logs/test-results.txt; exit \$${PIPESTATUS[0]}"
	@cat logs/test-results.txt 2>/dev/null || true

## ── Reset ───────────────────────────────────────────────────────────────────

reset:
	$(RUN_IN_VM) "$(COMPOSE_CMD) down -v"
	rm -f logs/flows.jsonl logs/blocked.jsonl logs/falco.jsonl
