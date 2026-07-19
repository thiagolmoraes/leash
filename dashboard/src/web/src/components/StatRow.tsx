interface Stat {
  label: string;
  value: string;
  tone?: "default" | "critical" | "accent";
  hint?: string;
}

function StatIcon({ tone }: { tone: Stat["tone"] }) {
  const color = tone === "critical" ? "#ff4d6a" : tone === "accent" ? "#00d9a3" : "#5a6472";
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M1.5 10.5 L4.5 6.5 L7 8.5 L12.5 2"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-3 mb-6">
      {stats.map((s) => (
        <div
          key={s.label}
          className="relative bg-surface border border-border rounded-lg px-4 py-3.5 min-w-0 overflow-hidden"
        >
          <span
            className={`absolute left-0 top-0 bottom-0 w-[2px] ${
              s.tone === "critical" ? "bg-signal-critical" : s.tone === "accent" ? "bg-accent" : "bg-border2"
            }`}
          />
          <div className="flex items-center gap-1.5 mb-1.5">
            <StatIcon tone={s.tone} />
            <span className="text-[10px] uppercase tracking-wideish text-faint">{s.label}</span>
          </div>
          <div
            className={`text-2xl font-semibold mono leading-none truncate ${
              s.tone === "critical" ? "text-signal-critical" : s.tone === "accent" ? "text-accent" : "text-ink"
            }`}
          >
            {s.value}
          </div>
          {s.hint && <div className="text-[11px] text-faint mt-1.5 truncate">{s.hint}</div>}
        </div>
      ))}
    </div>
  );
}
