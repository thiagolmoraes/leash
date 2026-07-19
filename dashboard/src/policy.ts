// Reads and writes proxy/policy.yaml (mounted read-write into this container).
import yaml from "js-yaml";

// Overridable for local dev (outside the container, where /app doesn't exist).
const POLICY_PATH = process.env.LEASH_POLICY_PATH ?? "/app/policy.yaml";

export interface Policy {
  mode: "enforce" | "observe";
  allow: string[];
}

function isValidPolicy(v: unknown): v is Policy {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    (p.mode === "enforce" || p.mode === "observe") &&
    Array.isArray(p.allow) &&
    p.allow.every((h) => typeof h === "string")
  );
}

export async function readPolicy(): Promise<Policy> {
  const text = await Bun.file(POLICY_PATH).text();
  const parsed = yaml.load(text);
  if (!isValidPolicy(parsed)) {
    throw new Error("policy.yaml failed validation after load");
  }
  return parsed;
}

// Bare `googleapis.com` allows storage.googleapis.com (arbitrary GCS-bucket
// exfil) via the gatekeeper's suffix match — refuse it outright.
const DANGEROUS_BARE_HOSTS = new Set(["googleapis.com"]);

export function validateHost(host: string): string | null {
  const h = host.trim().toLowerCase();
  if (!h) return "Host is empty.";
  if (DANGEROUS_BARE_HOSTS.has(h)) {
    return `"${h}" is too broad (suffix-matches every subdomain — use a specific subdomain instead).`;
  }
  if (!/^[a-z0-9.-]+$/.test(h)) return "Host contains invalid characters.";
  return null;
}

export async function writePolicy(policy: Policy): Promise<void> {
  if (policy.mode !== "enforce" && policy.mode !== "observe") {
    throw new Error("mode must be 'enforce' or 'observe'");
  }
  for (const host of policy.allow) {
    const err = validateHost(host);
    if (err) throw new Error(err);
  }
  const header =
    "# Proxy egress policy\n" +
    "# mode: enforce  → block + log anything not in allow list\n" +
    "# mode: observe  → log only, nothing blocked (use for initial profiling)\n";
  const body = yaml.dump(
    { mode: policy.mode, allow: policy.allow },
    { lineWidth: -1 },
  );
  await Bun.write(POLICY_PATH, header + body);
}
