# Running Leash on Linux

On Linux you don't need Lima — run the Docker Compose stack directly.

## Prerequisites

- Docker Engine 24+ with Compose plugin
- Kernel 5.8+ (for Falco modern eBPF)
- `sudo` access (Falco needs `privileged` + `/proc` mount)

## Setup

```sh
git clone https://github.com/thiagolmoraes/leash
cd leash
cp .env.example .env   # add API keys

docker compose build
docker compose up -d
```

## Usage

Same as macOS but skip the `make vm-*` targets:

```sh
docker compose exec --user agent agents claude
docker compose exec --user agent agents codex
docker compose exec --user agent agents bash

# monitoring
docker compose exec agents curl ... # test block
tail -f logs/blocked.jsonl
tail -f logs/falco.jsonl
```

## Run tests

```sh
bash tests/run_tests.sh
```

## Differences from macOS

| Feature | macOS | Linux |
|---|---|---|
| VM isolation | Lima (Virtualization.framework) | No VM — containers run on host kernel |
| Falco eBPF | Runs on Ubuntu 24.04 kernel inside Lima | Runs directly on host kernel |
| Network isolation | `internal: true` Docker network | Same |
| TLS interception | Same | Same |

On Linux the containers share the host kernel — isolation is at the Docker network layer only (no hypervisor boundary). For stronger isolation on Linux, use Kata Containers or Firecracker as the Docker runtime.
