import { useEffect, useMemo, useState } from "react";
import type { FalcoEntry } from "../types";

// Falco's own severity levels, most to least severe.
const PRIORITIES = ["Emergency", "Alert", "Critical", "Error", "Warning", "Notice", "Informational", "Debug"] as const;
type Priority = (typeof PRIORITIES)[number];

const PRIORITY_STYLE: Record<string, string> = {
  Emergency: "bg-signal-critical/10 text-signal-critical border-signal-critical/30",
  Alert: "bg-signal-critical/10 text-signal-critical border-signal-critical/30",
  Critical: "bg-signal-critical/10 text-signal-critical border-signal-critical/30",
  Error: "bg-signal-critical/10 text-signal-critical border-signal-critical/30",
  Warning: "bg-signal-warn/10 text-signal-warn border-signal-warn/30",
  Notice: "bg-signal-info/10 text-signal-info border-signal-info/30",
  Informational: "bg-white/5 text-muted border-border2",
  Debug: "bg-white/[0.02] text-faint border-border",
};

function badgeStyle(priority: string) {
  return PRIORITY_STYLE[priority] ?? "bg-white/5 text-muted border-border2";
}

const STORAGE_KEY = "leash.falco.priorityFilter";
const ALL = "All";
type PriorityFilter = Priority | typeof ALL;

function loadPriorityFilter(): PriorityFilter {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === ALL || (PRIORITIES as readonly string[]).includes(saved ?? "")) {
    return saved as PriorityFilter;
  }
  return ALL;
}

export function FalcoTab({ alerts }: { alerts: FalcoEntry[] }) {
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>(loadPriorityFilter);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, priorityFilter);
  }, [priorityFilter]);

  const filtered = useMemo(
    () => (priorityFilter === ALL ? alerts : alerts.filter((a) => a.priority === priorityFilter)),
    [alerts, priorityFilter],
  );
  const hiddenCount = alerts.length - filtered.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wideish text-faint">Priority</span>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
            className="bg-surface2 border border-border rounded-md px-2 py-1 text-xs mono text-ink focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
          >
            <option value={ALL}>All</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        {hiddenCount > 0 && (
          <span className="text-xs text-faint">{hiddenCount} other alert{hiddenCount === 1 ? "" : "s"} hidden</span>
        )}
      </div>

      {filtered.length === 0 && (
        <div className="border border-border rounded-lg px-3 py-14 text-center text-faint text-sm bg-surface">
          {alerts.length === 0
            ? "No Falco alerts yet — syscall activity looks clean."
            : `No ${priorityFilter} alerts. ${hiddenCount} other alert${hiddenCount === 1 ? "" : "s"} hidden.`}
        </div>
      )}
      {filtered.map((entry, i) => (
        <div key={i} className="border border-border rounded-lg px-4 py-3 bg-surface hover:border-border2 transition-colors animate-rise">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border tracking-wideish uppercase ${badgeStyle(entry.priority)}`}>
              {entry.priority}
            </span>
            <span className="text-sm font-medium text-ink">{entry.rule}</span>
          </div>
          <div className="mono text-xs text-faint break-all leading-relaxed">{entry.output}</div>
        </div>
      ))}
    </div>
  );
}
