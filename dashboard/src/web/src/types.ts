export interface FlowEntry {
  ts: number;
  host: string;
  method: string;
  path: string;
  status: number | null;
  req_size: number;
  req_body_sha256: string | null;
  req_body_preview: string | null;
  resp_size: number;
}

export interface BlockedEntry {
  ts: number;
  event: "blocked";
  host: string;
  method: string;
  path: string;
}

export interface FalcoEntry {
  hostname?: string;
  output: string;
  output_fields?: Record<string, unknown>;
  priority: string;
  rule: string;
  source?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface Policy {
  mode: "enforce" | "observe";
  allow: string[];
}

export interface ContainerStatus {
  name: string;
  state: string;
  status: string;
  image: string;
}

export type StreamMessage =
  | { kind: "flows"; entry: FlowEntry }
  | { kind: "blocked"; entry: BlockedEntry }
  | { kind: "falco"; entry: FalcoEntry };

export type Harness = "claude" | "codex" | "gemini" | "grok";

export interface ScanIssue {
  id: string;
  category: string;
  severity: string;
  explanation: string;
  remediation: string;
  location: { file: string; start_line: number | null; end_line: number | null };
}

export interface ScanReport {
  skill: { name: string; source: string; scanned_at: string };
  risk_assessment: { score: number; severity: string; recommendation: string };
  issues: ScanIssue[];
  metadata: Record<string, unknown>;
}
