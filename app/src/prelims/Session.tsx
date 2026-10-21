// A Prelims MCQ session (the chosen design: Session 3 · Statement marks). The question sits on
// the left: mark each statement ✓ or ✕ and the option your marks point to lights up; lock in
// sure or unsure. In practice mode the answer shows at once, with each statement's truth and
// where your marks slipped; then one of eight buttons says how it went. Exam mode holds every
// answer until the end. Keys: A–D choose, S / U lock in sure / unsure, 1–5 grade, Enter next.
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { createEmptyCard, fsrs, type Card, type Grade as FsrsGrade } from "ts-fsrs";
import { Link } from "../components/nav";
import { Icon } from "../components/Icon";
import { gradeAttempt, recordAttempt, usePractice } from "../content/practice";
import { impliedOption, markable, statementTruth } from "../lib/statements";
import { planSession } from "../lib/srs";
import {
  fsrsRating,
  GRADE_LABEL,
  KEY_FROM_LABEL,
  mcqDelta,
  RIGHT_GRADES,
  servable,
  WRONG_GRADES,
  type Attempt,
  type Grade,
  type McqItem,
} from "../lib/practice";
import "./prelims.css";

const LETTERS = ["A", "B", "C", "D", "E"];
const SLOW_MS = 72_000;
const scheduler = fsrs({ enable_fuzz: false, request_retention: 0.9 });

interface Answer {
  attempt: Attempt;
  day: string;
}

/** "back in 6 days" for a grade, from FSRS (the item's state before this answer). */
function backIn(grade: Grade, card: Card | undefined, now: Date) {
  const next = scheduler.next(card ?? createEmptyCard(now), now, fsrsRating(grade) as FsrsGrade).card.due;
  const mins = (next.getTime() - now.getTime()) / 60_000;
  if (mins < 60) return `back in ${Math.max(1, Math.round(mins))} min`;
  if (mins < 60 * 24) return `back in ${Math.round(mins / 60)} h`;
  const days = Math.round(mins / 1440);
  return days === 1 ? "back tomorrow" : `back in ${days} days`;
}

function useClock(running: boolean, startedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [running]);
  return Math.max(0, now - startedAt);
}

const clockText = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function Session() {
  const [params] = useSearchParams();
  const practice = usePractice();
  const mode = params.get("mode") === "exam" ? "exam" : "practice";
  const size = Math.min(200, Math.max(1, Number(params.get("n")) || 20));
  const bankIds = (params.get("banks") ?? "").split(",").filter(Boolean);
  const itemIds = (params.get("items") ?? "").split(",").filter(Boolean);

  // The questions are fixed when the session starts, so answering doesn't reshuffle them.
  const [plan, setPlan] = useState<McqItem[] | null>(null);
  useEffect(() => {
    if (practice.status !== "ready" || plan) return;
    if (itemIds.length) {
      // A chosen set (from the Mistake notebook), in that order.
      setPlan(
        itemIds
          .map((id) => practice.items.get(id))
          .filter((i): i is McqItem => !!i && i.kind === "mcq" && servable(i))
          .slice(0, size),
      );
      return;
    }
    const banks = bankIds.length ? practice.banks.filter((b) => bankIds.includes(b.id)) : practice.banks;
    setPlan(planSession(banks, practice.states, size, "mcq").items as McqItem[]);
  }, [practice.status, practice.banks, practice.states, practice.items, plan, bankIds, itemIds, size]);

  useEffect(() => {
    document.title = "Practice · Mains Atlas";
  }, []);

  if (practice.status === "error")
    return (
      <article className="dash prelims-page">
        <p className="loading">Couldn't load practice: {practice.error}</p>
      </article>
    );
  if (!plan)
    return (
      <article className="dash prelims-page">
        <p className="loading">Loading questions…</p>
      </article>
    );
  if (!plan.length)
    return (
      <article className="dash prelims-page">
        <h1>Nothing to practise here yet</h1>
        <p className="muted">
          No question in these topics is due, and none is new. Only PYQs whose answers were checked against UPSC's
          official key are used.
        </p>
        <Link className="board-btn" to="/prelims">
          Back to Prelims
        </Link>
      </article>
    );
  return <Run items={plan} mode={mode} />;
}

