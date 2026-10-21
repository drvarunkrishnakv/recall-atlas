// Prelims Home (the chosen design: Board 1 · Centre stage). The big Puzzle button in the centre;
// Practise and Reviews on the left; tonight's lesson and the morning quiz on the right; then the
// board of subject tiles, each with its readiness, its change this week and its weak spot.
// Every number comes from the attempt log, the banks and the reading log.
import { useEffect, useMemo, useState } from "react";
import { Link } from "../components/nav";
import { usePractice } from "../content/practice";
import { daysUntil, longDate, PRELIMS_2027 } from "../lib/exam";
import { servable, type Attempt } from "../lib/practice";
import { today as todayOf } from "../lib/progress";
import { overallScore, readinessOver, weakSpots, counted } from "../lib/readiness";
import { subjectSlug } from "../lib/reading";
import { bankCounts } from "../lib/srs";
import { useEngineNotes, useReading } from "./data";
import { BOARD_SIZE, deltaClass, subjectsOf, weekDelta } from "./model";
import "../prelims/prelims.css";
import "./homes.css";

const SIZES = [20, 50, 100];
const WEEK = 7 * 864e5;

export function PrelimsHome() {
  const practice = usePractice();
  const reading = useReading();
  const engine = useEngineNotes();
  const [size, setSize] = useState(20);
  const [mode, setMode] = useState<"practice" | "exam">("practice");
  useEffect(() => {
    document.title = "Prelims · Mains Atlas";
  }, []);
  const days = daysUntil(PRELIMS_2027);
  const today = todayOf();

  const model = useMemo(() => {
    const now = new Date();
    const banks = practice.banks;
    const attempts = Object.values(practice.days).flat();
    const subjects = subjectsOf(banks);
    const [before, after] = readinessOver(banks, attempts, [new Date(now.getTime() - WEEK), now], (_, b) => [
      subjectSlug(b.subject),
    ]);
    const scoreNow = new Map(subjects.map((s) => [s.slug, after.get(s.slug)?.score ?? 0]));
    const scoreThen = new Map(subjects.map((s) => [s.slug, before.get(s.slug)?.score ?? 0]));
    const shares = new Map(subjects.map((s) => [s.slug, s.share]));
    const tiles = subjects.map((s) => {
      const items = s.banks.flatMap((b) => b.items);
      const ids = new Set(items.map((i) => i.id));
      const c = bankCounts(items.filter(counted), practice.states, now);
      return {
        ...s,
        score: scoreNow.get(s.slug)!,
        delta: scoreNow.get(s.slug)! - scoreThen.get(s.slug)!,
        due: c.due,
        weak: weakSpots(
          items,
          attempts.filter((a) => ids.has(a.itemId)),
        )[0]?.microtheme,
      };
    });
    const mcqs = banks.flatMap((b) => b.items).filter((i) => i.kind === "mcq" && servable(i));
    const cards = banks.flatMap((b) => b.items).filter((i) => i.kind === "flashcard" && servable(i));
    return {
      tiles,
      overall: overallScore(scoreNow, shares),
      overallDelta: overallScore(scoreNow, shares) - overallScore(scoreThen, shares),
      mcqs: mcqs.length,
      mcq: bankCounts(mcqs, practice.states, now),
      cardDue: bankCounts(cards, practice.states, now).due,
      cardCount: cards.length,
    };
  }, [practice.banks, practice.days, practice.states]);

  // Today's reading: the topics you logged today, latest subject first.
  const topicName = new Map(practice.banks.map((b) => [b.id, b] as const));
  const readToday = Object.values(reading.subjects)
    .flatMap((log) => Object.entries(log.topics))
    .filter(([bank, ds]) => ds.includes(today) && topicName.has(bank))
    .map(([bank]) => topicName.get(bank)!);
  const focus = readToday[0];
  const focusItems = focus ? focus.items.filter((i) => i.kind === "mcq" && servable(i)) : [];
  const focusCounts = focus ? bankCounts(focusItems, practice.states) : null;
  const plan = focusCounts ?? model.mcq;
  const session = `/prelims/session?n=${size}&mode=${mode}${focus ? `&banks=${focus.id}` : ""}`;

  const todays: Attempt[] = practice.days[today] ?? [];
  const ratingToday = todays.reduce((s, a) => s + (a.delta ?? 0), 0);
  const missesToday = todays.filter((a) => !a.correct && a.kind !== "puzzle").length;
  const quiz = todays.filter((a) => a.mode === "quiz");
  const lesson = engine.lessons?.find((l) => l.day === today);
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString("en-CA");
  const quizReady = engine.lessons?.find((l) => l.day === yesterday && l.quiz);
  const reviewsDue = model.mcq.due + model.cardDue;
  const board = model.tiles.slice(0, BOARD_SIZE);
  const more = model.tiles.slice(BOARD_SIZE);

  return (
    <article className="ph prelims-home-v2">
      <header className="ph-head">
        <h1>Prelims</h1>
        <p className="ph-count">
          <b>{days > 0 ? `${days} days` : days === 0 ? "Today" : "Done"}</b> to Prelims · {longDate(PRELIMS_2027)}
        </p>
        {readToday.length > 0 && (
          <p className="muted ph-logged">You logged {readToday.map((b) => b.topic).join(", ")} today</p>
        )}
      </header>

      {practice.status === "loading" || practice.status === "idle" ? (
        <p className="loading">Loading your practice…</p>
      ) : practice.status === "error" ? (
        <p className="loading">Couldn't load practice: {practice.error}</p>
      ) : !practice.banks.length ? (
        <section className="board-card">
          <h2>No questions loaded yet</h2>
          <p>
            Practice uses PYQs whose answers were checked against UPSC's official keys. Claude loads them with{" "}
            <code>atlas practice-import</code>.
          </p>
        </section>
      ) : (
        <>
          <div className="ph-stage">
            <div className="ph-side">
              <section className="ph-card" aria-label="Practise">
                <span className="ph-eyebrow">Practise</span>
                <b className="ph-title">{focus ? "Today's reading" : "Due first, then new"}</b>
                <span className="ph-sub">
                  {focus ? `${focus.topic} · ${focusItems.length} questions` : "Across every topic"}
                </span>
                <Link className="board-btn big" to={session}>
                  Practise now
                  <span>
                    {Math.min(size, plan.due)} due · {Math.max(0, Math.min(size - plan.due, plan.fresh))} new
                  </span>
                </Link>
                <div className="ph-opts">
                  <span className="seg" role="group" aria-label="Questions">
                    {SIZES.map((n) => (
                      <button key={n} type="button" aria-pressed={size === n} onClick={() => setSize(n)}>
                        {n}
                      </button>
                    ))}
                  </span>
                  <span className="seg" role="group" aria-label="Mode">
                    <button type="button" aria-pressed={mode === "practice"} onClick={() => setMode("practice")}>
                      Answer after each
                    </button>
                    <button type="button" aria-pressed={mode === "exam"} onClick={() => setMode("exam")}>
                      Exam mode
                    </button>
                  </span>
                </div>
                <p className="muted small">
                  {model.mcqs} questions ready · {model.mcq.due} due now · {model.mcq.fresh} not seen yet
                </p>
              </section>

              <section className="ph-card ph-row" aria-label="Reviews">
                <div className="ph-row-text">
                  <b className="ph-title">{reviewsDue ? `${reviewsDue} due` : "Nothing due"}</b>
                  <span className="ph-sub">
                    {model.mcq.due} MCQs · {model.cardDue} flashcards
                  </span>
                </div>
                <div className="ph-row-actions">
                  {model.mcq.due > 0 && (
                    <Link className="board-btn quiet small" to={`/prelims/session?n=${model.mcq.due}&mode=practice`}>
                      Review
                    </Link>
                  )}
                  {model.cardDue > 0 && (
                    <Link className="board-btn quiet small" to="/prelims/cards">
                      Cards
                    </Link>
                  )}
                </div>
              </section>
            </div>

            <div className="ph-centre">
              <Link
                className="ph-puzzle"
                to="/prelims/puzzles"
                aria-label={`Puzzles: play. Your rating is ${practice.rating}${
                  ratingToday ? `, ${ratingToday > 0 ? "+" : "−"}${Math.abs(ratingToday)} today` : ""
                }`}
              >
                <PuzzleIcon />
                <span className="ph-pz-title">Puzzles</span>
                <span className="ph-pz-rating">
                  Rating {practice.rating}
                  {ratingToday ? ` · ${ratingToday > 0 ? "+" : "−"}${Math.abs(ratingToday)} today` : ""}
                </span>
                <span className="ph-pz-play">Play</span>
              </Link>
              <div className="ph-centre-links">
                <Link className="chip-btn" to="/prelims/rush">
                  Rush · 3 minutes
                </Link>
                <Link className="chip-btn" to="/prelims/cards">
                  Flashcards
                </Link>
              </div>
            </div>

            <div className="ph-side">
              <section className="ph-card" aria-label="Tonight's lesson">
                <span className="ph-eyebrow gold">
                  <MoonIcon />
                  Tonight's lesson
                </span>
                {lesson ? (
                  <>
                    <b className="ph-title">Ready</b>
                    <span className="ph-sub">
                      {lesson.concepts ? `${lesson.concepts} concepts from today's misses` : "From today's misses"}
                    </span>
                    <Link className="board-btn" to="/prelims/lesson">
                      Open the lesson
                    </Link>
                  </>
                ) : (
                  <>
                    <b className="ph-title">No lesson yet</b>
                    <span className="ph-sub">
                      {missesToday ? `${missesToday} misses today so far. ` : ""}Each night's lesson is written from
                      that day's misses.
                    </span>
                  </>
                )}
              </section>
              <section className="ph-card ph-row" aria-label="Morning quiz">
                {quiz.length ? (
                  <Link className="ph-quiz" to="/prelims/quiz">
                    <span className="ph-tick" aria-hidden="true">
                      ✓
                    </span>
                    <span className="ph-row-text">
                      <b className="ph-title">
                        {quiz.filter((a) => a.correct).length} of {quiz.length}
                      </b>
                      <span className="ph-sub">This morning's quiz</span>
                    </span>
                  </Link>
                ) : quizReady ? (
                  <Link className="ph-quiz" to="/prelims/quiz">
                    <span className="ph-row-text">
                      <b className="ph-title">Morning quiz</b>
                      <span className="ph-sub">{quizReady.quiz} questions from last night's lesson</span>
                    </span>
                  </Link>
                ) : (
                  <span className="ph-row-text">
                    <b className="ph-title">No quiz yet</b>
                    <span className="ph-sub">The morning quiz follows each lesson.</span>
                  </span>
                )}
              </section>
            </div>
          </div>

          <section className="ph-subjects" aria-label="Subjects">
            <div className="ph-subjects-head">
              <h2>Subjects</h2>
              <span className="muted">Prelims readiness</span>
              <b className="ph-overall">{model.overall}</b>
              <span className="muted">
                / 1000 · <em className={deltaClass(model.overallDelta)}>{weekDelta(model.overallDelta)}</em>
              </span>
              <Link className="chip-btn" to="/prelims/analytics">
                Analytics
              </Link>
            </div>
            <div className="ph-board">
              {board.map((t) => (
                <Link
                  key={t.slug}
                  className="ph-tile"
                  to={`/prelims/subject/${t.slug}`}
                  style={{ "--subj": t.color } as React.CSSProperties}
                  aria-label={`${t.name}: readiness ${t.score} of 1000, ${weekDelta(t.delta)}, ${
                    t.due ? `${t.due} due` : "nothing due"
                  }, weak spot ${t.weak ?? "none yet"}`}
                >
                  <span className="ph-tile-top">
                    <span className="ph-code" aria-hidden="true">
                      {t.code}
                    </span>
                    <span className="ph-name">{t.name}</span>
                    <span className="ph-due">{t.due ? `${t.due} due` : "nothing due"}</span>
                  </span>
                  <span className="ph-score">
                    <b>{t.score}</b>
                    <span>/ 1000</span>
                    <em className={deltaClass(t.delta)}>{weekDelta(t.delta)}</em>
                  </span>
                  <span className="ph-bar" aria-hidden="true">
                    <i style={{ width: `${t.score / 10}%` }} />
                  </span>
                  <span className="ph-weak">
                    Weak spot: <b>{t.weak ?? "none yet"}</b>
                  </span>
                </Link>
              ))}
              {/* Empty squares complete the last row of the board. */}
              {Array.from({ length: (3 - (board.length % 3)) % 3 }, (_, i) => (
                <span key={`empty-${i}`} className="ph-tile empty" aria-hidden="true" />
              ))}
            </div>
            {more.length > 0 && (
              <div className="ph-more">
                <h3>More subjects</h3>
                <div className="ph-more-list">
                  {more.map((t) => (
                    <Link
                      key={t.slug}
                      className="ph-more-row"
                      to={`/prelims/subject/${t.slug}`}
                      style={{ "--subj": t.color } as React.CSSProperties}
                    >
                      <span className="ph-swatch" aria-hidden="true" />
                      <span className="ph-name">{t.name}</span>
                      <b>{t.score}</b>
                      <span className="muted small">{t.due ? `${t.due} due` : "nothing due"}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </article>
  );
}

function PuzzleIcon() {
  return (
    <svg className="ph-pz-icon" width="84" height="84" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="7" fill="var(--bd-on-prelims)" />
      {[
        [6, 6],
        [20, 6],
        [13, 13],
        [6, 20],
        [20, 20],
        [13, 27],
        [27, 27],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="7" height="7" rx="1.5" fill="#f3f0ea" />
      ))}
      <rect x="27" y="13" width="7" height="7" rx="1.5" fill="#f2c14e" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      aria-hidden="true"
    >
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" strokeLinejoin="round" />
    </svg>
  );
}
