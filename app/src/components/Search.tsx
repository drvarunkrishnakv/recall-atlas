import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { allPages } from "../content/store";
import { searchPages } from "../lib/blocks";

/** ⌘K / Ctrl+K search over every note and card: titles, headings and text. */
export function Search({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => (open ? searchPages(allPages(), q, 30) : []), [q, open]);

  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      window.setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;
  const go = (n: number) => {
    const h = hits[n];
    if (!h) return;
    onClose();
    navigate(`/${h.collection}/${h.id}`, { state: { block: h.blockId } });
  };
  return createPortal(
    <>
      <div className="sheet-scrim search-scrim" onClick={onClose} />
      <div className="search" role="dialog" aria-label="Search">
        <input
          ref={input}
          value={q}
          placeholder="Search notes and cards…"
          aria-label="Search"
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") (e.preventDefault(), setI((n) => Math.min(n + 1, hits.length - 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setI((n) => Math.max(n - 1, 0)));
            if (e.key === "Enter") go(i);
          }}
        />
        <ul className="hits">
          {q && hits.length === 0 && <li className="none">No matches</li>}
          {hits.map((h, n) => (
            <li key={`${h.collection}:${h.id}:${h.blockId ?? ""}:${n}`}>
              <button type="button" className={n === i ? "on" : ""} onMouseEnter={() => setI(n)} onClick={() => go(n)}>
                <b>{h.title}</b>
                <small>{h.collection === "notes" ? `Note ${h.id}` : "Card"}</small>
                {h.snippet && <span>{h.snippet}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>,
    document.body,
  );
}
