// Puzzles (the chosen design: Puzzles 1 · Arena, phone first). An endless, untimed stream of small
// puzzles near your rating: true or false, match the pairs, put in order, pin it on the map. Your
// rating (the same 0–1000 as MCQs) sits on top and moves by Elo after each one. A miss shows the
// right answer and why, then Next; it is logged for tonight's lesson. All subjects by default, with
// a subject filter; a tick or buzz after each answer (mutable). Leaving shows the run's summary.
// ?subjects=A,B narrows the subjects; ?items=a,b serves those puzzles first, in that order.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { Icon } from "../components/Icon";
import { allAttempts, recordAttempt, usePractice } from "../content/practice";
import { KEY_FROM_LABEL, servable, type Attempt, type PuzzleItem } from "../lib/practice";
import {
  eloDelta,
  pickPuzzle,
  PUZZLE_LABEL,
  puzzleKind,
  puzzlePool,
  puzzleSubjects,
  recentPuzzles,
  rightAnswer,
  solves,
  type PuzzleAnswer,
} from "../lib/puzzles";
import { Picture } from "./Picture";
import { subjectColour, useFeedback } from "./feedback";
import "../prelims/prelims.css";
import "./practice.css";

export default function Puzzles() {
  const practice = usePractice();
  useEffect(() => {
    document.title = "Puzzles · Mains Atlas";
  }, []);
  if (practice.status === "error")
    return (
      <article className="pz-page">
        <p className="loading">Couldn't load practice: {practice.error}</p>
      </article>
    );
  if (practice.status !== "ready")
    return (
      <article className="pz-page">
        <p className="loading">Loading puzzles…</p>
      </article>
    );
  return <Arena />;
}

interface Played {
  item: PuzzleItem;
  ok: boolean;
  delta: number;
}

