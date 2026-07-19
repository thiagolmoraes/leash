VM_NAME  := agent-lab
VM_YAML  := lima/agent-lab.yaml
# COMPOSE expands to a partial command — subcommand is appended by each target.
# For targets needing interactive TTY (shell), use RUN_IN_VM directly.
# --workdir avoids limactl trying (and noisily failing) to replicate the
# host's cwd inside the VM, since the host path doesn't exist there.
LIMACTL_SHELL = limactl shell --workdir /sandbox-AI $(VM_NAME)
RUN_IN_VM = $(LIMACTL_SHELL) -- sg docker -c
COMPOSE_CMD = cd /sandbox-AI && docker compose

# `select` (menu) is a bash builtin — plain sh doesn't have it.
SHELL := /bin/bash

# Localized shell messages (pt/es/en, auto-detected from the system locale).
I18N := source scripts/i18n.sh

.DEFAULT_GOAL := start

.PHONY: start vm-up vm-down vm-shell up down build ensure-up shell claude codex gemini grok ui dashboard logs logs-flows logs-blocked logs-falco test-block test-bypass test-decoy test reset

## ── Default: interactive menu ───────────────────────────────────────────────

# Bare `make`:
#   - no VM   → create and bring up the stack.
#   - VM there → numbered menu (pick an action, no command to type).
# Messages are localized (pt/es/en) via scripts/i18n.sh.
start:
	@$(I18N); \
	status=$$(limactl list --format '{{.Status}}' $(VM_NAME) 2>/dev/null); \
	if [ -z "$$status" ]; then \
		printf "$$MSG_VM_NONE\n" "$(VM_NAME)"; \
		$(MAKE) vm-up up; \
	else \
		printf "$$MSG_VM_EXISTS\n" "$(VM_NAME)" "$$status"; \
		PS3="#? "; \
		select opt in \
			"$$MSG_OPT_SHELL" \
			"$$MSG_OPT_UP" \
			"$$MSG_OPT_UI" \
			"$$MSG_OPT_DASHBOARD" \
			"$$MSG_OPT_STOP" \
			"$$MSG_OPT_QUIT"; do \
			case $$REPLY in \
				1) exec $(MAKE) shell ;; \
				2) exec $(MAKE) up ;; \
				3) exec $(MAKE) ui ;; \
				4) exec $(MAKE) dashboard ;; \
				5) exec $(MAKE) vm-down ;; \
				6) printf "$$MSG_QUITTING\n"; exit 0 ;; \
				*) printf "$$MSG_INVALID\n" ;; \
			esac; \
		done; \
	fi

## ── Lima VM ─────────────────────────────────────────────────────────────────

# Idempotent: create if missing, start if stopped, no-op if already running.
vm-up:
	@$(I18N); \
	status=$$(limactl list --format '{{.Status}}' $(VM_NAME) 2>/dev/null); \
	if [ -z "$$status" ]; then \
		printf "$$MSG_VM_CREATING\n" "$(VM_NAME)"; \
		limactl start --name=$(VM_NAME) $(VM_YAML); \
	elif [ "$$status" != "Running" ]; then \
		printf "$$MSG_VM_STARTING\n" "$(VM_NAME)" "$$status"; \
		limactl start $(VM_NAME); \
	else \
		printf "$$MSG_VM_RUNNING\n" "$(VM_NAME)"; \
	fi

vm-down:
	limactl stop $(VM_NAME)

vm-shell:
	$(LIMACTL_SHELL)

## ── Compose (run inside Lima VM) ────────────────────────────────────────────

build:
	$(RUN_IN_VM) "$(COMPOSE_CMD) build"

up: build
	$(RUN_IN_VM) "$(COMPOSE_CMD) up -d"
	@$(I18N); printf "$$MSG_PROXY_UI\n"

down:
	$(RUN_IN_VM) "$(COMPOSE_CMD) down"

restart-agents:
	$(RUN_IN_VM) "$(COMPOSE_CMD) restart agents"

restart-proxy:
	$(RUN_IN_VM) "$(COMPOSE_CMD) restart proxy"

## ── Agent shell + CLIs ──────────────────────────────────────────────────────

# Ensure the stack is up before an `exec`, otherwise the CLI targets fail with
# a raw "service agents is not running" error. `up -d` is idempotent (no-op if
# already running) and only builds if images are missing.
ensure-up:
	@$(RUN_IN_VM) "$(COMPOSE_CMD) up -d" >/dev/null 2>&1

shell: ensure-up
	$(LIMACTL_SHELL) -- sg docker -c "$(COMPOSE_CMD) exec -it --user agent agents bash"

claude: ensure-up
	$(LIMACTL_SHELL) -- sg docker -c "$(COMPOSE_CMD) exec -it --user agent agents claude"

codex: ensure-up
	$(LIMACTL_SHELL) -- sg docker -c "$(COMPOSE_CMD) exec -it --user agent agents codex"

gemini: ensure-up
	$(LIMACTL_SHELL) -- sg docker -c "$(COMPOSE_CMD) exec -it --user agent agents gemini"

grok: ensure-up
	$(LIMACTL_SHELL) -- sg docker -c "$(COMPOSE_CMD) exec -it --user agent agents grok"

## ── Monitoring ──────────────────────────────────────────────────────────────

ui:
	open http://localhost:8081

dashboard:
	open http://localhost:8082

logs:
	@echo "=== BLOCKED (last 20) ==="; \
	 $(LIMACTL_SHELL) -- tail -n 20 /sandbox-AI/logs/blocked.jsonl 2>/dev/null || echo "(no blocked.jsonl yet)"; \
	 echo; \
	 echo "=== FALCO (last 20) ==="; \
	 $(LIMACTL_SHELL) -- tail -n 20 /sandbox-AI/logs/falco.jsonl 2>/dev/null || echo "(no falco.jsonl yet)"

logs-flows:
	$(LIMACTL_SHELL) -- tail -f /sandbox-AI/logs/flows.jsonl

logs-blocked:
	$(LIMACTL_SHELL) -- tail -f /sandbox-AI/logs/blocked.jsonl

logs-falco:
	$(LIMACTL_SHELL) -- tail -f /sandbox-AI/logs/falco.jsonl

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
	$(LIMACTL_SHELL) -- sg docker -c \
	  "bash /sandbox-AI/tests/run_tests.sh 2>&1 | tee /sandbox-AI/logs/test-results.txt; exit \$${PIPESTATUS[0]}"
	@cat logs/test-results.txt 2>/dev/null || true

## ── Reset ───────────────────────────────────────────────────────────────────

reset:
	$(RUN_IN_VM) "$(COMPOSE_CMD) down -v"
	rm -f logs/flows.jsonl logs/blocked.jsonl logs/falco.jsonl
