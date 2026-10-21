// Tonight's lesson (the chosen design: Lesson 3 · Stack), in a warm, dim night look so reading it
// late doesn't fight sleep (Chang et al. 2015). One card per concept, stacked, with a progress
// line. "Got it" flings the card right and "Still shaky" flings it left, by drag, by the buttons
// or by the → / ← keys; the next card slides forward and Undo brings the last one back. Shaky
// concepts come back in the next lessons. At the end, a short summary points to the morning quiz.
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { Icon } from "../components/Icon";
import { changeLesson, useLesson, useLessons } from "../content/lessons";
import {
  latestRating,
  mistakeLabel,
  type Lesson,
  type LessonCard,
  type Rating,
  type YourMistake,
} from "../lib/lessons";
import "../prelims/prelims.css";
import "./lessons.css";

const LETTERS = ["A", "B", "C", "D", "E"];
const MOTION_MS = 350;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const shortDate = (day: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : "that day";

export default function LessonPage() {
  const [params] = useSearchParams();
  const lessons = useLessons();
  const day = params.get("day");
  const lesson = useLesson(day);
  useEffect(() => {
    document.title = "Tonight's lesson · Mains Atlas";
  }, []);

  if (lessons.status === "error") return <Empty title="Couldn't load the lessons" text={lessons.error ?? ""} />;
  if (lesson === undefined)
    return (
      <article className="lesson">
        <Head title="Tonight's lesson" />
        <p className="loading">Loading the lesson…</p>
      </article>
    );
  if (lesson === null)
    return day ? (
      <Empty title={`No lesson for ${shortDate(day)}`} text="Claude writes a lesson only on days with misses." />
    ) : (
      <Empty
        title="No lesson yet"
        text="Claude writes tonight's lesson from the day's misses on its evening run. Practise first: every miss becomes a lesson card."
      />
    );
  if (!lesson.cards.length)
    return <Empty title="Nothing to teach tonight" text="There were no misses to learn from that day." />;
  return (
    <Stack
      key={lesson.day}
      lesson={lesson}
      latest={lesson.day === lessons.latest}
      start={params.get("card")}
      saveError={lessons.saveError}
    />
  );
}

function Head({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="ls-head">
      <Link className="ls-close" to="/prelims" aria-label="Close lesson">
        <Icon name="close" />
      </Link>
      <h1>{title}</h1>
      {children}
      <span className="ls-night">
        <Icon name="moon" />
        <span>Night mode</span>
      </span>
    </header>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <article className="lesson">
      <Head title="Tonight's lesson" />
      <section className="ls-done ls-empty">
        <h2>{title}</h2>
        <p>{text}</p>
        <Link className="board-btn" to="/prelims">
          Back to Prelims
        </Link>
      </section>
    </article>
  );
}

type Entry = "" | "arrive" | "back-left" | "back-right";
interface Ghost {
  card: LessonCard;
  n: number;
  dir: "left" | "right";
  dx: number;
}

function Stack({
  lesson,
  latest,
  start,
  saveError,
}: {
  lesson: Lesson;
  latest: boolean;
  start: string | null;
  saveError?: string;
}) {
  const cards = lesson.cards;
  const total = cards.length;
  // Open on the card asked for, else the first one you haven't rated yet.
  const [idx, setIdx] = useState(() => {
    const asked = start ? cards.findIndex((c) => c.id === start) : -1;
    if (asked >= 0) return asked;
    const unrated = cards.findIndex((c) => !latestRating(lesson, c.id));
    return unrated < 0 ? total : unrated;
  });
  const [entry, setEntry] = useState<Entry>("");
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; on: boolean } | null>(null);
  const top = useRef<HTMLElement>(null);
  const done = idx >= total;
  const card = cards[idx];

  useEffect(() => {
    if (!ghost) return;
    const t = window.setTimeout(() => setGhost(null), MOTION_MS + 50);
    return () => window.clearTimeout(t);
  }, [ghost]);

  // After a fling or an undo, bring the top of the lesson back into view if you had scrolled down.
  function settle() {
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0)
      el.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
  }

  function rate(rating: Rating, from = 0) {
    if (!card) return;
    settle();
    changeLesson(lesson.day, { op: "rate", cardId: card.id, rating, at: new Date().toISOString() });
    if (!reducedMotion()) setGhost({ card, n: idx, dir: rating === "got" ? "right" : "left", dx: from });
    setEntry("arrive");
    setDx(0);
    setDragging(false);
    setIdx(idx + 1);
  }

  function undo() {
    if (idx === 0) return;
    settle();
    const prev = cards[idx - 1];
    const last = latestRating(lesson, prev.id);
    if (last) changeLesson(lesson.day, { op: "unrate", cardId: prev.id, at: last.at });
    setGhost(null);
    setEntry(!last ? "arrive" : last.rating === "got" ? "back-right" : "back-left");
    setDx(0);
    setIdx(idx - 1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]")
      )
        return;
      if (done) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        rate("got");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        rate("shaky");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // Drag: a mostly sideways move past about a quarter of the card flings it; less springs back.
  // The card allows vertical scrolling (touch-action: pan-y), so reading a long card still works.
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("a, button, .ls-table")) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const mx = e.clientX - d.x;
    const my = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) drag.current = null;
      if (Math.abs(mx) < 8 || Math.abs(mx) < Math.abs(my)) return;
      d.on = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      window.getSelection()?.removeAllRanges();
    }
    setDx(mx);
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return;
    const mx = e.clientX - d.x;
    const width = e.currentTarget.getBoundingClientRect().width;
    setDragging(false);
    if (Math.abs(mx) > Math.min(140, width * 0.28)) rate(mx > 0 ? "got" : "shaky", mx);
    else setDx(0);
  };
  const onPointerCancel = () => {
    drag.current = null;
    setDragging(false);
    setDx(0);
  };

  const ratingOf = (c: LessonCard) => latestRating(lesson, c.id)?.rating;
  const shaky = cards.filter((c) => ratingOf(c) === "shaky").length;
  const quiz = lesson.quiz.length;
  const lean = dx > 0 ? "got" : dx < 0 ? "shaky" : "";

  return (
    <article className="lesson" ref={top}>
      <Head title={latest ? "Tonight's lesson" : `Lesson · ${shortDate(lesson.day)}`}>
        <span className="ls-dots" role="img" aria-label={done ? "All concepts done" : `Concept ${idx + 1} of ${total}`}>
          {cards.map((c, i) => (
            <i key={c.id} className={ratingOf(c) ?? (i === idx ? "now" : "")} />
          ))}
        </span>
      </Head>

      {/* After the last card, its fling plays out before the summary shows. */}
      {!done || ghost ? (
        <div className="ls-body">
          <div className="ls-stack">
            {[2, 1].map((k) => idx + k < total && <div key={k} className={`ls-shell s${k}`} aria-hidden="true" />)}
            {card && (
              <article
                key={card.id}
                className={`ls-card ${entry}${dragging ? " dragging" : ""}`}
                aria-label={`Concept ${idx + 1} of ${total}: ${card.concept}`}
                style={dx ? { transform: `translateX(${dx}px) rotate(${dx / 24}deg)` } : undefined}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
              >
                {lean && (
                  <span className={`ls-lean ${lean}`} style={{ opacity: Math.min(1, Math.abs(dx) / 120) }} aria-hidden>
                    {lean === "got" ? "Got it" : "Still shaky"}
                  </span>
                )}
                <CardBody card={card} n={idx + 1} total={total} />
              </article>
            )}
            {ghost && (
              <article
                key={`ghost-${ghost.card.id}`}
                className={`ls-card ls-ghost fling-${ghost.dir}`}
                aria-hidden="true"
                style={{ "--from-x": `${ghost.dx}px`, "--from-r": `${ghost.dx / 24}deg` } as CSSProperties}
              >
                <CardBody card={ghost.card} n={ghost.n + 1} total={total} />
              </article>
            )}
          </div>

          {!done && (
            <>
              <div className="ls-actions">
                <button
                  type="button"
                  className="ls-fling shaky"
                  aria-keyshortcuts="ArrowLeft"
                  onClick={() => rate("shaky")}
                >
                  <Icon name="back" />
                  Still shaky
                </button>
                <button
                  type="button"
                  className="ls-fling got"
                  aria-keyshortcuts="ArrowRight"
                  onClick={() => rate("got")}
                >
                  Got it
                  <Icon name="forward" />
                </button>
              </div>
              <div className="ls-foot">
                <button type="button" className="ls-undo" disabled={idx === 0} onClick={undo}>
                  Undo last card
                </button>
                <span>
                  Shaky cards come back sooner
                  <span className="ls-keys">
                    {" "}
                    · <kbd>←</kbd> <kbd>→</kbd>
                  </span>
                </span>
              </div>
            </>
          )}
          {saveError && <p className="ls-error">{saveError}</p>}
        </div>
      ) : (
        <section className="ls-done" aria-label="Done for tonight">
          <Icon name="moon" />
          <h2>Done for tonight</h2>
          <p>
            {quiz === 0
              ? "Sleep on it."
              : latest
                ? `Sleep on it. Your quiz is ready tomorrow morning: ${quiz} question${quiz === 1 ? "" : "s"}, about ${Math.max(1, Math.round(quiz * 0.8))} minute${Math.round(quiz * 0.8) > 1 ? "s" : ""}.`
                : `Its quiz has ${quiz} question${quiz === 1 ? "" : "s"}.`}
          </p>
          <p className="ls-shaky-line">
            {shaky
              ? `${shaky} ${shaky === 1 ? "concept is" : "concepts are"} still shaky, so ${shaky === 1 ? "it comes" : "they come"} back sooner.`
              : "Nothing marked shaky. The quiz will check."}
          </p>
          <div className="ls-done-actions">
            <Link className="board-btn" to="/prelims">
              Close
            </Link>
            {quiz > 0 && (
              <Link className="board-btn quiet" to={`/prelims/quiz?day=${lesson.day}`}>
                Morning quiz
              </Link>
            )}
          </div>
          <div className="ls-done-more">
            <button
              type="button"
              onClick={() => {
                setEntry("arrive");
                setIdx(0);
              }}
            >
              Read it again
            </button>
            <button type="button" onClick={undo}>
              Undo last card
            </button>
          </div>
          {saveError && <p className="ls-error">{saveError}</p>}
        </section>
      )}
    </article>
  );
}

