import { useEffect, useRef, useState } from "react";
import type { StreamMessage } from "./types";

export type ConnState = "connecting" | "connected" | "disconnected";

// Connects to /api/stream, reconnecting with exponential backoff (capped at
// 10s). Routes messages to the caller via onMessage; exposes connection state
// for a status dot in the UI.
export function useStream(onMessage: (msg: StreamMessage) => void) {
  const [state, setState] = useState<ConnState>("connecting");
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let stopped = false;
    let ws: WebSocket | null = null;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      setState("connecting");
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}/api/stream`);

      ws.onopen = () => {
        attempt = 0;
        setState("connected");
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as StreamMessage;
          onMessageRef.current(msg);
        } catch {
          // ignore malformed frame
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        setState("disconnected");
        const delay = Math.min(10000, 500 * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, []);

  return state;
}
