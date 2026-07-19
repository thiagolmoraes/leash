import { useState } from "react";
import type { BlockedEntry, Policy } from "../types";
import { api } from "../api";

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString();
}

export function BlockedTab({ blocked }: { blocked: BlockedEntry[] }) {
  const [busyHost, setBusyHost] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const allowHost = async (host: string) => {
    setBusyHost(host);
    setMessage(null);
    try {
      const current: Policy = await api.getPolicy();
      if (!current.allow.includes(host)) {
        await api.putPolicy({ mode: current.mode, allow: [...current.allow, host] });
        await api.reloadPolicy();
      }
      setMessage(`Allowed "${host}" and reloaded the proxy.`);
    } catch (e) {
      setMessage(`Couldn't allow "${host}": ${(e as Error).message}`);
    } finally {
      setBusyHost(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {message && (
        <div className="text-sm px-3 py-2 rounded-md bg-surface2 border border-border text-muted animate-rise">
          {message}
        </div>
      )}
      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface2 text-faint text-[11px] uppercase tracking-wideish">
            <tr>
              <th className="text-left font-medium px-3 py-2.5">Time</th>
              <th className="text-left font-medium px-3 py-2.5">Host</th>
              <th className="text-left font-medium px-3 py-2.5">Method</th>
              <th className="text-left font-medium px-3 py-2.5">Path</th>
              <th className="text-right font-medium px-3 py-2.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {blocked.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-14 text-center text-faint text-sm">
                  Nothing blocked yet — the allowlist is holding.
                </td>
              </tr>
            )}
            {blocked.map((entry, i) => (
              <tr
                key={i}
                className={`border-t border-border hover:bg-white/[0.03] transition-colors animate-rise ${
                  i % 2 === 1 ? "bg-white/[0.008]" : ""
                }`}
              >
                <td className="px-3 py-2.5 mono text-faint whitespace-nowrap">{fmtTime(entry.ts)}</td>
                <td className="px-3 py-2.5 mono text-signal-critical">{entry.host}</td>
                <td className="px-3 py-2.5 mono text-muted">{entry.method}</td>
                <td className="px-3 py-2.5 mono text-muted max-w-md truncate">{entry.path}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={() => allowHost(entry.host)}
                    disabled={busyHost === entry.host}
                    className="text-xs px-2.5 py-1 rounded-md bg-accent-soft text-accent border border-accent-dim hover:bg-accent-dim hover:border-accent disabled:opacity-50 transition-colors"
                  >
                    {busyHost === entry.host ? "Allowing…" : "Allow this host"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
