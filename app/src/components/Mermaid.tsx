import { useEffect, useId, useRef, useState } from "react";

/** Renders a Mermaid flowchart in the current theme; re-renders when the theme changes. */
export default function Mermaid({ code }: { code: string }) {
  const box = useRef<HTMLDivElement>(null);
  const id = "m" + useId().replace(/[^a-z0-9]/gi, "");
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
    (async () => {
      const { default: mermaid } = await import("mermaid");
      const css = getComputedStyle(document.documentElement);
      const v = (name: string) => css.getPropertyValue(name).trim();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        fontFamily: v("--f-text"),
        flowchart: { htmlLabels: true, curve: "basis", padding: 12, wrappingWidth: 300 },
        themeVariables: {
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
        },
      });
      try {
        const { svg } = await mermaid.render(`${id}-${themeTick}`, code);
        if (!cancelled && box.current) {
          box.current.innerHTML = svg;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id, themeTick]);

  return (
    <figure className="visual">
      <div className="scroll">
        <div className="mermaid-box" ref={box} role="img" aria-label="Flowchart" />
      </div>
      {error && <figcaption>Diagram failed to render: {error}</figcaption>}
    </figure>
  );
}
