// Talks to the Docker Engine API over the mounted unix socket. Bun's fetch
// supports a `unix` option directly, no docker client library needed.
const SOCK = "/var/run/docker.sock";

// Only these compose-managed containers can be controlled from the dashboard —
// never allow arbitrary container names (this socket is host-Docker-equivalent).
const MANAGED = new Set(["proxy", "agents", "falco", "skillspector"]);

async function dockerFetch(path: string, init?: RequestInit) {
  const res = await fetch(`http://localhost${path}`, { ...init, unix: SOCK } as RequestInit);
  return res;
}

export interface ContainerStatus {
  name: string;
  state: string; // running, exited, created, ...
  status: string; // human string e.g. "Up 2 hours"
  image: string;
}

export async function listManagedContainers(): Promise<ContainerStatus[]> {
  const res = await dockerFetch("/containers/json?all=true");
  if (!res.ok) throw new Error(`Docker API error: ${res.status}`);
  const containers = (await res.json()) as Array<{
    Names: string[];
    State: string;
    Status: string;
    Image: string;
  }>;

  const out: ContainerStatus[] = [];
  for (const name of MANAGED) {
    const c = containers.find((c) => c.Names.some((n) => n.replace(/^\//, "") === name));
    out.push({
      name,
      state: c?.State ?? "absent",
      status: c?.Status ?? "not created",
      image: c?.Image ?? "",
    });
  }
  return out;
}

export type ContainerAction = "start" | "stop" | "restart";

export async function containerAction(name: string, action: ContainerAction): Promise<void> {
  if (!MANAGED.has(name)) throw new Error(`"${name}" is not a managed container`);
  const res = await dockerFetch(`/containers/${name}/${action}`, { method: "POST" });
  // 204 = success, 304 = already in that state (not an error for our purposes)
  if (!res.ok && res.status !== 304) {
    const body = await res.text().catch(() => "");
    throw new Error(`Docker ${action} on ${name} failed: ${res.status} ${body}`);
  }
}
