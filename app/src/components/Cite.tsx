import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const domain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * A source citation: a small numbered marker after the sentence (numbered by CSS counter,
 * in page order). Hover or tap shows the source with a link to open it.
 */
export function CiteChip({ label, url }: { label: string; url: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const timer = useRef(0);

  useLayoutEffect(() => {
    if (!open || !ref.current || !pop.current) return;
    const r = ref.current.getBoundingClientRect();
    const p = pop.current;
    const left = Math.min(
      Math.max(12, r.left + window.scrollX - 20),
      window.scrollX + window.innerWidth - p.offsetWidth - 12,
    );
    let top = r.bottom + window.scrollY + 6;
    if (r.bottom + p.offsetHeight + 12 > window.innerHeight && r.top > p.offsetHeight + 12)
      top = r.top + window.scrollY - p.offsetHeight - 6;
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !ref.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <>
      <span
        ref={ref}
        className="cite"
        role="button"
        tabIndex={0}
        aria-label={`Source: ${label}`}
        onMouseEnter={() => {
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setOpen(true), 200);
        }}
        onMouseLeave={() => window.clearTimeout(timer.current)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => e.key === "Enter" && setOpen((v) => !v)}
      />
      {open &&
        createPortal(
          <div
            ref={pop}
            className="cite-pop"
            role="dialog"
            aria-label={`Source: ${label}`}
            onMouseLeave={() => setOpen(false)}
          >
            <b>{label}</b>
            <span className="muted">{domain(url)}</span>
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open source ↗
            </a>
          </div>,
          document.body,
        )}
    </>
  );
}