function CardBody({ card, n, total }: { card: LessonCard; n: number; total: number }) {
  return (
    <>
      <div className="ls-meta">
        <span className="ls-subject">
          <i aria-hidden="true" />
          {card.subject}
        </span>
        {card.returning && <span className="ls-tag back">Back again · shaky since {shortDate(card.returning)}</span>}
        {!card.checked && <span className="ls-tag unchecked">Not fact-checked</span>}
        <span className="ls-num">
          {n} / {total}
        </span>
      </div>
      <h2>{card.concept}</h2>
      {card.mistakes.map((m) => (
        <Mistake key={m.attemptId} m={m} />
      ))}
      {card.teach.map((p, i) => (
        <p key={i} className="ls-teach">
          {p}
        </p>
      ))}
      {card.table && (
        <div className="ls-table">
          <table>
            <thead>
              <tr>
                {card.table.head.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {card.table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) =>
                    j === 0 ? (
                      <th key={j} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={j}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="ls-remember">
        <span>Remember</span>
        <b>{card.remember}</b>
      </div>
      <p className="ls-sources">
        {card.sources.length > 1 ? "Sources: " : "Source: "}
        {card.sources.map((s, i) => (
          <span key={i}>
            {i > 0 && " · "}
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          </span>
        ))}
      </p>
    </>
  );
}

const tf = (v: boolean) => (v ? "true" : "false");

function Mistake({ m }: { m: YourMistake }) {
  const chose = m.chosen ? `You chose ${LETTERS[m.chosen.n]} (${m.chosen.text})` : "You left it blank";
  const answer = `The answer is ${LETTERS[m.answer.n]} (${m.answer.text})`;
  return (
    <div className={`ls-mistake${m.correct ? " shaky" : ""}`}>
      <span className="ls-mistake-label">
        <span className="caps">Your mistake</span> · {mistakeLabel(m)}
      </span>
      {m.slipped.length ? (
        <>
          {m.slipped.map((s) => (
            <div key={s.n} className="ls-slip">
              <p>
                Statement {s.n}: “{s.text}”
              </p>
              <span className="ls-verdict">
                <span className="bad">
                  {s.from === "marked" ? `You marked it ${tf(s.said)}` : `Your answer took it as ${tf(s.said)}`}
                </span>{" "}
                · <span className="good">It is {tf(s.truth)}</span>
              </span>
            </div>
          ))}
          {!m.correct && (
            <span className="ls-option-line">
              {chose}. {answer}.
            </span>
          )}
        </>
      ) : (
        <div className="ls-slip">
          <p>{m.stem}</p>
          <span className="ls-verdict">
            <span className={m.correct ? "" : "bad"}>
              {chose}
              {m.sure === false ? ", unsure" : ""}
            </span>{" "}
            · <span className="good">{answer}</span>
          </span>
        </div>
      )}
    </div>
  );
}
