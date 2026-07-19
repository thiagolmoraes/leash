// Fetches, scans (via the skillspector sidecar), and installs skills/plugins
// into the agents container's per-harness directory. Each harness dir is a
// named Docker volume shared between `dashboard` and `agents` (see
// docker-compose.yml's skills-* volumes) — deliberately NOT a host bind
// mount, so installed skill contents never touch the macOS filesystem.
import { readdir, rm } from "node:fs/promises";
import { dns } from "bun";
import { join } from "node:path";

export type Harness = "claude" | "codex" | "gemini" | "grok";

const HARNESSES: Harness[] = ["claude", "codex", "gemini", "grok"];

// Overridable for local dev (outside the container, where /skills doesn't exist).
const SKILLS_ROOT = process.env.LEASH_SKILLS_DIR ?? "/skills";
const SKILLSPECTOR_URL = process.env.SKILLSPECTOR_URL ?? "http://skillspector:8090";

// UID:GID of the `agent` user inside the agents container (see
// agents/Dockerfile — `useradd -ms /bin/bash agent` is the first user
// created, so it's 1001:1001 on Debian). Named Docker volumes (unlike Lima's
// virtiofs bind mounts) support real chown from the guest, so this actually
// takes effect.
const AGENT_UID = process.env.LEASH_AGENT_UID ?? "1001";
const AGENT_GID = process.env.LEASH_AGENT_GID ?? "1001";

function harnessDir(harness: Harness): string {
  return `${SKILLS_ROOT}/${harness}`;
}

export function isHarness(v: unknown): v is Harness {
  return typeof v === "string" && (HARNESSES as string[]).includes(v);
}

// Mirrors skillspector's own git-host allowlist + SSRF guard (see its
// input_handler.py) — the dashboard does its own clone for install (the
// scanner doesn't hand back the files it fetched), so it needs the same
// protections independently.
const ALLOWED_GIT_HOSTS = ["github.com", "gitlab.com", "bitbucket.org"];

// Known skill directories/marketplaces that list skills but don't host the
// code themselves — cloning their URL directly can't work. Point the user at
// what actually will: the GitHub/GitLab/Bitbucket link the listing itself
// links out to.
const KNOWN_DIRECTORY_HOSTS = new Set(["skillsmp.com", "www.skillsmp.com", "agentskills.io", "www.agentskills.io"]);

