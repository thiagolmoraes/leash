import { useEffect, useState } from "react";
import type { Harness, ScanReport } from "../types";
import { api } from "../api";

const HARNESSES: { id: Harness; label: string; experimental?: boolean }[] = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "gemini", label: "Gemini" },
  { id: "grok", label: "Grok", experimental: true },
];

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: "bg-signal-critical/10 text-signal-critical border-signal-critical/30",
  HIGH: "bg-signal-critical/10 text-signal-critical border-signal-critical/30",
  MEDIUM: "bg-signal-warn/10 text-signal-warn border-signal-warn/30",
  LOW: "bg-signal-info/10 text-signal-info border-signal-info/30",
};

function severityStyle(sev: string) {
  return SEVERITY_STYLE[sev.toUpperCase()] ?? "bg-white/5 text-muted border-border2";
}

function scoreColor(score: number) {
  if (score >= 70) return "text-signal-critical";
  if (score >= 30) return "text-signal-warn";
  return "text-accent";
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
      <path d="M3 1.5 L7 5 L3 8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.25" />
      <path d="M10.5 6a4.5 4.5 0 0 0-4.5-4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function SkillsTab() {
  const [harness, setHarness] = useState<Harness>("claude");
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [installed, setInstalled] = useState<string[]>([]);
  const [issuesOpen, setIssuesOpen] = useState(false);

  const loadInstalled = (h: Harness) => {
    api.listSkills(h).then((r) => setInstalled(r.skills)).catch(() => setInstalled([]));
  };

  useEffect(() => loadInstalled(harness), [harness]);

  const scan = async () => {
    if (!url.trim()) return;
    setScanning(true);
    setError(null);
    setReport(null);
    setInstallMessage(null);
    setIssuesOpen(false);
    try {
      const r = await api.scanSkill(url.trim());
      setReport(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const install = async () => {
    setInstalling(true);
    setInstallMessage(null);
    try {
      const r = await api.installSkill(harness, url.trim());
      const label = HARNESSES.find((h) => h.id === harness)?.label;
      const names = r.names.map((n) => `"${n}"`).join(", ");
      setInstallMessage(
        r.names.length === 1 ? `Installed ${names} for ${label}.` : `Installed ${r.names.length} skills for ${label}: ${names}.`,
      );
      loadInstalled(harness);
    } catch (e) {
      setInstallMessage(`Couldn't install: ${(e as Error).message}`);
    } finally {
      setInstalling(false);
    }
  };

  const remove = async (name: string) => {
    try {
      await api.removeSkill(harness, name);
      loadInstalled(harness);
    } catch {
      // best-effort — list refresh will show the true state either way
    }
  };

  const score = report?.risk_assessment.score ?? 0;
  const isRisky = score >= 30;

  return (
    <div className="max-w-2xl flex flex-col gap-7">
      <div>
        <div className="text-[11px] font-medium text-faint uppercase tracking-wideish mb-2">Install for</div>
        <div className="flex gap-2">
          {HARNESSES.map((h) => (
            <button
              key={h.id}
              onClick={() => setHarness(h.id)}
              className={`relative px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                harness === h.id
                  ? "bg-accent-soft text-accent border-accent-dim"
                  : "bg-surface2 text-muted border-border hover:border-border2"
              }`}
            >
              {h.label}
              {h.experimental && (
                <span className="ml-1.5 text-[9px] align-middle px-1 py-0.5 rounded bg-signal-warn/10 text-signal-warn border border-signal-warn/30 uppercase tracking-wideish">
                  experimental
                </span>
              )}
            </button>
          ))}
        </div>
        {HARNESSES.find((h) => h.id === harness)?.experimental && (
          <p className="text-xs text-signal-warn mt-2">
            Grok's skill manifest format isn't officially documented — install is best-effort and may not activate correctly.
          </p>
        )}
      </div>

      <div>
        <div className="text-[11px] font-medium text-faint uppercase tracking-wideish mb-2">Skill or plugin URL</div>
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scan()}
            placeholder="https://github.com/owner/skill-repo"
            className="flex-1 bg-surface2 border border-border rounded-md px-3 py-1.5 text-sm mono placeholder:text-faint focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors"
          />
          <button
            onClick={scan}
            disabled={scanning || !url.trim()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium bg-accent-soft text-accent border border-accent-dim hover:bg-accent-dim disabled:opacity-50 transition-colors"
          >
            {scanning && <Spinner />}
            {scanning ? "Scanning…" : "Scan"}
          </button>
        </div>
        {error && <div className="text-xs text-signal-critical mt-2">{error}</div>}
      </div>

      {report && (
        <div className="border border-border rounded-lg bg-surface p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wideish text-faint mb-1">Risk score</div>
              <div className={`text-3xl font-semibold mono leading-none ${scoreColor(score)}`}>{score}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wideish text-faint mb-1">Recommendation</div>
              <div className={`text-sm font-medium ${scoreColor(score)}`}>{report.risk_assessment.recommendation}</div>
            </div>
          </div>

          {report.issues.length > 0 ? (
            <div>
              <button
                onClick={() => setIssuesOpen((o) => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink transition-colors"
              >
                <Chevron open={issuesOpen} />
                {issuesOpen ? "Hide" : "Show"} {report.issues.length} finding{report.issues.length === 1 ? "" : "s"}
              </button>
              {issuesOpen && (
                <div className="flex flex-col gap-2 mt-3 animate-rise max-h-[420px] overflow-y-auto pr-1">
                  {report.issues.map((issue, i) => (
                    <div key={i} className="border border-border rounded-md px-3 py-2.5 bg-surface2/40">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border tracking-wideish uppercase ${severityStyle(issue.severity)}`}
                        >
                          {issue.severity}
                        </span>
                        <span className="text-xs font-medium text-ink">{issue.category}</span>
                        {issue.location.file && (
                          <span className="text-[11px] mono text-faint ml-auto">{issue.location.file}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted leading-relaxed">{issue.explanation}</div>
                      <div className="text-xs text-faint leading-relaxed mt-1">{issue.remediation}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted">No issues found by static analysis.</div>
          )}

          {isRisky && (
            <div className="text-xs text-signal-warn bg-signal-warn/10 border border-signal-warn/30 rounded-md px-3 py-2">
              This skill scored {score}/100 — review the findings above before installing. Installing is still
              your call; Leash won't block it.
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={install}
              disabled={installing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-accent text-bg hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {installing && <Spinner />}
              {installing ? "Installing…" : `Install for ${HARNESSES.find((h) => h.id === harness)?.label}`}
            </button>
            {installMessage && (
              <span className={`text-sm ${installMessage.startsWith("Couldn't") ? "text-signal-critical" : "text-accent"}`}>
                {installMessage}
              </span>
            )}
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] font-medium text-faint uppercase tracking-wideish mb-2">
          Installed for {HARNESSES.find((h) => h.id === harness)?.label} · {installed.length}
        </div>
        <div className="border border-border rounded-lg divide-y divide-border bg-surface">
          {installed.map((name) => (
            <div key={name} className="flex items-center justify-between px-3 py-2 text-sm mono group">
              <span className="text-muted group-hover:text-ink transition-colors">{name}</span>
              <button
                onClick={() => remove(name)}
                className="text-xs text-faint hover:text-signal-critical transition-colors opacity-0 group-hover:opacity-100"
              >
                Remove
              </button>
            </div>
          ))}
          {installed.length === 0 && (
            <div className="px-3 py-6 text-center text-faint text-sm">Nothing installed yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
