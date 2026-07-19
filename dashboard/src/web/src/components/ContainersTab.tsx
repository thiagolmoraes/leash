import { useEffect, useState } from "react";
import type { ContainerStatus } from "../types";
import { api } from "../api";

const ROLE: Record<string, string> = {
  proxy: "Decrypts traffic and enforces the allowlist",
  agents: "Where Claude Code, Codex, Gemini, and Grok run",
  falco: "Watches syscalls for credential reads and escapes",
};

function stateColor(state: string) {
  if (state === "running") return "text-accent";
  if (state === "exited" || state === "absent") return "text-faint";
  return "text-signal-warn";
}

function StateDot({ state }: { state: string }) {
  const color = state === "running" ? "bg-accent" : state === "exited" || state === "absent" ? "bg-faint" : "bg-signal-warn";
  return (
    <span className="relative flex w-1.5 h-1.5">
      {state === "running" && <span className={`absolute inline-flex w-full h-full rounded-full ${color} animate-pulseDot`} />}
      <span className={`relative inline-flex rounded-full w-1.5 h-1.5 ${color}`} />
    </span>
  );
}

const ACTION_LABEL: Record<string, string> = { start: "Start", stop: "Stop", restart: "Restart" };
const ACTION_LABEL_BUSY: Record<string, string> = { start: "Starting…", stop: "Stopping…", restart: "Restarting…" };

const ACTION_STYLE: Record<string, string> = {
  start: "border-accent-dim bg-accent-soft text-accent hover:bg-accent-dim hover:border-accent",
  stop: "border-signal-critical/30 bg-signal-critical/10 text-signal-critical hover:bg-signal-critical/20 hover:border-signal-critical/50",
  restart: "border-signal-warn/30 bg-signal-warn/10 text-signal-warn hover:bg-signal-warn/20 hover:border-signal-warn/50",
};

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.25" />
      <path d="M10.5 6a4.5 4.5 0 0 0-4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ContainersTab() {
  const [containers, setContainers] = useState<ContainerStatus[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.getContainers().then((r) => setContainers(r.containers)).catch((e) => setError(String(e)));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const act = async (name: string, action: "start" | "stop" | "restart") => {
    setBusy(`${name}:${action}`);
    setError(null);
    try {
      await api.containerAction(name, action);
      await new Promise((r) => setTimeout(r, 500));
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!containers) {
    return <div className="text-sm text-muted">{error ? `Couldn't load containers: ${error}` : "Loading…"}</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="text-sm text-signal-critical">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {containers.map((c) => {
          const isDown = c.state !== "running";
          return (
            <div
              key={c.name}
              className={`border rounded-lg p-4 bg-surface flex flex-col gap-3 transition-colors ${
                isDown && c.name === "proxy" ? "border-signal-critical/40" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">{c.name}</span>
                <span className={`flex items-center gap-1.5 text-[11px] tracking-wideish uppercase ${stateColor(c.state)}`}>
                  <StateDot state={c.state} />
                  {c.state}
                </span>
              </div>
              <div className="text-xs text-muted leading-relaxed -mt-1">{ROLE[c.name]}</div>
              <div className="text-xs text-faint">{c.status}</div>
              <div className="text-xs mono text-faint truncate">{c.image || "—"}</div>
              <div className="flex gap-2 mt-1">
                {(["start", "stop", "restart"] as const).map((action) => {
                  const isBusy = busy === `${c.name}:${action}`;
                  const anyBusy = busy?.startsWith(`${c.name}:`) ?? false;
                  return (
                    <button
                      key={action}
                      onClick={() => act(c.name, action)}
                      disabled={anyBusy}
                      className={`flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-md border font-medium transition-all disabled:cursor-not-allowed ${
                        anyBusy && !isBusy ? "border-border2 bg-white/[0.02] text-faint opacity-40" : ACTION_STYLE[action]
                      }`}
                    >
                      {isBusy && <Spinner />}
                      {isBusy ? ACTION_LABEL_BUSY[action] : ACTION_LABEL[action]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
