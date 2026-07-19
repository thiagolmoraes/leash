import type { Policy, Harness, ScanReport } from "./types";

async function json<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  logs: <T,>(kind: "flows" | "blocked" | "falco", limit = 200) =>
    fetch(`/api/logs/${kind}?limit=${limit}`).then((r) => json<{ entries: T[] }>(r)),

  getPolicy: () => fetch("/api/policy").then((r) => json<Policy>(r)),

  putPolicy: (policy: Policy) =>
    fetch("/api/policy", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(policy),
    }).then((r) => json<{ ok: true }>(r)),

  reloadPolicy: () =>
    fetch("/api/policy/reload", { method: "POST" }).then((r) => json<{ ok: true }>(r)),

  getContainers: () =>
    fetch("/api/containers").then((r) => json<{ containers: import("./types").ContainerStatus[] }>(r)),

  containerAction: (name: string, action: "start" | "stop" | "restart") =>
    fetch(`/api/containers/${name}/${action}`, { method: "POST" }).then((r) => json<{ ok: true }>(r)),

  scanSkill: (url: string) =>
    fetch("/api/skills/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    }).then((r) => json<ScanReport>(r)),

  installSkill: (harness: Harness, url: string) =>
    fetch("/api/skills/install", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ harness, url }),
    }).then((r) => json<{ ok: true; names: string[] }>(r)),

  listSkills: (harness: Harness) =>
    fetch(`/api/skills/${harness}`).then((r) => json<{ skills: string[] }>(r)),

  removeSkill: (harness: Harness, name: string) =>
    fetch(`/api/skills/${harness}/${name}`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
};
