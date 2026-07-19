import { useEffect, useState } from "react";
import type { Policy } from "../types";
import { api } from "../api";

// Client-side mirror of the server's gatekeeper-suffix-match warning — not a
// hard block (the server is the source of truth), just an early hint.
const DANGEROUS_BARE_HOSTS = new Set(["googleapis.com"]);

export function PolicyTab() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [newHost, setNewHost] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const load = () => {
    api.getPolicy().then(setPolicy).catch((e) => setError(String(e)));
  };

  useEffect(load, []);

  if (!policy) {
    return <div className="text-sm text-muted">{error ? `Couldn't load policy: ${error}` : "Loading policy…"}</div>;
  }

  const addHost = () => {
    const h = newHost.trim().toLowerCase();
    if (!h) return;
    if (DANGEROUS_BARE_HOSTS.has(h)) {
      setWarning(`"${h}" suffix-matches every subdomain (e.g. storage.googleapis.com) — use a specific subdomain instead.`);
      return;
    }
    setWarning(null);
    if (!policy.allow.includes(h)) {
      setPolicy({ ...policy, allow: [...policy.allow, h] });
    }
    setNewHost("");
  };

  const removeHost = (h: string) => {
    setPolicy({ ...policy, allow: policy.allow.filter((x) => x !== h) });
  };

  const save = async () => {
    setStatus("saving");
    setError(null);
    try {
      await api.putPolicy(policy);
      await api.reloadPolicy();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setStatus("error");
      setError((e as Error).message);
    }
  };

  return (
    <div className="max-w-2xl flex flex-col gap-7">
      <div>
        <div className="text-[11px] font-medium text-faint uppercase tracking-wideish mb-2">Mode</div>
        <div className="flex items-center gap-3.5 bg-surface border border-border rounded-lg p-4">
          <button
            onClick={() => setPolicy({ ...policy, mode: policy.mode === "enforce" ? "observe" : "enforce" })}
            className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
              policy.mode === "enforce" ? "bg-accent" : "bg-signal-warn"
            }`}
            aria-label="Toggle enforcement mode"
          >
            <span
              className={`absolute block top-1 w-4 h-4 rounded-full bg-bg transition-transform ${
                policy.mode === "enforce" ? "translate-x-7" : "translate-x-1"
              }`}
            />
          </button>
          <div className="text-sm">
            <div className="font-semibold text-ink">{policy.mode === "enforce" ? "Enforce" : "Observe"}</div>
            <div className="text-muted text-xs mt-0.5">
              {policy.mode === "enforce"
                ? "Blocks and logs anything outside the allowlist."
                : "Logs only — nothing is blocked. Use this to profile a new agent's traffic."}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-medium text-faint uppercase tracking-wideish mb-2">
          Allowlist · {policy.allow.length} host{policy.allow.length === 1 ? "" : "s"}
        </div>
        <div className="flex gap-2 mb-2">
          <input
            value={newHost}
            onChange={(e) => setNewHost(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addHost()}
            placeholder="e.g. api.example.com"
            className="flex-1 bg-surface2 border border-border rounded-md px-3 py-1.5 text-sm mono placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
          />
          <button
            onClick={addHost}
            className="px-3.5 py-1.5 rounded-md text-sm font-medium bg-accent-soft text-accent border border-accent-dim hover:bg-accent-dim transition-colors"
          >
            Add
          </button>
        </div>
        {warning && <div className="text-xs text-signal-warn mb-2">{warning}</div>}
        <div className="border border-border rounded-lg divide-y divide-border max-h-80 overflow-y-auto bg-surface">
          {policy.allow.map((host) => (
            <div key={host} className="flex items-center justify-between px-3 py-2 text-sm mono group">
              <span className="text-muted group-hover:text-ink transition-colors">{host}</span>
              <button
                onClick={() => removeHost(host)}
                className="text-xs text-faint hover:text-signal-critical transition-colors opacity-0 group-hover:opacity-100"
              >
                Remove
              </button>
            </div>
          ))}
          {policy.allow.length === 0 && (
            <div className="px-3 py-6 text-center text-faint text-sm">No hosts allowed.</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={status === "saving"}
          className="px-4 py-2 rounded-md text-sm font-semibold bg-accent text-bg hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {status === "saving" ? "Saving…" : "Save & reload proxy"}
        </button>
        {status === "saved" && <span className="text-sm text-accent">Saved and reloaded.</span>}
        {status === "error" && <span className="text-sm text-signal-critical">{error}</span>}
        <button onClick={load} className="text-sm text-faint hover:text-muted transition-colors">
          Discard changes
        </button>
      </div>
    </div>
  );
}
