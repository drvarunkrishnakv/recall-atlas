import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { CARDS, CITED_IN, NOTES } from "../content/store";

const KIND: Record<string, string> = { case: "Case", body: "Body", provision: "Provision", event: "Event" };
const isTouch = () => window.matchMedia("(hover: none), (pointer: coarse)").matches || window.innerWidth < 600;

/**
 * A concept-card term. Desktop: hover shows the card in place, click pins it.
 * Touch: tap opens the card as a bottom sheet. Escape or a click outside closes it.
 */
export function Term({ cardId, children }: { cardId: string; children: ReactNode }) {
  const card = CARDS.get(cardId);
  const [open, setOpen] = useState<null | "hover" | "pinned" | "sheet">(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(0);

  useLayoutEffect(() => {
    if (!open || open === "sheet" || !btn.current || !pop.current) return;
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (!card) return <>{children}</>;
  const cited = (CITED_IN.get(cardId) ?? []).map((id) => NOTES.get(id)).filter(Boolean);

  const body = (
    <div
      ref={pop}
      className={`pop${open === "sheet" ? " sheet" : ""}`}
      role="dialog"
      aria-label={card.title}
      onMouseEnter={() => window.clearTimeout(timer.current)}
      onMouseLeave={() => open === "hover" && setOpen(null)}
    >
      <div className="kind">{KIND[card.kind] ?? card.kind}</div>
      <h4>{card.title}</h4>
      <p>{card.summary}</p>
      {cited.length > 0 && (
        <div className="cited">
          Cited in:{" "}
          {cited.map((n, i) => (
            <span key={n!.id}>
              {i > 0 && ", "}
              <Link to={`/notes/${n!.id}`} onClick={() => setOpen(null)}>
                {n!.title}
              </Link>
            </span>
          ))}
        </div>
      )}
      <Link className="more" to={`/cards/${card.id}`} onClick={() => setOpen(null)}>
        Open full card →
      </Link>
    </div>
  );

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="term"
        aria-expanded={open ? "true" : "false"}
        aria-haspopup="dialog"
        onMouseEnter={() => {
          if (isTouch() || open) return;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setOpen("hover"), 150);
        }}
        onMouseLeave={() => {
          window.clearTimeout(timer.current);
          if (open === "hover")
            timer.current = window.setTimeout(() => setOpen((o) => (o === "hover" ? null : o)), 200);
        }}
        onClick={() => setOpen((o) => (o === "pinned" || o === "sheet" ? null : isTouch() ? "sheet" : "pinned"))}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <>
            {open === "sheet" && <div className="sheet-scrim" onClick={() => setOpen(null)} />}
            {body}
          </>,
          document.body,
        )}
    </>
  );
}
