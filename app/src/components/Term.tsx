import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getPage, KIND_LABEL, linksTo } from "../content/store";
import { openPeek } from "./peek";

const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches && window.innerWidth >= 600;

/**
 * A link to a concept card or another note, shown as a highlighted term. Click opens it in
 * the side peek. On desktop, hovering a card term previews its summary in place.
 */
export function TermChip({ kind, id, label }: { kind: "card" | "note"; id: string; label: string }) {
  const [hover, setHover] = useState(false);
  const btn = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const page = getPage(kind === "card" ? "cards" : "notes", id);

  useLayoutEffect(() => {
    if (!hover || !btn.current || !pop.current) return;
    const r = btn.current.getBoundingClientRect();
    const p = pop.current;
    const left = Math.min(
      Math.max(16, r.left + window.scrollX),
      window.scrollX + window.innerWidth - p.offsetWidth - 16,
    );
    let top = r.bottom + window.scrollY + 8;
    if (r.bottom + p.offsetHeight + 16 > window.innerHeight && r.top > p.offsetHeight + 16)
      top = r.top + window.scrollY - p.offsetHeight - 8;
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
  }, [hover]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const leave = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHover(false), 200);
  };
  const cited = kind === "card" ? linksTo("card", id).filter((l) => l.collection === "notes") : [];

  return (
    <>
      <span
        ref={btn}
        role="link"
        tabIndex={0}
        className={`term${page ? "" : " missing"}${kind === "note" ? " note-link" : ""}`}
        data-term={`${kind}:${id}`}
        title={page ? undefined : "This page doesn't exist yet"}
        onMouseEnter={() => {
          if (kind !== "card" || !page || !canHover()) return;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setHover(true), 250);
        }}
        onMouseLeave={leave}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          window.clearTimeout(timer.current);
          setHover(false);
          openPeek(kind, id);
        }}
        onKeyDown={(e) => e.key === "Enter" && openPeek(kind, id)}
      >
        {label || page?.title || id}
      </span>
      {hover &&
        page &&
        createPortal(
          <div
            ref={pop}
            className="pop"
            role="tooltip"
            onMouseEnter={() => window.clearTimeout(timer.current)}
            onMouseLeave={leave}
          >
            <div className="kind">{KIND_LABEL[String(page.kind)] ?? "Concept card"}</div>
            <h4>{page.title}</h4>
            {page.summary ? <p>{String(page.summary)}</p> : null}
            {cited.length > 0 && (
              <div className="cited">
                Cited in: {cited.map((c) => getPage("notes", c.id)?.title ?? c.id).join(", ")}
              </div>
            )}
            <button type="button" className="more" onClick={() => (setHover(false), openPeek(kind, id))}>
              Open card →
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
