import { useCallback, useEffect, useMemo, useState } from "react";
import { TopBar, type Tab } from "./components/TopBar";
import { FlowsTab } from "./components/FlowsTab";
import { BlockedTab } from "./components/BlockedTab";
import { FalcoTab } from "./components/FalcoTab";
import { PolicyTab } from "./components/PolicyTab";
import { ContainersTab } from "./components/ContainersTab";
import { SkillsTab } from "./components/SkillsTab";
import { StatRow } from "./components/StatRow";
import { HostBreakdown, countBy } from "./components/HostBreakdown";
import { useStream } from "./useStream";
import { api } from "./api";
import type { FlowEntry, BlockedEntry, FalcoEntry, StreamMessage } from "./types";

const MAX_ENTRIES = 500;

function prepend<T>(list: T[], entry: T): T[] {
  return [entry, ...list].slice(0, MAX_ENTRIES);
}

const TAB_COPY: Record<Tab, { title: string; sub: string }> = {
  Flows: { title: "Flows", sub: "Every decrypted request the proxy has seen, newest first." },
  Blocked: { title: "Blocked", sub: "Requests the allowlist rejected before they left the sandbox." },
  Falco: { title: "Falco alerts", sub: "Syscall-level signals — credential reads, escapes, bypass attempts." },
  Policy: { title: "Policy", sub: "The domain allowlist and enforcement mode agents run under." },
  Containers: { title: "Containers", sub: "proxy, agents, and falco — start, stop, or restart." },
  Skills: { title: "Skills", sub: "Scan a skill or plugin URL before installing it into the sandbox." },
};

export default function App() {
  const [tab, setTab] = useState<Tab>("Flows");
  const [flows, setFlows] = useState<FlowEntry[]>([]);
  const [blocked, setBlocked] = useState<BlockedEntry[]>([]);
  const [falco, setFalco] = useState<FalcoEntry[]>([]);
  const [pulseTick, setPulseTick] = useState(0);
  const [pulseBlocked, setPulseBlocked] = useState(false);

  useEffect(() => {
    api.logs<FlowEntry>("flows").then((r) => setFlows([...r.entries].reverse()));
    api.logs<BlockedEntry>("blocked").then((r) => setBlocked([...r.entries].reverse()));
    api.logs<FalcoEntry>("falco").then((r) => setFalco([...r.entries].reverse()));
  }, []);

  const onMessage = useCallback((msg: StreamMessage) => {
    if (msg.kind === "flows") setFlows((prev) => prepend(prev, msg.entry));
    else if (msg.kind === "blocked") setBlocked((prev) => prepend(prev, msg.entry));
    else if (msg.kind === "falco") setFalco((prev) => prepend(prev, msg.entry));
    if (msg.kind === "flows" || msg.kind === "blocked") {
      setPulseBlocked(msg.kind === "blocked");
      setPulseTick((t) => t + 1);
    }
  }, []);

  const connState = useStream(onMessage);

  const uniqueHosts = useMemo(() => new Set(flows.map((f) => f.host)).size, [flows]);
  const errorFlows = useMemo(() => flows.filter((f) => (f.status ?? 0) >= 400).length, [flows]);
  const criticalFalco = useMemo(
    () => falco.filter((f) => ["Critical", "Alert", "Emergency"].includes(f.priority)).length,
    [falco],
  );
  const flowsByHost = useMemo(() => countBy(flows, (f) => f.host), [flows]);
  const blockedByHost = useMemo(() => countBy(blocked, (b) => b.host), [blocked]);
  const topFlowHost = flowsByHost.length > 0 ? [...flowsByHost].sort((a, b) => b.count - a.count)[0] : null;

  return (
    <div className="min-h-full flex flex-col">
      <TopBar active={tab} onChange={setTab} connState={connState} pulseTick={pulseTick} pulseBlocked={pulseBlocked} />
      <main className="max-w-7xl w-full mx-auto px-5 py-8 flex-1">
        <div className="mb-6">
          <h1 className="text-[22px] font-semibold tracking-tightish text-ink">{TAB_COPY[tab].title}</h1>
          <p className="text-sm text-muted mt-0.5">{TAB_COPY[tab].sub}</p>
        </div>

        {tab === "Flows" && (
          <>
            <StatRow
              stats={[
                { label: "Total flows", value: String(flows.length) },
                {
                  label: "Unique hosts",
                  value: String(uniqueHosts),
                  hint: topFlowHost ? `busiest: ${topFlowHost.host}` : undefined,
                },
                { label: "Error responses", value: String(errorFlows), tone: errorFlows > 0 ? "critical" : "default" },
              ]}
            />
            <FlowsTab flows={flows} />
            <HostBreakdown items={flowsByHost} />
          </>
        )}
        {tab === "Blocked" && (
          <>
            <StatRow
              stats={[
                { label: "Blocked attempts", value: String(blocked.length), tone: blocked.length > 0 ? "critical" : "default" },
                { label: "Unique hosts", value: String(new Set(blocked.map((b) => b.host)).size) },
              ]}
            />
            <BlockedTab blocked={blocked} />
            <HostBreakdown items={blockedByHost} tone="critical" />
          </>
        )}
        {tab === "Falco" && (
          <>
            <StatRow
              stats={[
                { label: "Total alerts", value: String(falco.length) },
                { label: "Critical", value: String(criticalFalco), tone: criticalFalco > 0 ? "critical" : "default" },
              ]}
            />
            <FalcoTab alerts={falco} />
          </>
        )}
        {tab === "Policy" && <PolicyTab />}
        {tab === "Containers" && <ContainersTab />}
        {tab === "Skills" && <SkillsTab />}
      </main>
    </div>
  );
}
