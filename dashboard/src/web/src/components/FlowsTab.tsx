import { useMemo, useState } from "react";
import type { FlowEntry } from "../types";

function statusColor(status: number | null) {
  if (status === null) return "text-faint";
  if (status >= 500) return "text-signal-critical";
  if (status >= 400) return "text-signal-warn";
  if (status >= 300) return "text-signal-info";
  return "text-accent";
}

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString();
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className={`shrink-0 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
    >
      <path d="M3 1.5 L7 5 L3 8.5" stroke="#5a6472" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FlowsTab({ flows }: { flows: FlowEntry[] }) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!filter.trim()) return flows;
    const f = filter.toLowerCase();
    return flows.filter((e) => e.host.toLowerCase().includes(f) || e.path.toLowerCase().includes(f));
  }, [flows, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by host or path…"
          className="w-80 bg-surface2 border border-border rounded-md px-3 py-1.5 text-sm placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
        />
        <span className="text-xs text-muted mono">
          {filtered.length} of {flows.length}
        </span>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-surface">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-surface2 text-faint text-[11px] uppercase tracking-wideish">
            <tr>
              <th className="w-7"></th>
              <th className="text-left font-medium px-3 py-2.5">Time</th>
              <th className="text-left font-medium px-3 py-2.5">Host</th>
              <th className="text-left font-medium px-3 py-2.5">Method</th>
              <th className="text-left font-medium px-3 py-2.5">Path</th>
              <th className="text-right font-medium px-3 py-2.5">Status</th>
              <th className="text-right font-medium px-3 py-2.5 pr-4">Size</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-14 text-center text-faint text-sm">
                  No flows yet — traffic through the proxy appears here the moment it happens.
                </td>
              </tr>
            )}
            {filtered.map((entry, i) => {
              const isOpen = expanded === i;
              return (
                <>
                  <tr
                    key={i}
                    onClick={() => setExpanded(isOpen ? null : i)}
                    className={`group border-t border-border cursor-pointer transition-colors animate-rise ${
                      i % 2 === 1 ? "bg-white/[0.008]" : ""
                    } ${isOpen ? "bg-accent-soft/40" : "hover:bg-white/[0.03]"}`}
                  >
                    <td className="pl-3">
                      <Chevron open={isOpen} />
                    </td>
                    <td className="px-3 py-2.5 mono text-faint whitespace-nowrap">{fmtTime(entry.ts)}</td>
                    <td className="px-3 py-2.5 mono text-ink">{entry.host}</td>
                    <td className="px-3 py-2.5 mono text-muted">{entry.method}</td>
                    <td className="px-3 py-2.5 mono text-muted max-w-md truncate">{entry.path}</td>
                    <td className={`px-3 py-2.5 mono text-right ${statusColor(entry.status)}`}>{entry.status ?? "–"}</td>
                    <td className="px-3 py-2.5 mono text-right text-muted pr-4">{fmtBytes(entry.req_size)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} className="p-0 border-none">
                        <div className="bg-surface2/60 border-t border-border px-4 py-4 animate-rise">
                          <div className="grid grid-cols-2 gap-5 text-xs">
                            <div>
                              <div className="text-faint mb-1.5 uppercase tracking-wideish text-[10px]">
                                Request body preview
                              </div>
                              <pre className="mono bg-black/40 border border-border rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-all text-muted">
                                {entry.req_body_preview ?? "(empty body)"}
                              </pre>
                            </div>
                            <div>
                              <div className="text-faint mb-1.5 uppercase tracking-wideish text-[10px]">SHA-256</div>
                              <div className="mono break-all text-muted">{entry.req_body_sha256 ?? "–"}</div>
                              <div className="text-faint mt-3 mb-1.5 uppercase tracking-wideish text-[10px]">
                                Response size
                              </div>
                              <div className="mono text-muted">{fmtBytes(entry.resp_size)}</div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