/** The session itself; the morning quiz (src/lessons/Quiz.tsx) reuses it with mode "quiz". */
export function Run({ items, mode }: { items: McqItem[]; mode: "practice" | "exam" | "quiz" }) {
  const practice = usePractice();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [done, setDone] = useState(false);
  const item = items[index];
  const answered = answers[index];
  // ✓/✕ marks only when the options are about the statements; otherwise they're a plain list.
  const count = item?.statements && markable(item.options, item.statements.length) ? item.statements.length : 0;
  const [marks, setMarks] = useState<(boolean | null)[]>(() => Array(count).fill(null));
  const [chosen, setChosen] = useState<number | null>(null);
  const startedAt = useRef(Date.now());
  const elapsed = useClock(!answered && !done, startedAt.current);
  // Each item's state before this session, for "back in …" on the grade buttons.
  const [before] = useState(() => new Map(items.map((i) => [i.id, practice.states.get(i.id)?.card])));

  useEffect(() => {
    setMarks(Array(count).fill(null));
    setChosen(null);
    startedAt.current = Date.now();
  }, [index, count]);

  const implied = count ? impliedOption(item.options, marks) : null;
  const pick = chosen ?? implied;
  const truth = count ? statementTruth(item.options, item.answer, count) : null;
  const showAnswer = !!answered && mode !== "exam";

  function lock(sure: boolean) {
    if (pick === null || answered) return;
    const correct = pick === item.answer;
    const attempt: Attempt = {
      id: `${item.id}-${Date.now().toString(36)}`,
      itemId: item.id,
      bank: item.bank,
      kind: "mcq",
      at: new Date().toISOString(),
      ms: Date.now() - startedAt.current,
      mode,
      correct,
      sure,
      chosen: pick,
      ...(count ? { marks } : {}),
      delta: mcqDelta(correct, sure),
    };
    const day = recordAttempt(attempt);
    const next = [...answers];
    next[index] = { attempt, day };
    setAnswers(next);
    if (mode === "exam") advance();
  }

  function grade(g: Grade) {
    if (!answered) return;
    gradeAttempt(answered.day, answered.attempt.id, g);
    const next = [...answers];
    next[index] = { ...answered, attempt: { ...answered.attempt, grade: g } };
    setAnswers(next);
  }

  function advance() {
    if (index + 1 >= items.length) setDone(true);
    else setIndex(index + 1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.("input, textarea")) return;
      const k = e.key.toLowerCase();
      if (!answered && "abcde".includes(k) && k.length === 1) {
        const i = "abcde".indexOf(k);
        if (i < item.options.length) setChosen(i);
      } else if (!answered && (k === "s" || k === "u")) lock(k === "s");
      else if (showAnswer && /^[1-5]$/.test(k)) {
        const list = answered.attempt.correct ? RIGHT_GRADES : WRONG_GRADES;
        const g = list[Number(k) - 1];
        if (g) grade(g);
      } else if (answered && (k === "enter" || k === "arrowright")) advance();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (done) return <Summary items={items} answers={answers} mode={mode} onGrade={setAnswers} />;

  const now = new Date();
  return (
    <article className="session">
      <section className="q-card" aria-label={`Question ${index + 1} of ${items.length}`}>
        <div className="q-meta">
          <span className="chip">
            {item.source.type === "pyq" ? `PYQ ${item.source.year}` : "Practice"} · {item.topic}
          </span>
          <span
            className={`q-clock${elapsed > SLOW_MS && !answered ? " slow" : ""}`}
            aria-label="Time on this question"
          >
            {clockText(answered ? answered.attempt.ms : elapsed)}
          </span>
        </div>
        <p className="q-stem">{item.stem}</p>
        {item.statements && !count && (
          <ol className="q-statements plain">
            {item.statements.map((st, i) => (
              <li key={i}>
                <span className="st-text">{st}</span>
              </li>
            ))}
          </ol>
        )}
        {count > 0 && (
          <ol className="q-statements">
            {item.statements!.map((st, i) => {
              const t = showAnswer && truth ? truth[i] : null;
              const slipped = showAnswer && truth && marks[i] !== null && marks[i] !== truth[i];
              return (
                <li key={i} className={t === null ? "" : t ? "is-true" : "is-false"}>
                  <span className="st-text">{st}</span>
                  <span className="st-marks" role="group" aria-label={`Statement ${i + 1}`}>
                    {[true, false].map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        className={`st-mark${marks[i] === v ? " on" : ""}`}
                        aria-pressed={marks[i] === v}
                        aria-label={v ? "Mark true" : "Mark false"}
                        disabled={!!answered}
                        onClick={() => setMarks(marks.map((m, k) => (k === i ? (m === v ? null : v) : m)))}
                      >
                        {v ? "✓" : "✕"}
                      </button>
                    ))}
                  </span>
                  {t !== null && (
                    <span className="st-truth">
                      {t ? "True" : "False"}
                      {slipped && <b> · your mark slipped</b>}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {item.ask && <p className="q-ask">{item.ask}</p>}
        <div className="q-options" role="radiogroup" aria-label="Options">
          {item.options.map((o, i) => {
            const state = showAnswer
              ? i === item.answer
                ? "right"
                : i === answered!.attempt.chosen
                  ? "wrong"
                  : ""
              : i === pick
                ? chosen === i
                  ? "picked"
                  : "implied"
                : "";
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={pick === i}
                className={`q-option ${state}`}
                disabled={!!answered}
                onClick={() => setChosen(i)}
              >
                <b>{LETTERS[i]}</b>
                <span>{o}</span>
                {state === "implied" && <em>your marks</em>}
              </button>
            );
          })}
        </div>
        {!answered ? (
          <div className="q-lock">
            <button type="button" className="board-btn" disabled={pick === null} onClick={() => lock(true)}>
              Lock in · sure <kbd>S</kbd>
            </button>
            <button type="button" className="board-btn quiet" disabled={pick === null} onClick={() => lock(false)}>
              Lock in · unsure <kbd>U</kbd>
            </button>
          </div>
        ) : (
          showAnswer && (
            <Feedback
              item={item}
              attempt={answered.attempt}
              backIn={(g) => backIn(g, before.get(item.id), now)}
              onGrade={grade}
              onNext={advance}
              last={index + 1 >= items.length}
            />
          )
        )}
      </section>

      <aside className="s-panel" aria-label="Session">
        <div className="s-head">
          <b>{mode === "exam" ? "Exam mode" : mode === "quiz" ? "Morning quiz" : "Practice"}</b>
          <span>
            {index + 1} of {items.length}
          </span>
        </div>
        <div className="s-rating">
          <span className="label">Rating</span>
          <b>{practice.rating}</b>
          {showAnswer && answered.attempt.delta !== undefined && (
            <span className={`delta ${answered.attempt.delta >= 0 ? "up" : "down"}`}>
              {answered.attempt.delta >= 0 ? "+" : ""}
              {answered.attempt.delta}
            </span>
          )}
        </div>
        <ol className="s-dots" aria-label="Questions">
          {items.map((it, i) => {
            const a = answers[i]?.attempt;
            const cls = !a ? (i === index ? "now" : "") : mode === "exam" ? "done" : a.correct ? "right" : "wrong";
            return <li key={it.id} className={cls} title={`Question ${i + 1}`} />;
          })}
        </ol>
        {practice.saveError && <p className="s-error">{practice.saveError}</p>}
        <p className="s-keys">
          <kbd>A</kbd>–<kbd>D</kbd> choose · <kbd>S</kbd>/<kbd>U</kbd> lock in · <kbd>1</kbd>–<kbd>5</kbd> grade ·{" "}
          <kbd>Enter</kbd> next
        </p>
        <Link className="s-quit" to="/prelims">
          <Icon name="close" /> End session
        </Link>
      </aside>
    </article>
  );
}

function Feedback({
  item,
  attempt,
  backIn,
  onGrade,
  onNext,
  last,
}: {
  item: McqItem;
  attempt: Attempt;
  backIn: (g: Grade) => string;
  onGrade: (g: Grade) => void;
  onNext: () => void;
  last: boolean;
}) {
  const list = attempt.correct ? RIGHT_GRADES : WRONG_GRADES;
  return (
    <div className={`q-feedback ${attempt.correct ? "right" : "wrong"}`}>
      <p className="verdict">
        {attempt.correct ? "Right" : "Wrong"}: the answer is {LETTERS[item.answer]}.
        {attempt.correct === false && attempt.sure && <b> A confident miss: it comes first in tonight's lesson.</b>}
      </p>
      {item.why && (
        <ul className="why">
          {item.why.map((w, i) => (
            <li key={i}>
              <b>{LETTERS[i]}</b> {w}
            </li>
          ))}
        </ul>
      )}
      {item.trap && <p className="trap">Trap: {item.trap}</p>}
      {item.source.type === "pyq" && item.source.keyFrom && (
        <p className="key-from muted small">{KEY_FROM_LABEL[item.source.keyFrom]}.</p>
      )}
      {item.explanation && (
        <details className="explain" open={!attempt.correct}>
          <summary>
            Explanation{" "}
            <span className="muted">
              · {item.explanation.source}
              {item.explanation.checked ? "" : " · not fact-checked"}
            </span>
          </summary>
          <p>{item.explanation.text}</p>
        </details>
      )}
      <p className="grade-ask">{attempt.correct ? "How well did you know it?" : "Why did you miss it?"}</p>
      <div className="grades" role="group" aria-label="Grade">
        {list.map((g, i) => (
          <button
            key={g}
            type="button"
            className={`grade${attempt.grade === g ? " on" : ""}`}
            aria-pressed={attempt.grade === g}
            onClick={() => onGrade(g)}
          >
            <kbd>{i + 1}</kbd>
            <b>{GRADE_LABEL[g]}</b>
            <span>{backIn(g)}</span>
          </button>
        ))}
      </div>
      <button type="button" className="board-btn" onClick={onNext}>
        {last ? "See the summary" : "Next question"} <kbd>Enter</kbd>
      </button>
    </div>
  );
}

function Summary({
  items,
  answers,
  mode,
  onGrade,
}: {
  items: McqItem[];
  answers: Answer[];
  mode: "practice" | "exam" | "quiz";
  onGrade: (a: Answer[]) => void;
}) {
  const practice = usePractice();
  const done = answers.filter(Boolean);
  const right = done.filter((a) => a.attempt.correct).length;
  const sure = done.filter((a) => a.attempt.sure);
  const sureRight = sure.filter((a) => a.attempt.correct).length;
  const unsure = done.filter((a) => a.attempt.sure === false);
  const unsureRight = unsure.filter((a) => a.attempt.correct).length;
  const delta = done.reduce((n, a) => n + (a.attempt.delta ?? 0), 0);
  const marks = done.reduce((n, a) => n + (a.attempt.correct ? 2 : -2 / 3), 0);
  const avg = done.length ? Math.round(done.reduce((n, a) => n + a.attempt.ms, 0) / done.length / 1000) : 0;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  function grade(i: number, g: Grade) {
    const a = answers[i];
    gradeAttempt(a.day, a.attempt.id, g);
    const next = [...answers];
    next[i] = { ...a, attempt: { ...a.attempt, grade: g } };
    onGrade(next);
  }

  return (
    <article className="dash prelims-page summary">
      <h1>Session done</h1>
      <div className="sum-tiles">
        <div>
          <span>Right</span>
          <b>
            {right} / {done.length}
          </b>
        </div>
        <div>
          <span>Marks (UPSC scheme)</span>
          <b>{marks.toFixed(1)}</b>
        </div>
        <div>
          <span>Rating</span>
          <b>
            {practice.rating}{" "}
            <em className={delta >= 0 ? "up" : "down"}>
              {delta >= 0 ? "+" : ""}
              {delta}
            </em>
          </b>
        </div>
        <div>
          <span>Sure / unsure right</span>
          <b>
            {pct(sureRight, sure.length)} / {pct(unsureRight, unsure.length)}
          </b>
        </div>
        <div>
          <span>Average time</span>
          <b>{avg} s</b>
        </div>
      </div>
      <section className="sum-list" aria-label="Your answers">
        {items.map((it, i) => {
          const a = answers[i]?.attempt;
          if (!a) return null;
          const list = a.correct ? RIGHT_GRADES : WRONG_GRADES;
          return (
            <div key={it.id} className={`sum-row ${a.correct ? "right" : "wrong"}`}>
              <span className="n">{i + 1}</span>
              <span className="q">
                {it.stem.split("\n")[0]}
                <em>
                  {a.correct
                    ? "Right"
                    : `Wrong: you chose ${LETTERS[a.chosen ?? 0]}, the answer is ${LETTERS[it.answer]}`}
                  {a.sure === false ? " · unsure" : " · sure"}
                </em>
              </span>
              {(mode === "exam" || !a.grade) && (
                <span className="grades small" role="group" aria-label="Grade">
                  {list.map((g) => (
                    <button
                      key={g}
                      type="button"
                      className={`grade${a.grade === g ? " on" : ""}`}
                      aria-pressed={a.grade === g}
                      onClick={() => grade(i, g)}
                    >
                      {GRADE_LABEL[g]}
                    </button>
                  ))}
                </span>
              )}
              {mode !== "exam" && a.grade && <span className="g">{GRADE_LABEL[a.grade]}</span>}
            </div>
          );
        })}
      </section>
      <div className="sum-actions">
        <Link className="board-btn" to="/prelims">
          Back to Prelims
        </Link>
        <Link className="board-btn quiet" to="/prelims/notebook">
          Open the Mistake notebook
        </Link>
      </div>
    </article>
  );
}