function Arena() {
  const practice = usePractice();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const fb = useFeedback();
  const subjects = useMemo(() => (params.get("subjects") ?? "").split(",").filter(Boolean), [params]);
  const [queue] = useState(() => (params.get("items") ?? "").split(",").filter(Boolean));
  const subjectOf = useMemo(() => puzzleSubjects(practice.banks), [practice.banks]);
  const pool = useMemo(() => puzzlePool(practice.banks, subjects), [practice.banks, subjects]);
  const everySubject = useMemo(
    () => [...new Set(puzzlePool(practice.banks).map((p) => subjectOf.get(p.id)!))].sort(),
    [practice.banks, subjectOf],
  );

  const [served, setServed] = useState(0);
  const [current, setCurrent] = useState<PuzzleItem | null>(null);
  const [result, setResult] = useState<{ ok: boolean; delta: number } | null>(null);
  const [played, setPlayed] = useState<Played[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const startedAt = useRef(Date.now());
  const nextBtn = useRef<HTMLButtonElement>(null);

  // Next takes the focus (Enter goes on) without scrolling the page.
  useEffect(() => {
    if (result) nextBtn.current?.focus({ preventScroll: true });
  }, [result]);

  function pickNext(count: number): PuzzleItem | null {
    if (count < queue.length) {
      const fixed = practice.items.get(queue[count]);
      if (fixed?.kind === "puzzle" && servable(fixed)) return fixed;
    }
    return pickPuzzle(pool, practice.rating, recentPuzzles(allAttempts()));
  }

  // The first puzzle, and a new one when the subjects change before you answer.
  useEffect(() => {
    if (result) return;
    if (current && (served < queue.length || pool.some((p) => p.id === current.id))) return;
    setCurrent(pickNext(served));
    startedAt.current = Date.now();
  }, [pool]);

  function finish(answer: PuzzleAnswer) {
    if (!current || result) return;
    const ok = solves(current, answer);
    const delta = eloDelta(practice.rating, current.difficulty, ok ? 1 : 0);
    const attempt: Attempt = {
      id: `${current.id}-${Date.now().toString(36)}`,
      itemId: current.id,
      bank: current.bank,
      kind: "puzzle",
      at: new Date().toISOString(),
      ms: Math.min(Date.now() - startedAt.current, 6 * 3600 * 1000),
      mode: "practice",
      correct: ok,
      delta,
    };
    recordAttempt(attempt);
    fb.play(ok);
    setResult({ ok, delta });
    setPlayed((p) => [...p, { item: current, ok, delta }]);
  }

  function next() {
    const count = served + 1;
    setServed(count);
    setResult(null);
    setCurrent(pickNext(count));
    startedAt.current = Date.now();
  }

  function leave() {
    if (played.length) setLeaving(true);
    else void navigate("/prelims");
  }

  function setSubjects(list: string[]) {
    const p = new URLSearchParams(params);
    if (list.length) p.set("subjects", list.join(","));
    else p.delete("subjects");
    setParams(p, { replace: true });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || leaving) return;
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if (result && (k === "enter" || k === " ")) {
        // A focused button (Next itself) handles its own Enter.
        if ((e.target as HTMLElement)?.closest?.("button, a")) return;
        e.preventDefault();
        next();
      } else if (!result && current?.style === "tf" && (k === "t" || k === "f"))
        finish({ kind: "tf", value: k === "t" });
      else if (k === "escape") setFilterOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const solved = played.filter((p) => p.ok).length;
  const net = played.reduce((n, p) => n + p.delta, 0);
  const subject = current ? subjectOf.get(current.id) : undefined;

  return (
    <article className="pz-page" aria-label="Puzzles">
      <header className="pc-head pz-head">
        <button type="button" className="pc-x" aria-label="Leave puzzles" onClick={leave}>
          <Icon name="close" />
        </button>
        <nav className="seg" aria-label="Puzzle mode">
          <span className="seg-on" aria-current="page">
            Puzzles
          </span>
          <Link to="/prelims/rush">Rush</Link>
        </nav>
        <button
          type="button"
          className="pc-x pz-sound"
          aria-label={fb.on ? "Mute sounds" : "Turn sounds on"}
          aria-pressed={!fb.on}
          title={fb.on ? "Mute tick and buzz" : "Tick and buzz are off"}
          onClick={fb.toggle}
        >
          <Icon name={fb.on ? "sound" : "mute"} />
        </button>
        <div className="pz-rating" aria-label="Your rating">
          {result && (
            <span key={served} className={`pz-delta pc-pop ${result.delta >= 0 ? "up" : "down"}`}>
              {signed(result.delta)}
            </span>
          )}
          <span className="pz-star">
            <Star />
            <b>{practice.rating}</b>
          </span>
        </div>
      </header>

      <div className="pz-meta">
        {current && <span className="pz-diff">Puzzle {current.difficulty}</span>}
        {current && (
          <span className="pz-kind">
            <i style={{ background: subjectColour(subject) }} aria-hidden="true" />
            {subject} · {PUZZLE_LABEL[puzzleKind(current)]}
            {/* A past-paper statement is true or false as of its paper. */}
            {current.source.type === "pyq" && ` · UPSC ${current.source.year}`}
          </span>
        )}
        <div className="pz-filter">
          <button
            type="button"
            className="chip-btn"
            aria-expanded={filterOpen}
            aria-haspopup="true"
            onClick={() => setFilterOpen(!filterOpen)}
          >
            {subjects.length === 0
              ? "All subjects"
              : subjects.length === 1
                ? subjects[0]
                : `${subjects.length} subjects`}{" "}
            ▾
          </button>
          {filterOpen && (
            <div className="pz-menu" role="group" aria-label="Subjects">
              <button type="button" aria-pressed={!subjects.length} onClick={() => setSubjects([])}>
                All subjects
              </button>
              {everySubject.map((s) => {
                const on = subjects.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSubjects(on ? subjects.filter((x) => x !== s) : [...subjects, s])}
                  >
                    <i style={{ background: subjectColour(s) }} aria-hidden="true" />
                    {s}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!current ? (
        <section className="pz-main pz-empty">
          <h1>No puzzles here yet</h1>
          <p className="muted">
            Puzzles are made from past questions whose answers were checked against UPSC's key.{" "}
            {subjects.length ? "Try all subjects." : "Claude loads them with atlas practice-import."}
          </p>
        </section>
      ) : (
        <section
          key={`${current.id}-${served}`}
          className="pz-main pc-enter"
          aria-label={`Puzzle: ${PUZZLE_LABEL[puzzleKind(current)]}`}
        >
          <Board item={current} locked={!!result} onAnswer={finish} />
        </section>
      )}

      {current && result && (
        <section className={`pz-sheet pc-sheet ${result.ok ? "ok" : "bad"}`} aria-label="Result">
          <div className="pz-sheet-head">
            <span className="pz-mark" aria-hidden="true">
              {result.ok ? "✓" : "✕"}
            </span>
            <b>{result.ok ? "Solved" : "Not quite"}</b>
            <span className={`pz-sheet-delta ${result.delta >= 0 ? "up" : "down"}`}>{signed(result.delta)}</span>
          </div>
          {!result.ok && <RightAnswer item={current} />}
          {current.why && <p className="pz-why">{current.why}</p>}
          {current.source.type === "pyq" && current.source.keyFrom && (
            <p className="pz-key">{KEY_FROM_LABEL[current.source.keyFrom]}.</p>
          )}
          {!result.ok && <span className="pz-logged">Logged for tonight's lesson</span>}
          <button type="button" className="board-btn pz-next" onClick={next} ref={nextBtn}>
            Next puzzle
          </button>
        </section>
      )}

      {practice.saveError && <p className="s-error">{practice.saveError}</p>}

      {leaving && (
        <div className="pz-scrim" onClick={() => setLeaving(false)}>
          <section
            className="pz-sheet pc-sheet pz-leave"
            role="dialog"
            aria-modal="true"
            aria-label="Your run"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{solved ? "Nice run" : "This run"}</h2>
            <div className="pz-tiles">
              <div>
                <b className="up">{solved}</b>
                <span>solved</span>
              </div>
              <div>
                <b className="down">{played.length - solved}</b>
                <span>missed</span>
              </div>
              <div>
                <b className="gold">{signed(net)}</b>
                <span>rating</span>
              </div>
            </div>
            <Link className="board-btn quiet" to="/prelims">
              Back to Home
            </Link>
            <button type="button" className="pz-stay" onClick={() => setLeaving(false)} autoFocus>
              Keep going
            </button>
          </section>
        </div>
      )}
    </article>
  );
}

/** The right answer after a miss: the order or the pairs as a list, otherwise a line. */
function RightAnswer({ item }: { item: PuzzleItem }) {
  if (item.style === "order" && item.order)
    return (
      <ol className="pz-right-list" aria-label="The right order">
        {item.order.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
    );
  if (item.style === "match" && item.pairs)
    return (
      <ul className="pz-right-list pairs" aria-label="The right pairs">
        {item.pairs.map((x) => (
          <li key={x.left}>
            <b>{x.left}</b> → {x.right}
          </li>
        ))}
      </ul>
    );
  return <p className="pz-right">{rightAnswer(item)}</p>;
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

function Star() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18.2 22 12 18.3 5.8 22l1.7-7.2L2 10l7.1-1.1z" fill="currentColor" />
    </svg>
  );
}

/** A stable shuffle for one puzzle, so a re-render doesn't move things under your finger. */
function shuffled<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  // Never start already solved.
  if (out.length > 1 && out.every((x, i) => x === list[i])) out.push(out.shift()!);
  return out;
}

/** The puzzle itself, in its style. `locked` once answered: then it shows what was right. */
export function Board({
  item,
  locked,
  onAnswer,
}: {
  item: PuzzleItem;
  locked: boolean;
  onAnswer: (a: PuzzleAnswer) => void;
}) {
  switch (puzzleKind(item)) {
    case "tf":
      return <TrueFalse item={item} locked={locked} onAnswer={onAnswer} />;
    case "match":
      return <Match item={item} locked={locked} onAnswer={onAnswer} />;
    case "order":
      return <Order item={item} locked={locked} onAnswer={onAnswer} />;
    case "map":
      return <MapPin item={item} locked={locked} onAnswer={onAnswer} />;
    case "pick":
      return <Pick item={item} locked={locked} onAnswer={onAnswer} />;
  }
}

interface BoardProps {
  item: PuzzleItem;
  locked: boolean;
  onAnswer: (a: PuzzleAnswer) => void;
}

const GENERIC_TF = /^\s*(true or false\??|is this true\??)\s*$/i;

function TrueFalse({ item, locked, onAnswer }: BoardProps) {
  const [picked, setPicked] = useState<boolean | null>(null);
  const answer = (v: boolean) => {
    if (locked) return;
    setPicked(v);
    onAnswer({ kind: "tf", value: v });
  };
  const state = (v: boolean) =>
    !locked ? "" : v === item.truth ? " is-right" : picked === v ? " is-wrong" : " is-dim";
  return (
    <>
      {!GENERIC_TF.test(item.prompt) && <p className="pz-context">{item.prompt}</p>}
      <p className="pz-prompt">{item.statement}</p>
      <div className="pz-tf">
        <div className="pz-tf-ask">True or false?</div>
        <div className="pz-tf-btns">
          <button
            type="button"
            className={`pz-big false${state(false)}`}
            disabled={locked}
            onClick={() => answer(false)}
          >
            False
          </button>
          <button type="button" className={`pz-big true${state(true)}`} disabled={locked} onClick={() => answer(true)}>
            True
          </button>
        </div>
      </div>
    </>
  );
}

function Match({ item, locked, onAnswer }: BoardProps) {
  const pairs = item.pairs ?? [];
  const rights = useMemo(
    () =>
      shuffled(
        pairs.map((p) => p.right),
        item.id,
      ),
    [item.id, pairs],
  );
  const [sel, setSel] = useState<string | null>(null);
  const [made, setMade] = useState<Record<string, string>>({});
  const owner = Object.fromEntries(Object.entries(made).map(([l, r]) => [r, l]));
  const truth = Object.fromEntries(pairs.map((p) => [p.left, p.right]));

  function pickRight(r: string) {
    if (locked || !sel) return;
    const next = Object.fromEntries(Object.entries(made).filter(([, v]) => v !== r));
    next[sel] = r;
    setMade(next);
    setSel(null);
    if (Object.keys(next).length === pairs.length)
      window.setTimeout(() => onAnswer({ kind: "match", pairs: next }), 250);
  }

  return (
    <>
      <p className="pz-prompt">{item.prompt}</p>
      <div className="pz-match">
        <div className="pz-col">
          {pairs.map(({ left }) => {
            const st = locked
              ? truth[left] === made[left]
                ? " is-right"
                : " is-wrong"
              : sel === left
                ? " is-sel"
                : made[left]
                  ? " is-paired"
                  : "";
            return (
              <button
                key={left}
                type="button"
                className={`pz-tile lhs${st}`}
                aria-pressed={sel === left}
                disabled={locked}
                onClick={() => setSel(sel === left ? null : left)}
              >
                {left}
              </button>
            );
          })}
        </div>
        <div className="pz-col">
          {rights.map((r) => {
            const by = owner[r];
            const st = locked && by ? (truth[by] === r ? " is-right" : " is-wrong") : by ? " is-paired" : "";
            return (
              <button
                key={r}
                type="button"
                className={`pz-tile rhs${st}`}
                disabled={locked || !sel}
                onClick={() => pickRight(r)}
              >
                {r}
                {by && <em>← {by}</em>}
              </button>
            );
          })}
        </div>
      </div>
      {!locked && <span className="pz-help">Tap an item on the left, then its partner on the right.</span>}
    </>
  );
}

function Order({ item, locked, onAnswer }: BoardProps) {
  const right = item.order ?? [];
  const items = useMemo(() => shuffled(right, item.id), [item.id, right]);
  const [order, setOrder] = useState<string[]>([]);
  function tap(x: string) {
    if (locked || order.includes(x)) return;
    const next = [...order, x];
    setOrder(next);
    if (next.length === right.length) window.setTimeout(() => onAnswer({ kind: "order", order: next }), 250);
  }
  return (
    <>
      <p className="pz-prompt">{item.prompt}</p>
      <div className="pz-order">
        {items.map((x) => {
          const pos = order.indexOf(x);
          const st = locked ? (right[pos] === x ? " is-right" : " is-wrong") : pos >= 0 ? " is-paired" : "";
          return (
            <button key={x} type="button" className={`pz-tile order${st}`} disabled={locked} onClick={() => tap(x)}>
              <span className="pz-num" aria-hidden="true">
                {pos >= 0 ? pos + 1 : ""}
              </span>
              {x}
              {pos >= 0 && <span className="sr-only"> (number {pos + 1})</span>}
            </button>
          );
        })}
      </div>
      {!locked && (
        <button type="button" className="pz-reset" onClick={() => setOrder([])} disabled={!order.length}>
          Start the order again
        </button>
      )}
    </>
  );
}

function MapPin({ item, locked, onAnswer }: BoardProps) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <>
      <p className="pz-prompt">{item.prompt}</p>
      <div className="pz-map">
        <Picture src={item.map ?? ""} alt={item.alt ?? ""} />
        {(item.regions ?? []).map((r) => {
          const st = locked ? (r.id === item.region ? " is-right" : r.id === picked ? " is-wrong" : "") : "";
          return (
            <button
              key={r.id}
              type="button"
              className={`pz-pin${st}`}
              style={{ left: `${r.x}%`, top: `${r.y}%` }}
              aria-label={`Place ${r.id}`}
              disabled={locked}
              onClick={() => {
                setPicked(r.id);
                onAnswer({ kind: "map", region: r.id });
              }}
            >
              {r.id}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Pick({ item, locked, onAnswer }: BoardProps) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <>
      <p className="pz-prompt">{item.prompt}</p>
      <div className="pz-order">
        {(item.options ?? []).map((o, i) => {
          const st = locked ? (i === item.answer ? " is-right" : i === picked ? " is-wrong" : "") : "";
          return (
            <button
              key={i}
              type="button"
              className={`pz-tile order${st}`}
              disabled={locked}
              onClick={() => {
                setPicked(i);
                onAnswer({ kind: "pick", option: i });
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
    </>
  );
}
