// Pieces shared by the Essay, Ethics, Medical Science, Mains Notes and inbox screens (M12): the
// table + drawer pattern, a clock that survives a reload, and small labels.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { changeWork } from "../content/mains-extra";
import { getPage } from "../content/store";
import type { EssayTopic } from "../lib/mains-extra";

/**
 * The open drawer lives in the URL (`?<param>=<id>`), so back closes it. Opening from the table
 * adds a history entry; switching rows replaces it; closing goes back when we opened it.
 */
export function useSelection(param: string): [string | null, (id: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const current = params.get(param);
  const select = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params);
      const opened = !!(location.state as { mxOpened?: boolean } | null)?.mxOpened;
      if (id === null) {
        if (opened) navigate(-1);
        else {
          next.delete(param);
          setParams(next, { replace: true });
        }
        return;
      }
      next.set(param, id);
      if (current) setParams(next, { replace: true, state: location.state });
      else setParams(next, { state: { mxOpened: true } });
    },
    [params, setParams, location.state, navigate, param, current],
  );
  return [current, select];
}

const NARROW = "(max-width: 1279px)";

/** Whether the drawer sits beside the table (wide) or over it (narrower screens). */
export function useWide() {
  const [wide, setWide] = useState(() => !window.matchMedia(NARROW).matches);
  useEffect(() => {
    const m = window.matchMedia(NARROW);
    const on = () => setWide(!m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

/**
 * The drawer: beside the table on wide screens, a full-height sheet over it on iPads, and a page
 * of its own on phones. Escape closes it.
 */
export function Drawer({
  label,
  kicker,
  title,
  sub,
  onClose,
  children,
  tone,
}: {
  label: string;
  kicker: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  tone?: string;
}) {
  const wide = useWide();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (wide) return;
    document.documentElement.classList.add("mx-lock");
    return () => document.documentElement.classList.remove("mx-lock");
  }, [wide]);
  return (
    <>
      {!wide && <div className="mx-scrim" onClick={onClose} />}
      <aside className={`mx-drawer${tone ? ` tone-${tone}` : ""}`} aria-label={label}>
        <div className="mx-drawer-head">
          <div className="mx-drawer-title">
            <span className="mx-kicker">{kicker}</span>
            <h2>{title}</h2>
            {sub && <span className="mx-drawer-sub">{sub}</span>}
          </div>
          <button type="button" className="mx-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}

export function Stat({ n, children, tone }: { n: ReactNode; children: ReactNode; tone?: string }) {
  return (
    <span className="mx-stat">
      <b className={tone ? `t-${tone}` : undefined}>{n}</b> {children}
    </span>
  );
}

/** A loading or error line while the data arrives. */
export function Waiting({ status, error, what }: { status: string; error?: string; what: string }) {
  return (
    <article className="dash wide mx-page">
      <p className="loading">{status === "error" ? `Couldn't load ${what}: ${error}` : `Loading ${what}…`}</p>
    </article>
  );
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Mains Atlas`;
  }, [title]);
}

// ---------- the clock ----------

interface ClockState {
  /** When the current run started (ms since epoch), while running. */
  since: number | null;
  /** Time already run before `since`. */
  banked: number;
}

/**
 * A count-down clock that keeps running across a reload (stored on this device). `elapsed` grows
 * past `limit` into overtime. A clock left far beyond its time (three times the limit) is
 * forgotten, so an abandoned sitting doesn't greet you days later.
 */
export function useClock(key: string, limit: number) {
  const storageKey = `atlas-mx-clock-${key}`;
  const read = (): ClockState => {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey) ?? "null") as ClockState | null;
      const stale = v && v.banked + (v.since !== null ? Date.now() - v.since : 0) > 3 * limit;
      if (v && typeof v.banked === "number" && !stale) return v;
    } catch {
      /* storage unavailable */
    }
    return { since: null, banked: 0 };
  };
  const [st, setSt] = useState<ClockState>(read);
  const [, tick] = useState(0);
  // A different topic or case has its own clock.
  useEffect(() => setSt(read()), [storageKey]);
  useEffect(() => {
    if (st.since === null) return;
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, [st.since]);
  const save = (next: ClockState) => {
    setSt(next);
    try {
      if (next.since === null && next.banked === 0) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* storage unavailable: the clock lasts this visit */
    }
  };
  const elapsed = st.banked + (st.since !== null ? Date.now() - st.since : 0);
  return {
    elapsed,
    left: limit - elapsed,
    running: st.since !== null,
    started: st.since !== null || st.banked > 0,
    start: () => st.since === null && save({ since: Date.now(), banked: st.banked }),
    pause: () => st.since !== null && save({ since: null, banked: elapsed }),
    reset: () => save({ since: null, banked: 0 }),
  };
}

/** 20:00, 1:29:59, or +0:42 in overtime. */
export function fmtClock(ms: number) {
  const over = ms < 0;
  // Time left rounds up (20:00 at the start, 0:00 only at the end); overtime rounds down.
  const s = over ? Math.floor(-ms / 1000) : Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return `${over ? "+" : ""}${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${sec}`;
}

/** 3:05 for a duration. */
export const fmtDuration = (ms: number) => fmtClock(Math.round(ms / 1000) * 1000);

export const dayLabel = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";

/** A ring that empties as the time runs down. */
export function Ring({
  left,
  limit,
  label,
  size = 128,
}: {
  left: number;
  limit: number;
  label: string;
  size?: number;
}) {
  const deg = Math.max(0, Math.min(360, (left / limit) * 360));
  const tone = left < 0 ? "over" : left <= 120_000 ? "low" : "ok";
  return (
    <span
      className={`mx-ring ${tone}`}
      style={{ width: size, height: size, background: `conic-gradient(var(--ring) ${deg}deg, var(--bd-raised) 0)` }}
      role="timer"
      aria-label={`${fmtClock(left)} left`}
    >
      <span>
        <b>{fmtClock(left)}</b>
        <small>{label}</small>
      </span>
    </span>
  );
}

// ---------- Essay pieces used by the drawer and the sprint ----------

/** "Try it yourself first": your own keywords and angles, before Claude's breakdown is shown. */
export function TryFirst({ topic, intro }: { topic: EssayTopic; intro: string }) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="mx-gate">
      <b>Try decoding it yourself first.</b>
      <span className="mx-muted">{intro}</span>
      <label className="mx-label" htmlFor={`try-${topic.id}`}>
        Your keywords and angles
      </label>
      <textarea
        id={`try-${topic.id}`}
        className="mx-input"
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Keywords: … Angles: history, economy, …"
      />
      {err && <span className="mx-error">{err}</span>}
      <button
        type="button"
        className="mx-ghost tone-essay"
        disabled={!draft.trim()}
        onClick={() => {
          try {
            changeWork("essay", topic.id, { op: "try", text: draft });
          } catch (e) {
            setErr(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        Show Claude&apos;s breakdown
      </button>
    </div>
  );
}

/** A note named as evidence: a link when it is written, plain text when it isn't yet. */
export function NoteLink({ id, why }: { id: string; why: string }) {
  const page = getPage("notes", id);
  const inner = (
    <>
      <b className={`mx-id${page ? " on" : ""}`}>{id}</b>
      <span>{why}</span>
    </>
  );
  return page ? (
    <Link className="mx-note-link" to={`/notes/${id}`}>
      {inner}
    </Link>
  ) : (
    <span className="mx-note-link off" title="Not written yet">
      {inner}
    </span>
  );
}

/** "1 subject", "2 subjects". */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** A short id for a new record. */
export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
