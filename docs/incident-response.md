# Incident Response Playbook

How to investigate a suspicious agent session using Leash logs.

## Step 1 — Identify exfiltration attempts

```sh
# All blocked domains (fastest signal)
cat logs/blocked.jsonl | python3 -c "
import sys, json
for l in sys.stdin:
    e = json.loads(l)
    print(e['ts'], e['host'], e['method'])
"
```

Red flags:
- Domains you don't recognize
- `PUT` / `POST` methods to unusual hosts
- High frequency of CONNECT attempts

## Step 2 — Inspect request bodies

```sh
# Requests with body > 1KB (possible data exfil)
cat logs/flows.jsonl | python3 -c "
import sys, json
for l in sys.stdin:
    f = json.loads(l)
    if f['req_size'] > 1024:
        print(f['ts'], f['host'], f['req_size'], 'bytes')
        print('  preview:', f['req_body_preview'][:300])
        print('  sha256:', f['req_body_sha256'])
        print()
"
```

```sh
# Replay a specific flow in mitmweb
make ui   # open http://localhost:8081, filter by host or path
```

## Step 3 — Check credential access

```sh
# All Falco CRITICAL alerts
cat logs/falco.jsonl | python3 -c "
import sys, json
for l in sys.stdin:
    e = json.loads(l)
    if e.get('priority') in ('Critical', 'Warning'):
        print(e['time'], e['priority'].upper())
        print(' ', e['rule'])
        print(' ', e.get('output', ''))
        print()
"
```

Red flags:
- `Agent reads sensitive credentials` → agent read SSH keys or AWS credentials
- `Agent direct outbound` → attempted proxy bypass
- `Agent spawns network tool` → spawned `nc`, `ssh`, `scp` etc.

## Step 4 — Correlate by timestamp

```sh
# Find everything that happened in a 10-second window
TS=1783969672   # timestamp from blocked.jsonl entry
python3 -c "
import json, sys
files = ['logs/blocked.jsonl', 'logs/flows.jsonl', 'logs/falco.jsonl']
events = []
for f in files:
    try:
        for l in open(f):
            d = json.loads(l)
            ts = d.get('ts') or (d.get('time','').replace('T',' ')[:19] and None)
            events.append((ts, f.split('/')[-1], d))
    except: pass
events.sort(key=lambda x: str(x[0]))
for ts, src, d in events:
    print(src, '|', d.get('host') or d.get('rule',''), '|', d.get('method',''))
"
```

## Step 5 — Preserve evidence

```sh
# Archive logs before resetting
tar -czf leash-incident-$(date +%Y%m%d-%H%M%S).tar.gz logs/
make reset   # clear logs and restart fresh
```

## Indicators of Compromise (IoC) checklist

- [ ] `blocked.jsonl` has entries to unknown domains
- [ ] `flows.jsonl` has large POST bodies to non-API endpoints
- [ ] `falco.jsonl` has `Agent reads sensitive credentials` events
- [ ] `falco.jsonl` has `Agent direct outbound connection` events
- [ ] `falco.jsonl` has `Agent spawns network tool` events
- [ ] Unusual volume of requests (telemetry batching large payloads)
