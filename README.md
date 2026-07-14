# sandbox-AI — Lab de observação de agentes CLI

Ambiente controlado para rodar Claude Code, Codex CLI, Gemini CLI e Grok CLI com:
- **Isolamento total** via Lima VM (macOS) + rede `internal: true`
- **MitM TLS completo** — todo tráfego decriptado, body visível em `logs/flows.jsonl`
- **Allowlist de domínios** — qualquer destino fora da lista → 403 + `logs/blocked.jsonl`
- **Monitoramento de syscalls** via Falco — leitura de credenciais, bypass de rede, escrita fora do workspace

## Pré-requisitos

```sh
brew install lima       # VM manager
```

## Primeiro uso

```sh
# 1. Criar .env com as API keys
cp .env.example .env
# edite .env com suas chaves reais

# 2. Subir VM Lima (download ~500MB Ubuntu, uma vez só)
make vm-up

# 3. Build + subir containers
make up
```

## Uso diário

```sh
make shell          # shell interativo no container de agentes
make ui             # abre mitmweb no browser (http://localhost:8081)
make logs           # tail blocked + falco (últimas 20 linhas cada)
make logs-flows     # tail contínuo de todos os flows decriptados
make logs-blocked   # tail contínuo de domínios bloqueados
make logs-falco     # tail contínuo de alertas Falco
```

## Rodar um agente específico

```sh
make shell
# dentro do container:
claude          # Claude Code
codex           # OpenAI Codex CLI
gemini          # Gemini CLI
grok            # Grok CLI
```

## Testes de verificação

```sh
make test-block     # tenta acessar domínio fora da allowlist → 403
make test-bypass    # tenta conexão direta sem proxy → falha (rede internal)
make test-decoy     # lê ~/.ssh/id_rsa (honeypot) → alerta Falco CRITICAL
```

## Fluxo de auditoria de incidente

1. **Identificar tentativas de exfiltração:** `logs/blocked.jsonl`
   ```sh
   cat logs/blocked.jsonl | python3 -c "import sys,json; [print(json.dumps(json.loads(l), indent=2)) for l in sys.stdin]"
   ```

2. **Inspecionar body das requests:** `logs/flows.jsonl`
   ```sh
   # Requests com body > 1KB (suspeito de exfil de dados)
   cat logs/flows.jsonl | python3 -c "
   import sys, json
   for l in sys.stdin:
       f = json.loads(l)
       if f['req_size'] > 1024:
           print(f['ts'], f['host'], f['req_size'], f['req_body_preview'][:200])
   "
   ```

3. **Replay no mitmweb:** abra `http://localhost:8081`, filtre por host.

4. **Alertas de syscall:** `logs/falco.jsonl`
   ```sh
   cat logs/falco.jsonl | python3 -c "
   import sys, json
   for l in sys.stdin:
       e = json.loads(l)
       if e.get('priority') in ('CRITICAL','WARNING'):
           print(e['time'], e['rule'], e.get('output',''))
   "
   ```

## Ajustar allowlist

Edite `proxy/policy.yaml`. Mude `mode: observe` para perfilar o que um agente acessa *sem* bloquear.
Reinicie o proxy:

```sh
limactl shell agent-lab -- bash -c "cd /sandbox-AI && docker compose restart proxy"
```

## Estrutura

```
sandbox-AI/
├── Makefile
├── docker-compose.yml
├── lima/agent-lab.yaml       Lima VM (Ubuntu 24.04, vz)
├── proxy/
│   ├── Dockerfile
│   ├── policy.yaml           allowlist de domínios
│   └── addons/
│       ├── gatekeeper.py     bloqueia + loga violações
│       └── flowlog.py        loga todos os flows decriptados
├── agents/
│   ├── Dockerfile            node:22 + 4 CLIs + CA mitm + gosu
│   └── entrypoint.sh         instala CA no boot, dropa para user agent
├── falco/rules.local.yaml    regras de detecção custom
├── workspace/                código que os agentes editam
└── logs/
    ├── flows.jsonl           todos os flows (decriptados)
    ├── blocked.jsonl         tentativas bloqueadas
    └── falco.jsonl           alertas de syscall
```

## Riscos conhecidos

- **Cert pinning:** se um CLI pinnar o certificado, TLS interception quebra para ele. Solução: adicionar o host ao `ignore_hosts` do mitmproxy ou rodar em modo `observe`.
- **Grok CLI:** nome do pacote npm pode mudar. Verifique com `npm search grok-cli`.
- **Falco no Lima:** usa `modern_ebpf` no kernel Ubuntu 24.04 (kernel 6.x). Se alertas não aparecerem, verifique `docker compose logs falco`.
