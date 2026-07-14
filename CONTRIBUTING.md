# Contributing to Leash

## Ways to contribute

- **Bug reports** — open an issue using the bug report template
- **New agent CLI support** — add the CLI to `agents/Dockerfile` and its domains to `proxy/policy.yaml`
- **New Falco rules** — add to `falco/rules.local.yaml` and cover with a test in `tests/run_tests.sh`
- **Linux support** — contributions for native Linux (no Lima) are welcome
- **Documentation** — incident response playbooks, blog posts, examples

## Development setup

```sh
git clone https://github.com/thiagolmoraes/leash
cd leash
brew install lima          # macOS only
cp .env.example .env       # add API keys
make vm-up && make up
make test                  # must pass before submitting PR
```

## Pull request checklist

- [ ] `make test` passes (19/19) on your machine
- [ ] New behavior covered by a test in `tests/run_tests.sh`
- [ ] `proxy/policy.yaml` updated if new domains are needed
- [ ] No API keys, tokens, or personal data in the diff
- [ ] PR description explains the motivation

## Adding a new agent CLI

1. Install the CLI in `agents/Dockerfile`
2. Add required domains to `proxy/policy.yaml`
3. Add a `make <cli-name>` target in `Makefile`
4. Add CLI availability test in `tests/run_tests.sh`
5. Update the README feature table

## Code style

- Shell scripts: `set -euo pipefail`, POSIX-compatible where possible
- Python: stdlib only in addons (no extra dependencies beyond what's in the image)
- YAML: 2-space indent, comments on non-obvious entries
