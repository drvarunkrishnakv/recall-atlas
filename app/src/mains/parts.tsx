// Pieces the Mains answer screens share: the question card's facts, page photos, the QR code
// for the phone, the page editor (add, turn, reorder, remove) and the score buttons.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import qrcode from "qrcode-generator";
import { Link } from "../components/nav";
import { Icon } from "../components/Icon";
import { usePage } from "../content/store";
import { locateNote } from "../content/syllabus";
import { changeAnswer, usePhotoUrl } from "../content/mains";
import { MAX_PAGES, PAPER_SHORT, type AnswerPage, type MainsAnswer, type QuestionRef } from "../lib/mains";
import { canTurn, sendPhoto, turnPage } from "./photos";

/** Phones get the stepper; wider screens (iPad and up) the desk. */
export function useWide(min = 900) {
  const query = `(min-width: ${min}px)`;
  const [wide, setWide] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return wide;
}

/** Ticks every `ms` while `on`, returning the time. */
export function useNow(on: boolean, ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [on, ms]);
  return now;
}

export const fmtDate = (iso: string, year = false) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });

/** Green from 7, gold from 6, coral below. */
export const tone = (score: number) => (score >= 7 ? "hi" : score >= 6 ? "mid" : "lo");

/** "GS2 · Parliament · Mains 2020 PYQ". */
export const questionLine = (q: Pick<QuestionRef, "paper" | "topic" | "year">, pyq = true) =>
  [PAPER_SHORT[q.paper], q.topic, q.year ? `Mains ${q.year}${pyq ? " PYQ" : ""}` : "Claude's question"].join(" · ");

/** A note's title: the written page's, else the planned note's, else its id. */
export function useNoteTitle(id: string | undefined) {
  const page = usePage("notes", id);
  if (!id) return "";
  return page?.title ?? locateNote(id)?.topic.notes.find((n) => n.id === id)?.title ?? id;
}

export function NoteLink({ id, short = false }: { id: string; short?: boolean }) {
  const title = useNoteTitle(id);
  return (
    <Link className="mw-note-link" to={`/notes/${id}`}>
      {short ? id : `${id} · ${title}`}
    </Link>
  );
}

/** The question card's three boxes: what it asks for, length and time, and your note. */
export function QuestionFacts({
  asksFor,
  words,
  minutes,
  note,
}: {
  asksFor: string[];
  words: number;
  minutes: number;
  note?: string;
}) {
  return (
    <div className="mw-facts">
      <div className="mw-fact asks">
        <span className="mw-label mode">It asks for</span>
        {asksFor.length ? (
          <ul>
            {asksFor.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : (
          <span>Read the directive words: what must each part of your answer do?</span>
        )}
      </div>
      <div className="mw-fact">
        <span className="mw-label">Length · time</span>
        <b>
          {words} words · {minutes} min
        </b>{" "}
        on paper
      </div>
      <div className="mw-fact">
        <span className="mw-label">Your note</span>
        {note ? <NoteLink id={note} /> : <span className="muted">No note for this yet</span>}
      </div>
    </div>
  );
}

/** A page photo, from the dev API or (cloud build) Firebase Storage. */
export function Photo({ answerId, page, alt }: { answerId: string; page: AnswerPage; alt: string }) {
  const url = usePhotoUrl(answerId, page);
  return url ? (
    <img className="mw-photo" src={url} alt={alt} />
  ) : (
    <span className="mw-photo empty" role="img" aria-label={alt} />
  );
}

/** A QR code drawn as SVG, made on the device (nothing is sent anywhere to make it). */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { size: n + 4, path: d };
  }, [text]);
  return (
    <svg className="mw-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#1c1b19" />
    </svg>
  );
}

/** Score buttons 0–10, for your own score before the marks. */
export function ScoreButtons({ value, onPick }: { value: number | null; onPick: (v: number) => void }) {
  return (
    <div className="mw-scores" role="group" aria-label="Your score out of 10">
      {Array.from({ length: 11 }, (_, v) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onPick(v)}>
          {v}
        </button>
      ))}
    </div>
  );
}

/** The stepper's progress bar on phones. */
export function Steps({ at, names }: { at: number; names: string[] }) {
  return (
    <div className="mw-steps" aria-label={`Step ${at + 1} of ${names.length}: ${names[at]}`}>
      <span className="bars" aria-hidden="true">
        {names.map((n, i) => (
          <span key={n} className={i < at ? "done" : i === at ? "now" : ""} />
        ))}
      </span>
      <span className="name">{names[at]}</span>
    </div>
  );
}

/**
 * The answer's pages: add up to three photos, turn one the right way up, move it, or remove it.
 * Photos are shrunk on the device and sent at once, so a phone and a computer see the same pages.
 */
export function PagesEditor({
  answer,
  big = false,
  children,
}: {
  answer: MainsAnswer;
  big?: boolean;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const [, bump] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const room = MAX_PAGES - answer.pages.length - busy;

  const add = async (files: File[]) => {
    setError("");
    const list = files.filter((f) => f.type.startsWith("image/") || !f.type).slice(0, Math.max(0, room));
    if (!list.length) return;
    setBusy((n) => n + list.length);
    let current = answer;
    const taken: string[] = [];
    for (const f of list) {
      try {
        const page = await sendPhoto(current, f, "page", taken);
        taken.push(page.file);
        current = { ...current, pages: [...current.pages, page] };
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy((n) => n - 1);
      }
    }
  };
  const order = async (files: string[]) => {
    setError("");
    try {
      await changeAnswer(answer.id, { op: "pages", files });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const files = answer.pages.map((p) => p.file);
  const move = (i: number, d: number) => {
    const next = [...files];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    void order(next);
  };

  return (
    <div
      className={`mw-pages${big ? " big" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void add([...e.dataTransfer.files]);
      }}
    >
      <div className="mw-page-grid">
        {answer.pages.map((p, i) => (
          <figure key={p.file} className="mw-thumb">
            <Photo answerId={answer.id} page={p} alt={`Page ${i + 1}`} />
            <span className="n" aria-hidden="true">
              {i + 1}
            </span>
            <button
              type="button"
              className="x"
              aria-label={`Remove page ${i + 1}`}
              onClick={() => void order(files.filter((f) => f !== p.file))}
            >
              ×
            </button>
            <figcaption>
              <button
                type="button"
                aria-label={`Move page ${i + 1} earlier`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                ←
              </button>
              {canTurn(answer.id, p.file) && (
                <button
                  type="button"
                  aria-label={`Turn page ${i + 1}`}
                  title="Turn a quarter turn"
                  onClick={() => {
                    setError("");
                    turnPage(answer, p).then(
                      () => bump((n) => n + 1),
                      (e) => setError(e instanceof Error ? e.message : String(e)),
                    );
                  }}
                >
                  <Icon name="turn" />
                </button>
              )}
              <button
                type="button"
                aria-label={`Move page ${i + 1} later`}
                disabled={i === answer.pages.length - 1}
                onClick={() => move(i, 1)}
              >
                →
              </button>
            </figcaption>
          </figure>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <div key={`busy-${i}`} className="mw-thumb busy" role="status">
            Sending…
          </div>
        ))}
        {room > 0 && (
          <label className="mw-add">
            <Icon name="camera" />
            Page {answer.pages.length + busy + 1}
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              multiple
              aria-label={`Add a photo of page ${answer.pages.length + busy + 1}`}
              onChange={(e) => {
                void add([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {children}
      {error && (
        <p className="mw-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
