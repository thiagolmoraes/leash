import type { ConnState } from "../useStream";
import { PulseWave } from "./PulseWave";

const TABS = ["Flows", "Blocked", "Falco", "Policy", "Containers", "Skills"] as const;
export type Tab = (typeof TABS)[number];

function LeashMark() {
  // A collar/loop glyph — literal to the product name, quiet enough to sit
  // next to a wordmark without looking like a mascot.
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <circle cx="11" cy="8.5" r="6" stroke="#00d9a3" strokeWidth="1.6" />
      <path d="M8.5 13.5 L6 20 M13.5 13.5 L16 20" stroke="#00d9a3" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="11" cy="8.5" r="1.6" fill="#00d9a3" />
    </svg>
  );
}

export function TopBar({
  active,
  onChange,
  connState,
  pulseTick,
  pulseBlocked,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  connState: ConnState;
  pulseTick: number;
  pulseBlocked: boolean;
}) {
  const dotColor =
    connState === "connected" ? "bg-accent" : connState === "connecting" ? "bg-signal-warn" : "bg-signal-critical";
  const label = connState === "connected" ? "Live" : connState === "connecting" ? "Connecting" : "Disconnected";

  return (
    <header className="border-b border-border bg-surface/90 backdrop-blur sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-5 flex items-center gap-7 h-16">
        <div className="flex items-center gap-2.5 shrink-0">
          <LeashMark />
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold tracking-tightish text-[17px] text-ink">Leash</span>
            <span className="text-faint text-[11px] uppercase tracking-wideish hidden sm:inline">Dashboard</span>
          </div>
        </div>

        <nav className="flex items-center gap-1 flex-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => onChange(tab)}
              className={`relative px-3 py-2 text-[13px] font-medium transition-colors ${
                active === tab ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {tab}
              {active === tab && (
                <span className="absolute left-3 right-3 -bottom-[1px] h-[2px] bg-accent rounded-full" />
              )}
            </button>
          ))}
        </nav>

        <div className="hidden md:block w-40 h-8 opacity-90">
          <PulseWave tick={pulseTick} blocked={pulseBlocked} />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${connState === "connected" ? "animate-pulseDot" : ""}`} />
          <span className="mono">{label}</span>
        </div>
      </div>
    </header>
  );
}
