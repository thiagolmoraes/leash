// Tails and reads the JSONL log files written by the proxy addons and Falco.
import { watch } from "node:fs";
import { open, stat } from "node:fs/promises";

export type LogKind = "flows" | "blocked" | "falco";

// Overridable for local dev (outside the container, where /logs doesn't exist).
const LOG_DIR = process.env.LEASH_LOG_DIR ?? "/logs";

const LOG_PATHS: Record<LogKind, string> = {
  flows: `${LOG_DIR}/flows.jsonl`,
  blocked: `${LOG_DIR}/blocked.jsonl`,
  falco: `${LOG_DIR}/falco.jsonl`,
};

// Reads the last `limit` JSON lines from a jsonl file. Malformed lines are skipped.
export async function readTail(kind: LogKind, limit = 200): Promise<unknown[]> {
  const path = LOG_PATHS[kind];
  try {
    const text = await Bun.file(path).text();
    const lines = text.split("\n").filter(Boolean);
    const tail = lines.slice(-limit);
    return tail
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((v) => v !== null);
  } catch {
    return [];
  }
}

// Streams new lines appended to a jsonl file, calling onEntry for each parsed line.
// Returns a cleanup function to stop watching.
export function tailFollow(
  kind: LogKind,
  onEntry: (entry: unknown) => void,
): () => void {
  const path = LOG_PATHS[kind];
  let stopped = false;
  let position = 0;
  let watcher: ReturnType<typeof watch> | null = null;

  const readNew = async () => {
    if (stopped) return;
    try {
      const st = await stat(path);
      if (st.size < position) {
        // File was truncated/rotated (e.g. `make reset`) — restart from the top.
        position = 0;
      }
      if (st.size === position) return;

      const fh = await open(path, "r");
      const length = st.size - position;
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, position);
      await fh.close();
      position = st.size;

      const text = buf.toString("utf-8");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          onEntry(JSON.parse(line));
        } catch {
          // skip malformed line (partial write mid-append)
        }
      }
    } catch {
      // file may not exist yet — wait for the watcher/next tick
    }
  };

  stat(path)
    .then((st) => {
      // Start following from the current end of file (don't replay history).
      position = st.size;
    })
    .catch(() => {
      position = 0;
    })
    .finally(() => {
      watcher = watch(path.substring(0, path.lastIndexOf("/")) || "/", (_event, filename) => {
        if (filename && path.endsWith(filename)) readNew();
      });
    });

  return () => {
    stopped = true;
    watcher?.close();
  };
}
