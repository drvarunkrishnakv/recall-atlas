// Puzzle Rush (the chosen design: Puzzles 3 · Rush). True or false, as fast as you can: three
// minutes, three strikes. Rush keeps its own best score (from the log) and never moves the rating.
// Each answer is logged (mode "rush", one session id per run), so misses reach tonight's lesson.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "../components/nav";
import { Icon } from "../components/Icon";
import { allAttempts, recordAttempt, usePractice } from "../content/practice";
import type { Attempt, PuzzleItem } from "../lib/practice";
import { puzzlePool, puzzleSubjects, rushBest, rushQueue, RUSH_SECONDS, RUSH_STRIKES } from "../lib/puzzles";
import { useFeedback } from "./feedback";
import "../prelims/prelims.css";
import "./practice.css";

const GENERIC_TF = /^\s*(true or false\??|is this true\??)\s*$/i;

export default function Rush() {
  const practice = usePractice();
  useEffect(() => {
    document.title = "Puzzle Rush · Mains Atlas";
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
        <p className="loading">Loading Rush…</p>
      </article>
    );
  return <Game />;
}

type Phase = "start" | "run" | "end";

function Game() {
  const practice = usePractice();
  const fb = useFeedback();
  const pool = useMemo(() => puzzlePool(practice.banks, null, ["tf"]), [practice.banks]);
  const subjectOf = useMemo(() => puzzleSubjects(practice.banks), [practice.banks]);
  const best = useMemo(() => rushBest(allAttempts()), [practice.days]);
  const [phase, setPhase] = useState<Phase>("start");
  const [reason, setReason] = useState<"time" | "strikes" | "stopped">("stopped");
  const [queue, setQueue] = useState<PuzzleItem[]>([]);
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [missed, setMissed] = useState<PuzzleItem[]>([]);
  const [flash, setFlash] = useState<"ok" | "bad" | null>(null);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [bestBefore, setBestBefore] = useState(0);
  const session = useRef("");
  const shownAt = useRef(0);
  const flashTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  useEffect(() => {
    if (phase !== "run") return;
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= endsAt) end("time");
    }, 250);
    return () => window.clearInterval(t);
  });

  function start() {
    session.current = `rush-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setBestBefore(best);
    setQueue(rushQueue(pool));
    setQi(0);
    setScore(0);
    setStrikes(0);
    setMissed([]);
    setFlash(null);
    const t = Date.now();
    setNow(t);
    setEndsAt(t + RUSH_SECONDS * 1000);
    shownAt.current = t;
    setPhase("run");
  }

  function end(why: "time" | "strikes" | "stopped") {
    window.clearTimeout(flashTimer.current);
    setFlash(null);
    setReason(why);
    setPhase("end");
  }

  const q = queue.length ? queue[qi % queue.length] : undefined;

  function answer(v: boolean) {
    if (phase !== "run" || flash || !q) return;
    const ok = v === q.truth;
    const attempt: Attempt = {
      id: `${q.id}-${Date.now().toString(36)}`,
      itemId: q.id,
      bank: q.bank,
      kind: "puzzle",
      at: new Date().toISOString(),
      ms: Date.now() - shownAt.current,
      mode: "rush",
      correct: ok,
      session: session.current,
    };
    recordAttempt(attempt);
    fb.play(ok);
    const struck = ok ? strikes : strikes + 1;
    if (ok) setScore(score + 1);
    else {
      setStrikes(struck);
      setMissed([...missed, q]);
    }
    setFlash(ok ? "ok" : "bad");
    flashTimer.current = window.setTimeout(
      () => {
        if (struck >= RUSH_STRIKES) return end("strikes");
        setFlash(null);
        // A new shuffle when the queue runs out.
        if ((qi + 1) % queue.length === 0) setQueue([...queue, ...rushQueue(pool)]);
        setQi(qi + 1);
        shownAt.current = Date.now();
      },
      ok ? 220 : 520,
    );
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || phase !== "run") return;
      const k = e.key.toLowerCase();
      if (k === "t" || k === "arrowright") answer(true);
      else if (k === "f" || k === "arrowleft") answer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const shownBest = Math.max(best, phase === "end" ? score : 0);

  return (
    <article className="pz-page rush" aria-label="Puzzle Rush">
      <header className="pc-head">
        <Link className="pc-x" to="/prelims/puzzles" aria-label="Back to puzzles">
          <Icon name="back" />
        </Link>
        <span className="pc-title">Puzzle Rush</span>
        <span className="rush-best">Best {shownBest}</span>
      </header>

      {phase === "start" && (
        <section className="rush-start pc-rise" aria-label="Start">
          <svg className="rush-bolt" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
          </svg>
          <h1>
            3 minutes.
            <br />3 strikes.
          </h1>
          <p>
            True or false, as fast as you can. Rush has its own best score and doesn't touch your puzzle rating. Misses
            still go into tonight's lesson.
          </p>
          {pool.length ? (
            <button type="button" className="rush-go pc-pulse" onClick={start}>
              Start
            </button>
          ) : (
            <p className="muted">
              No true-or-false puzzles are loaded yet. They are made from past questions whose answers were checked
              against UPSC's key.
            </p>
          )}
        </section>
      )}

      {phase === "run" && q && (
        <section className="rush-run" aria-label="Run">
          <div className="rush-stats">
            <div>
              <b className={left <= 30 ? "late" : ""} aria-label="Time left">
                {clock}
              </b>
              <span>Left</span>
            </div>
            <div>
              <b key={score} className={`gold${flash === "ok" ? " pc-pop" : ""}`} aria-label="Score">
                {score}
              </b>
              <span>Score</span>
            </div>
            <div>
              <span className="rush-strikes" aria-label={`${strikes} of ${RUSH_STRIKES} strikes`}>
                {Array.from({ length: RUSH_STRIKES }, (_, i) => (
                  <i key={i} className={i < strikes ? "on" : ""}>
                    {i < strikes ? "✕" : ""}
                  </i>
                ))}
              </span>
              <span>Strikes</span>
            </div>
          </div>
          <div className="rush-time" aria-hidden="true">
            <span className={left <= 30 ? "late" : ""} style={{ width: `${(left / RUSH_SECONDS) * 100}%` }} />
          </div>
          <div className={`rush-card${flash ? ` ${flash}` : ""}`} aria-live="polite">
            <span className="rush-q-meta">
              {subjectOf.get(q.id)} · #{qi + 1}
              {q.source.type === "pyq" && ` · UPSC ${q.source.year}`}
            </span>
            {!GENERIC_TF.test(q.prompt) && <span className="pz-context">{q.prompt}</span>}
            <p className="rush-q">{q.statement}</p>
          </div>
          <div className="pz-tf-btns">
            <button type="button" className="pz-big false" onClick={() => answer(false)}>
              False
            </button>
            <button type="button" className="pz-big true" onClick={() => answer(true)}>
              True
            </button>
          </div>
          <button type="button" className="pz-stay" onClick={() => end("stopped")}>
            End the run
          </button>
        </section>
      )}

      {phase === "end" && (
        <section className="rush-end pc-rise" aria-label="Run over">
          <div className="rush-score">
            <span className="rush-reason">
              {reason === "strikes" ? "Three strikes" : reason === "time" ? "Time's up" : "Run ended"}
            </span>
            <b>{score}</b>
            <span>{score > bestBefore ? "New best!" : `Your best is ${shownBest}`}</span>
          </div>
          {missed.length > 0 && (
            <section className="rush-misses" aria-label="Your misses">
              <h2>Your misses · in tonight's lesson</h2>
              {missed.map((m, i) => (
                <div key={m.id + i}>
                  <b>{m.statement}</b>
                  <span>
                    <em className={m.truth ? "up" : "down"}>{m.truth ? "True" : "False"}.</em> {m.why}
                  </span>
                </div>
              ))}
            </section>
          )}
          <div className="rush-actions">
            <Link className="board-btn quiet" to="/prelims/puzzles">
              Puzzles
            </Link>
            <button type="button" className="rush-go small" onClick={start}>
              Play again
            </button>
          </div>
        </section>
      )}
      {practice.saveError && <p className="s-error">{practice.saveError}</p>}
    </article>
  );
}
