import { useEffect, useRef } from "react";

// The dashboard's signature element: a live waveform strip that spikes on
// every intercepted request. It's the one thing this page is memorable for —
// a literal visualization of traffic passing through the leash.
export function PulseWave({ tick, blocked }: { tick: number; blocked: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valuesRef = useRef<number[]>(Array(140).fill(0.04));
  const lastTickRef = useRef(tick);
  const spikeQueuedRef = useRef<"allow" | "block" | null>(null);

  useEffect(() => {
    if (tick !== lastTickRef.current) {
      lastTickRef.current = tick;
      spikeQueuedRef.current = blocked ? "block" : "allow";
    }
  }, [tick, blocked]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf: number;
    let decay = 0;
    let lastFlashWasBlocked = false;
    let lastSampleAt = 0;
    const SAMPLE_INTERVAL_MS = 55;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (now: number) => {
      if (now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
        lastSampleAt = now;
        const queued = spikeQueuedRef.current;
        if (queued) {
          spikeQueuedRef.current = null;
          valuesRef.current.push(0.55 + Math.random() * 0.45);
          decay = 1;
          lastFlashWasBlocked = queued === "block";
        } else {
          // Idle heartbeat — a faint, steady breathing line so the strip
          // never reads as frozen/broken between real traffic spikes.
          valuesRef.current.push(0.05 + Math.sin(now / 900) * 0.025);
          decay = Math.max(0, decay - 0.04);
        }
        if (valuesRef.current.length > 140) valuesRef.current.shift();
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const vals = valuesRef.current;
      const step = w / (vals.length - 1);
      const mid = h / 2;

      const lineColor = decay > 0.05 && lastFlashWasBlocked ? "#ff4d6a" : "#00d9a3";

      ctx.beginPath();
      ctx.moveTo(0, mid);
      for (let i = 0; i < vals.length; i++) {
        const x = i * step;
        const amp = vals[i] * (h * 0.42);
        const y = mid - amp * Math.sin(i * 0.6);
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.4 * dpr;
      ctx.globalAlpha = 0.85;
      ctx.stroke();

      // soft glow under the line
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 5 * dpr;
      ctx.stroke();
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full block" aria-hidden="true" />;
}