async function isPrivateHost(host: string): Promise<boolean> {
  try {
    const results = await dns.lookup(host, { family: 0 });
    for (const r of Array.isArray(results) ? results : [results]) {
      const ip = r.address;
      if (
        ip === "127.0.0.1" ||
        ip === "::1" ||
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        ip.startsWith("169.254.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return true; // fail closed — can't resolve, don't trust it
  }
}

// Users often paste a browser URL to a specific subfolder/file (e.g.
// ".../tree/main/.claude/skills/foo" from clicking around on GitHub) instead
// of the repo's clone URL. `git clone` can't do anything with that — it 128s.
// Strip it back down to "https://host/owner/repo" when the shape matches a
// known browse-URL pattern, so cloning still works. GitLab is unbounded-depth
// (owner/group/subgroup/.../repo), so it's handled separately from the
// fixed-depth GitHub/Bitbucket case.
export function normalizeSkillUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname;
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (host === "github.com" || host.endsWith(".github.com") || host === "bitbucket.org") {
    // /owner/repo/(tree|blob|src)/<ref>/... -> /owner/repo
    if (segments.length > 2 && ["tree", "blob", "src"].includes(segments[2])) {
      return `${parsed.protocol}//${host}/${segments[0]}/${segments[1]}`;
    }
  } else if (host === "gitlab.com" || host.endsWith(".gitlab.com")) {
    // GitLab paths can nest (owner/group/.../repo/-/tree/<ref>/...) — cut at "/-/".
    const dashIndex = segments.indexOf("-");
    if (dashIndex > 1) {
      return `${parsed.protocol}//${host}/${segments.slice(0, dashIndex).join("/")}`;
    }
  }
  return url;
}

export async function validateSkillUrl(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "Not a valid URL.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "URL must be http(s).";
  }
  const host = parsed.hostname;
  if (!ALLOWED_GIT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    if (KNOWN_DIRECTORY_HOSTS.has(host)) {
      return `"${host}" is a skill directory, not a code host — it can't be cloned directly. Open the skill's page there and paste the GitHub/GitLab/Bitbucket repo link it points to instead.`;
    }
    return `Host "${host}" is not allowed. Supported: ${ALLOWED_GIT_HOSTS.join(", ")}.`;
  }
  if (await isPrivateHost(host)) {
    return `"${host}" resolves to a private/internal address — refusing (SSRF guard).`;
  }
  return null;
}

// name: derived from the repo URL (last path segment), used as the install
// directory name — must be filesystem-safe and unable to escape SKILLS_ROOT.
export function deriveSkillName(url: string): string {
  const parsed = new URL(url);
  const last = parsed.pathname.split("/").filter(Boolean).pop() ?? "skill";
  return last.replace(/\.git$/, "").replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
}

export function validateSkillName(name: string): string | null {
  if (!name) return "Name is empty.";
  if (!/^[a-z0-9._-]+$/i.test(name)) return "Name contains invalid characters.";
  if (name === "." || name === "..") return "Invalid name.";
  return null;
}

export interface ScanReport {
  skill: { name: string; source: string; scanned_at: string };
  risk_assessment: { score: number; severity: string; recommendation: string };
  issues: Array<{
    id: string;
    category: string;
    severity: string;
    explanation: string;
    remediation: string;
    location: { file: string; start_line: number | null; end_line: number | null };
  }>;
  metadata: Record<string, unknown>;
}

export async function scanSkill(url: string): Promise<ScanReport> {
  const res = await fetch(`${SKILLSPECTOR_URL}/scan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`scan failed: ${res.status} ${body}`);
  }
  return (await res.json()) as ScanReport;
}

async function cloneToTemp(url: string): Promise<string> {
  const tmp = `/tmp/skill-fetch-${crypto.randomUUID()}`;
  const proc = Bun.spawn(["git", "clone", "--depth", "1", url, tmp], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    const hint = /not found|does not exist|Repository not found/i.test(stderr)
      ? " (repo not found — check the URL points at an actual repository, not a subfolder or file page)"
      : "";
    throw new Error(`Couldn't clone "${url}"${hint}: ${stderr.trim().split("\n").pop()}`);
  }
  // Don't ship the clone's .git history into the installed skill directory.
  await rm(`${tmp}/.git`, { recursive: true, force: true });
  return tmp;
}

// Repos come in two shapes: a single skill (SKILL.md at the root) or a
// collection (multiple subdirectories, each with its own SKILL.md — e.g.
// anthropics/skills has skills/<name>/SKILL.md for a dozen skills). Detect
// which one we got so a collection installs as N separate skills instead of
// one giant, wrongly-nested "skill".
async function findSkillDirs(root: string): Promise<{ name: string; dir: string }[]> {
  if (await Bun.file(join(root, "SKILL.md")).exists()) {
    return [{ name: "", dir: root }]; // single skill — name resolved by caller
  }

  // Collect from both the repo root's own subdirectories AND a nested
  // skills/ dir — real-world repos use either or both (e.g. anthropics/skills
  // has both a stray root-level template/SKILL.md and the real collection
  // under skills/*/SKILL.md). De-duped by directory name below.
  const found = new Map<string, string>(); // name -> dir
  const searchRoots = [root, join(root, "skills")];
  for (const searchRoot of searchRoots) {
    let entries;
    try {
      entries = await readdir(searchRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const candidate = join(searchRoot, entry.name);
      if (await Bun.file(join(candidate, "SKILL.md")).exists()) {
        found.set(entry.name, candidate);
      }
    }
  }
  return [...found.entries()].map(([name, dir]) => ({ name, dir }));
}

async function chownForAgent(path: string) {
  await Bun.$`chown -R ${AGENT_UID}:${AGENT_GID} ${path}`.quiet();
}

// Claude Code / Codex both use a bare SKILL.md (+ optional supporting files)
// at the install-directory root — copy the resolved skill dir as-is.
async function installSkillMdStyle(harness: Harness, name: string, skillDir: string) {
  const dest = `${harnessDir(harness)}/${name}`;
  await rm(dest, { recursive: true, force: true });
  await Bun.$`mkdir -p ${dest}`.quiet();
  await Bun.$`cp -R ${skillDir}/. ${dest}/`.quiet();
  await chownForAgent(dest);
}

// Gemini CLI expects gemini-extension.json + GEMINI.md, not SKILL.md. If the
// source doesn't already ship a gemini-extension.json, synthesize a minimal
// one from whatever SKILL.md-style frontmatter/instructions it has.
async function installGeminiStyle(name: string, skillDir: string) {
  const dest = `${harnessDir("gemini")}/${name}`;
  await rm(dest, { recursive: true, force: true });
  await Bun.$`mkdir -p ${dest}`.quiet();
  await Bun.$`cp -R ${skillDir}/. ${dest}/`.quiet();

  const manifestPath = `${dest}/gemini-extension.json`;
  if (!(await Bun.file(manifestPath).exists())) {
    await Bun.write(
      manifestPath,
      JSON.stringify({ name, version: "0.0.0", description: `Installed via Leash from a scanned skill.` }, null, 2),
    );
  }
  const contextPath = `${dest}/GEMINI.md`;
  if (!(await Bun.file(contextPath).exists())) {
    const skillMd = Bun.file(`${dest}/SKILL.md`);
    if (await skillMd.exists()) {
      await Bun.write(contextPath, await skillMd.text());
    }
  }
  await chownForAgent(dest);
}

async function installOne(harness: Harness, name: string, skillDir: string) {
  if (harness === "gemini") {
    await installGeminiStyle(name, skillDir);
  } else {
    // claude, codex, grok — grok is unverified/best-effort, same SKILL.md shape assumed.
    await installSkillMdStyle(harness, name, skillDir);
  }
}

export async function installSkill(
  harness: Harness,
  url: string,
): Promise<{ names: string[] }> {
  const tmp = await cloneToTemp(url);
  try {
    const skillDirs = await findSkillDirs(tmp);
    if (skillDirs.length === 0) {
      throw new Error("No SKILL.md found — not at the repo root, and no skills/<name>/SKILL.md collection either.");
    }

    const names: string[] = [];
    for (const { name: subName, dir } of skillDirs) {
      // Single-skill case (subName === "") names from the repo URL; collection
      // entries keep their own subdirectory name.
      const rawName = subName || deriveSkillName(url);
      const name = rawName.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
      const nameErr = validateSkillName(name);
      if (nameErr) throw new Error(`"${rawName}": ${nameErr}`);
      await installOne(harness, name, dir);
      names.push(name);
    }
    return { names };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

export async function listInstalledSkills(harness: Harness): Promise<string[]> {
  try {
    const entries = await readdir(harnessDir(harness), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function removeSkill(harness: Harness, name: string): Promise<void> {
  const err = validateSkillName(name);
  if (err) throw new Error(err);
  await rm(`${harnessDir(harness)}/${name}`, { recursive: true, force: true });
}
