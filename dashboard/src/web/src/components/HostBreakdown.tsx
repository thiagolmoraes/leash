import { useMemo } from "react";

interface HostCount {
  host: string;
  count: number;
}

// A small horizontal-bar breakdown of which hosts account for the most
// traffic — turns "which agent is talking to whom the most" into a glance
// instead of a scroll through the table.
export function HostBreakdown({ items, tone }: { items: HostCount[]; tone?: "default" | "critical" }) {
  const top = useMemo(() => [...items].sort((a, b) => b.count - a.count).slice(0, 6), [items]);
  const max = top[0]?.count ?? 1;

  if (top.length === 0) return null;

  const barColor = tone === "critical" ? "bg-signal-critical/70" : "bg-accent/70";

  return (
    <div className="border border-border rounded-lg bg-surface px-4 py-3.5 mt-4">
      <div className="text-[10px] uppercase tracking-wideish text-faint mb-3">Top hosts</div>
      <div className="flex flex-col gap-2">
        {top.map((item) => (
          <div key={item.host} className="flex items-center gap-3">
            <span className="mono text-xs text-muted w-56 truncate shrink-0" title={item.host}>
              {item.host}
            </span>
            <div className="flex-1 h-1.5 bg-surface2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }}
              />
            </div>
            <span className="mono text-xs text-faint w-6 text-right shrink-0">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function countBy<T>(items: T[], key: (item: T) => string): HostCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].map(([host, count]) => ({ host, count }));
}
