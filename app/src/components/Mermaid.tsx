import { useEffect, useRef, useState } from "react";

// Drawn diagrams are kept by their code and theme, in memory and on this device, so a note
// shows its diagram at once the next time it opens instead of waiting for Mermaid again.
const CACHE = "atlas-mermaid:";
const KEEP = 40;
const drawn = new Map<string, string>();

function cacheKey(code: string, theme: string) {
  let h = 5381;
  for (const c of code + theme) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

function recall(key: string): string | undefined {
  if (drawn.has(key)) return drawn.get(key);
  try {
    const svg = localStorage.getItem(CACHE + key) ?? undefined;
    if (svg) drawn.set(key, svg);
    return svg;
  } catch {
    return undefined;
  }
}

function keep(key: string, svg: string) {
  drawn.set(key, svg);
  try {
    const order = (JSON.parse(localStorage.getItem(CACHE + "order") ?? "[]") as string[]).filter((k) => k !== key);
    order.push(key);
    for (const old of order.splice(0, Math.max(0, order.length - KEEP))) localStorage.removeItem(CACHE + old);
    localStorage.setItem(CACHE + key, svg);
    localStorage.setItem(CACHE + "order", JSON.stringify(order));
  } catch {
    /* storage full or unavailable: the in-memory copy still helps this visit */
  }
}

/** Renders a Mermaid flowchart in the current theme; re-renders when the theme changes. */
export default function Mermaid({ code }: { code: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const bump = () => setThemeTick((t) => t + 1);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("atlas-theme", bump);
    mq.addEventListener("change", bump);
    return () => {
      window.removeEventListener("atlas-theme", bump);
      mq.removeEventListener("change", bump);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const themeVariables = {
      background: v("--raised"),
      primaryColor: v("--raised"),
      primaryBorderColor: v("--muted"),
      primaryTextColor: v("--ink"),
      secondaryColor: v("--surface"),
      tertiaryColor: v("--surface"),
      lineColor: v("--muted"),
      textColor: v("--ink"),
      titleColor: v("--ink"),
      edgeLabelBackground: v("--raised"),
      fontSize: "13px",
    };
    const key = cacheKey(code, JSON.stringify(themeVariables));
    const hit = recall(key);
    if (hit && box.current) {
      box.current.innerHTML = hit;
      setError(null);
      return;
    }
    (async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        // Mermaid 12 lays flowcharts out with ELK by default, a 1.4 MB engine; the classic
        // layout draws these small diagrams just as well and loads far faster on a phone.
        layout: "dagre",
        fontFamily: v("--f-text"),
        flowchart: { htmlLabels: true, curve: "basis", padding: 12, wrappingWidth: 300 },
        themeVariables,
      });
      try {
        // The id comes from the cache key, so a kept drawing never clashes with another diagram.
        const { svg } = await mermaid.render(`m${key}`, code);
        if (!cancelled && box.current) {
          box.current.innerHTML = svg;
          setError(null);
        }
        keep(key, svg);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, themeTick]);

  return (
    <figure className="visual">
      <div className="scroll">
        <div className="mermaid-box" ref={box} role="img" aria-label="Flowchart" />
      </div>
      {error && <figcaption>Diagram failed to render: {error}</figcaption>}
    </figure>
  );
}
