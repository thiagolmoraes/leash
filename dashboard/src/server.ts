import { Hono } from "hono";
import { cors } from "hono/cors";
import { createBunWebSocket } from "hono/bun";
import { readTail, tailFollow, type LogKind } from "./logs";
import { readPolicy, writePolicy, validateHost, type Policy } from "./policy";
import { listManagedContainers, containerAction, type ContainerAction } from "./docker";
import {
  isHarness,
  normalizeSkillUrl,
  validateSkillUrl,
  scanSkill,
  installSkill,
  listInstalledSkills,
  removeSkill,
} from "./skills";

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono();
app.use("/api/*", cors());

// ── Logs ─────────────────────────────────────────────────────────────────

app.get("/api/logs/:kind", async (c) => {
  const kind = c.req.param("kind") as LogKind;
  if (!["flows", "blocked", "falco"].includes(kind)) {
    return c.json({ error: "unknown log kind" }, 400);
  }
  const limit = Number(c.req.query("limit") ?? 200);
  const entries = await readTail(kind, Number.isFinite(limit) ? limit : 200);
  return c.json({ entries });
});

// Live tail of all three logs over one WebSocket. Each message:
// { kind: "flows"|"blocked"|"falco", entry: {...} }
app.get(
  "/api/stream",
  upgradeWebSocket(() => {
    let stopFns: Array<() => void> = [];
    return {
      onOpen(_evt, ws) {
        const kinds: LogKind[] = ["flows", "blocked", "falco"];
        stopFns = kinds.map((kind) =>
          tailFollow(kind, (entry) => {
            try {
              ws.send(JSON.stringify({ kind, entry }));
            } catch {
              // socket closing, ignore
            }
          }),
        );
      },
      onClose() {
        stopFns.forEach((stop) => stop());
      },
    };
  }),
);

// ── Policy (allowlist + mode) ───────────────────────────────────────────────

app.get("/api/policy", async (c) => {
  try {
    const policy = await readPolicy();
    return c.json(policy);
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

app.put("/api/policy", async (c) => {
  const body = await c.req.json<Policy>().catch(() => null);
  if (!body || !Array.isArray(body.allow) || typeof body.mode !== "string") {
    return c.json({ error: "invalid policy payload" }, 400);
  }
  for (const host of body.allow) {
    const err = validateHost(host);
    if (err) return c.json({ error: err }, 400);
  }
  try {
    await writePolicy(body);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

// Applies a just-saved policy by restarting the proxy container (policy.yaml
// is volume-mounted, so this is the same as `make restart-proxy`).
app.post("/api/policy/reload", async (c) => {
  try {
    await containerAction("proxy", "restart");
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

// ── Containers ───────────────────────────────────────────────────────────

app.get("/api/containers", async (c) => {
  try {
    const containers = await listManagedContainers();
    return c.json({ containers });
  } catch (e) {
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/api/containers/:name/:action", async (c) => {
  const name = c.req.param("name");
  const action = c.req.param("action") as ContainerAction;
  if (!["start", "stop", "restart"].includes(action)) {
    return c.json({ error: "invalid action" }, 400);
  }
  try {
    await containerAction(name, action);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

// ── Skills (scan-then-install for agent skills/plugins) ─────────────────────
// The scan never blocks install — it only informs. The UI decides how to
// present risk; this API always allows installing regardless of score.

app.post("/api/skills/scan", async (c) => {
  const body = await c.req.json<{ url?: string }>().catch(() => null);
  if (!body?.url) return c.json({ error: "url is required" }, 400);
  const url = normalizeSkillUrl(body.url);
  const urlErr = await validateSkillUrl(url);
  if (urlErr) return c.json({ error: urlErr }, 400);
  try {
    const report = await scanSkill(url);
    return c.json(report);
  } catch (e) {
    return c.json({ error: String(e) }, 502);
  }
});

app.post("/api/skills/install", async (c) => {
  const body = await c.req.json<{ harness?: string; url?: string }>().catch(() => null);
  if (!body?.url || !isHarness(body.harness)) {
    return c.json({ error: "harness and url are required" }, 400);
  }
  const url = normalizeSkillUrl(body.url);
  const urlErr = await validateSkillUrl(url);
  if (urlErr) return c.json({ error: urlErr }, 400);
  try {
    const result = await installSkill(body.harness, url);
    return c.json({ ok: true, names: result.names });
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

app.get("/api/skills/:harness", async (c) => {
  const harness = c.req.param("harness");
  if (!isHarness(harness)) return c.json({ error: "unknown harness" }, 400);
  const skills = await listInstalledSkills(harness);
  return c.json({ skills });
});

app.delete("/api/skills/:harness/:name", async (c) => {
  const harness = c.req.param("harness");
  const name = c.req.param("name");
  if (!isHarness(harness)) return c.json({ error: "unknown harness" }, 400);
  try {
    await removeSkill(harness, name);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: String(e) }, 400);
  }
});

// ── Static frontend (built React app) ───────────────────────────────────────

// Fingerprinted assets (index-<hash>.js/css) are safe to cache forever — a new
// build always gets a new hash. index.html references those hashes, so it must
// never be served stale, or the browser can end up pairing a fresh index.html
// with assets from a previous build (or vice versa) after a redeploy.
app.use("/*", async (c, next) => {
  const path = c.req.path === "/" ? "/index.html" : c.req.path;
  const isIndex = path === "/index.html";
  const file = Bun.file(`./web-dist${path}`);
  if (await file.exists()) {
    return new Response(file, {
      headers: {
        "cache-control": isIndex ? "no-cache" : "public, max-age=31536000, immutable",
      },
    });
  }
  // SPA fallback for client-side routes.
  const index = Bun.file("./web-dist/index.html");
  if (await index.exists()) {
    return new Response(index, { headers: { "cache-control": "no-cache" } });
  }
  return next();
});

const port = Number(process.env.PORT ?? 8082);
console.log(`[dashboard] listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
  websocket,
};
