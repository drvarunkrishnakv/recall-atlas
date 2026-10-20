// Write an answer (the chosen designs: Write 1 · Stepper on phones and Write 3 · Desk + phone on
// wider screens, the same flow on both). Pick a question, plan for a minute if you like, write on
// paper against the clock in a dimmed exam-hall screen, photograph your pages, score yourself, and
// send it. Claude marks it on its next scheduled run, not at once.
//
//   /mains/write                 pick a question and write (?q=<id>, ?paper=GS2, ?drill=<fix tag>)
//   /mains/write?answer=<id>     an answer being finished: add pages (the desk's QR code opens this
//                                on the phone), score it and send it
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { Icon } from "../components/Icon";
import { useContent } from "../content/store";
import { changeAnswer, refreshAnswer, useMains, usePoll } from "../content/mains";
import {
  clock,
  draftAnswer,
  FIX_TAGS,
  fmtMarks,
  isPaper,
  MAINS_PAPERS,
  minutesFor,
  PAPER_SHORT,
  SELF_MISSED,
  suggestQuestions,
  wordsFor,
  type FixTagId,
  type MainsAnswer,
  type MainsPaper,
  type MainsQuestion,
  type Suggestion,
} from "../lib/mains";
import { Photo, PagesEditor, QrCode, QuestionFacts, questionLine, ScoreButtons, Steps, useNow, useWide } from "./parts";
import "../prelims/prelims.css";
import "./mains.css";

const STEPS = ["Question", "Write", "Upload", "Self-score", "Sent"];

export default function Write() {
  const mains = useMains();
  const [params] = useSearchParams();
  const answerId = params.get("answer");
  useEffect(() => {
    document.title = "Write an answer · Mains Atlas";
  }, []);
  if (mains.status !== "ready")
    return (
      <article className="dash mw-page">
        <p className="loading">{mains.status === "error" ? `Couldn't load: ${mains.error}` : "Loading…"}</p>
      </article>
    );
  return answerId ? <Continue key={answerId} id={answerId} /> : <Compose />;
}

// ---------- Picking a question ----------

function Compose() {
  const mains = useMains();
  const { pages } = useContent();
  const wide = useWide();
  const [params, setParams] = useSearchParams();
  const paper = isPaper(params.get("paper")) ? (params.get("paper") as MainsPaper) : null;
  const drill = params.get("drill");
  const drillTag = drill && Object.hasOwn(FIX_TAGS, drill) ? FIX_TAGS[drill as FixTagId] : null;
  const written = useMemo(
    () => new Set([...pages.values()].filter((p) => p.collection === "notes").map((p) => p.id)),
    [pages],
  );
  const questions = useMemo(() => mains.sets.flatMap((s) => s.questions), [mains.sets]);
  const answers = useMemo(() => [...mains.answers.values()], [mains.answers]);
  const suggestions = useMemo(
    () => suggestQuestions(questions, answers, { paper, written }),
    [questions, answers, paper, written],
  );
  const [pick, setPick] = useState(0);
  const chosenId = params.get("q");
  const chosen = chosenId ? mains.questions.get(chosenId) : undefined;
  const at = suggestions.length ? pick % suggestions.length : 0;
  const current: Suggestion | undefined = chosen
    ? (suggestions.find((s) => s.question.id === chosen.id) ?? { question: chosen, why: "again" })
    : suggestions[at];
  const papers = MAINS_PAPERS.filter((p) => mains.sets.some((s) => s.paper === p && s.questions.length));
  const unsent = answers
    .filter((a) => a.status === "draft" && Date.now() - Date.parse(a.createdAt) < 2 * 864e5 && a.times.writeMs > 0)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  if (!questions.length)
    return (
      <article className="dash mw-page">
        <h1>Write an answer</h1>
        <p className="muted">
          No questions yet. Claude loads past papers with <code>atlas mains-import</code>; they show here after that.
        </p>
      </article>
    );
  if (!current)
    return (
      <article className="dash mw-page">
        <h1>Write an answer</h1>
        <p className="muted">No questions on this paper yet.</p>
        <button type="button" className="board-btn quiet" onClick={() => setParam("paper", null)}>
          Show every paper
        </button>
      </article>
    );

  const others = suggestions.filter((s) => s.question.id !== current.question.id).slice(0, 6);
  const picker = (
    <div className="mw-picker">
      <div className="mw-paper-chips" role="group" aria-label="Paper">
        <button
          type="button"
          className={`chip-btn${paper ? "" : " on"}`}
          aria-pressed={!paper}
          onClick={() => setParam("paper", null)}
        >
          All
        </button>
        {papers.map((p) => (
          <button
            key={p}
            type="button"
            className={`chip-btn${paper === p ? " on" : ""}`}
            aria-pressed={paper === p}
            onClick={() => {
              setPick(0);
              const next = new URLSearchParams(params);
              next.set("paper", p);
              next.delete("q");
              setParams(next, { replace: true });
            }}
          >
            {PAPER_SHORT[p]}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="chip-btn"
        onClick={() => {
          const from = chosen
            ? Math.max(
                0,
                suggestions.findIndex((s) => s.question.id === chosen.id),
              )
            : at;
          setPick(from + 1);
          setParam("q", null);
        }}
      >
        Different question
      </button>
    </div>
  );
  const list = (
    <section className="board-card mw-others" aria-label="Other questions">
      <h2>Other questions</h2>
      {others.map((s) => (
        <button key={s.question.id} type="button" className="mw-other" onClick={() => setParam("q", s.question.id)}>
          <span className="meta">
            {s.why === "retry" ? <em className="retry">Retry due</em> : s.why === "new" ? <em>New</em> : <em>Again</em>}
            {questionLine(s.question)}
          </span>
          <span className="t">{s.question.text}</span>
        </button>
      ))}
    </section>
  );
  const banners = (
    <>
      {drillTag && (
        <p className="mw-banner">
          <b>Practising: {drillTag.label}.</b> {drillTag.drill}
        </p>
      )}
      {unsent && (
        <p className="mw-banner">
          You have an unsent answer on <b>{unsent.question.topic}</b>.{" "}
          <Link to={`/mains/write?answer=${unsent.id}`}>Add its pages and send it</Link>
        </p>
      )}
    </>
  );
  return (
    <QuestionDesk
      key={current.question.id}
      suggestion={current}
      wide={wide}
      top={
        <>
          {banners}
          {picker}
        </>
      }
      list={list}
    />
  );
}

/** Plan points from the desk's plan box: one per line (or split at "·"). */
const splitPlan = (text: string) =>
  text
    .split(/\n|·/)
    .map((s) => s.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 12);

/** A short signal at one minute left: a buzz where the phone can, and two soft beeps. */
function useSignal() {
  const ctx = useRef<AudioContext | null>(null);
  return {
    prime() {
      try {
        ctx.current ??= new AudioContext();
      } catch {
        /* no sound on this device */
      }
    },
    ring() {
      navigator.vibrate?.([180, 90, 180]);
      const c = ctx.current;
      if (!c) return;
      for (const t of [0, 0.28]) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, c.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.12, c.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t + 0.18);
        o.connect(g).connect(c.destination);
        o.start(c.currentTime + t);
        o.stop(c.currentTime + t + 0.2);
      }
    },
  };
}

// ---------- One question: plan and write ----------

function QuestionDesk({
  suggestion,
  wide,
  top,
  list,
}: {
  suggestion: Suggestion;
  wide: boolean;
  top: React.ReactNode;
  list: React.ReactNode;
}) {
  const question: MainsQuestion = suggestion.question;
  const navigate = useNavigate();
  const [marks, setMarks] = useState(question.marks);
  const words = question.marksAssumed ? wordsFor(marks) : question.words;
  const minutes = minutesFor(marks, question.paper);
  const limitMs = minutes * 60_000;
  const [phase, setPhase] = useState<"question" | "plan" | "write">("question");
  const [planStart, setPlanStart] = useState<number | null>(null);
  const [planMs, setPlanMs] = useState(0);
  const [points, setPoints] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [planText, setPlanText] = useState("");
  const [writeStart, setWriteStart] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const answer = useRef<MainsAnswer | null>(null);
  const created = useRef<Promise<unknown> | null>(null);
  const signal = useSignal();
  const now = useNow(phase !== "question");
  const plan = wide ? splitPlan(planText) : points;
  const planLeft = planStart === null ? 60_000 : Math.max(0, 60_000 - (now - planStart));
  const left = limitMs - (now - writeStart);
  const rang = useRef(false);

  useEffect(() => {
    if (phase === "write" && left <= 60_000 && left > 0 && !rang.current) {
      rang.current = true;
      signal.ring();
    }
  }, [phase, left, signal]);

  const startPlan = () => {
    setPlanStart(Date.now());
    setPhase("plan");
  };
  const start = () => {
    const t = Date.now();
    setPlanMs(planStart === null ? 0 : t - planStart);
    setWriteStart(t);
    rang.current = false;
    setPhase("write");
    signal.prime();
    const a = draftAnswer(question, new Date(t), marks, words);
    answer.current = a;
    created.current = changeAnswer(a.id, { op: "create", answer: a });
    created.current.catch(() => undefined);
  };
  const done = async () => {
    const a = answer.current;
    if (!a || saving) return;
    const writeMs = Date.now() - writeStart;
    setSaving(true);
    setError("");
    try {
      await created.current?.catch(() => changeAnswer(a.id, { op: "create", answer: a }));
      await changeAnswer(a.id, {
        op: "draft",
        plan,
        times: { planMs, writeMs, overtimeMs: Math.max(0, writeMs - limitMs), limitMs },
        marks,
        words,
      });
      navigate(`/mains/write?answer=${a.id}`, { replace: true });
    } catch (e) {
      setError(`Couldn't save: ${e instanceof Error ? e.message : String(e)}. Your time is still running.`);
      setSaving(false);
    }
  };

  const marksControl = question.marksAssumed ? (
    <span className="seg" role="group" aria-label="Marks">
      {[10, 15].map((m) => (
        <button key={m} type="button" aria-pressed={marks === m} onClick={() => setMarks(m)}>
          {m} marks
        </button>
      ))}
    </span>
  ) : (
    <span className="chip">
      {fmtMarks(question.marks)} marks · {question.words} words
    </span>
  );
  const head = (
    <>
      <div className="mw-q-meta">
        <span className="chip mode">{questionLine(question)}</span>
        {suggestion.why === "retry" && suggestion.last?.marking && (
          <span className="chip retry">Retry: {fmtMarks(suggestion.last.marking.score)} last time</span>
        )}
        {marksControl}
      </div>
      <p className="mw-q-text">{question.text}</p>
      <QuestionFacts asksFor={question.asksFor} words={words} minutes={minutes} note={question.note} />
      {question.marksAssumed && (
        <p className="small muted">
          The register doesn't record this question's marks, so it is set as a {marks}-marker. Switch it if you know
          otherwise.
        </p>
      )}
    </>
  );

  const hall =
    phase === "write" &&
    createPortal(
      <div className="mw-hall" role="dialog" aria-modal="true" aria-label="Writing">
        <p className="q">{question.text}</p>
        <div className="mid">
          <span className={`big${left < 0 ? " over" : left <= 60_000 ? " last" : ""}`} role="timer">
            {clock(left)}
          </span>
          <span className={`note${left < 0 ? " over" : left <= 60_000 ? " last" : ""}`}>
            {left < 0 ? "Over time. Finish your sentence." : left <= 60_000 ? "One minute left" : "Writing"}
          </span>
          <span className="small">Pen on paper · {words} words</span>
        </div>
        {plan.length > 0 && (
          <div className="plan">
            {plan.map((p, i) => (
              <span key={i}>{p}</span>
            ))}
          </div>
        )}
        {error && (
          <p className="err" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="done" onClick={() => void done()} disabled={saving}>
          {saving ? "Saving…" : "I'm done"}
        </button>
      </div>,
      document.body,
    );

  if (wide)
    return (
      <article className="dash mw-page mw-desk mw-focus">
        {top}
        <div className="mw-desk-grid">
          <section className="mw-main" aria-label="The question">
            {head}
            <div className="mw-plan-row">
              <div className="mw-plan-box">
                <label className="mw-label gold" htmlFor="mw-plan">
                  1-minute plan · optional
                </label>
                <textarea
                  id="mw-plan"
                  value={planText}
                  onChange={(e) => setPlanText(e.target.value)}
                  placeholder="The 3–5 points you'll cover, one per line. Keywords are enough."
                />
              </div>
              <div className={`mw-timer ${phase}`}>
                <span className="mw-label">{phase === "plan" ? "Plan" : "Timer"}</span>
                <span className="t">{phase === "plan" ? clock(planLeft) : `${minutes}:00`}</span>
                {phase === "question" ? (
                  <>
                    <button type="button" className="board-btn" onClick={start}>
                      Start {minutes}:00
                    </button>
                    <button type="button" className="board-btn quiet small" onClick={startPlan}>
                      Plan for 1 minute first
                    </button>
                  </>
                ) : (
                  <button type="button" className="board-btn" onClick={start}>
                    Start writing
                  </button>
                )}
              </div>
            </div>
          </section>
          <aside className="mw-side">
            <section className="board-card mw-send" aria-label="Send your pages">
              <span className="mw-label">Send your pages</span>
              <span className="mw-qr placeholder" aria-hidden="true">
                <Icon name="camera" />
              </span>
              <span className="muted small">
                Start the timer and a code appears here when you finish. Scan it with your phone to photograph each
                page.
              </span>
            </section>
            {list}
          </aside>
        </div>
        {hall}
      </article>
    );

  return (
    <article className="dash mw-page mw-step mw-focus">
      <Steps at={phase === "write" ? 1 : 0} names={STEPS} />
      {phase === "plan" ? (
        <section className="mw-stage" aria-label="Your plan">
          <div className="mw-plan-head">
            <h1>Your plan</h1>
            <span className={`t${planLeft <= 10_000 ? " low" : ""}`}>{clock(planLeft)}</span>
          </div>
          <p className="muted">Jot the 3–5 points you'll cover. Keywords are enough.</p>
          <form
            className="mw-plan-add"
            onSubmit={(e) => {
              e.preventDefault();
              const d = draft.trim().slice(0, 200);
              if (d && points.length < 12) setPoints([...points, d]);
              setDraft("");
            }}
          >
            <input
              aria-label="Add a point"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. where the idea comes from"
              autoComplete="off"
            />
            <button type="submit" className="board-btn quiet">
              Add
            </button>
          </form>
          <ol className="mw-plan-list">
            {points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ol>
          <button type="button" className="board-btn wide" onClick={start}>
            Start the {minutes}-minute timer
          </button>
        </section>
      ) : (
        <section className="mw-stage" aria-label="The question">
          {top}
          {head}
          <div className="mw-actions">
            <button type="button" className="board-btn wide" onClick={startPlan}>
              Plan for 1 minute
            </button>
            <button type="button" className="board-btn quiet wide" onClick={start}>
              Skip the plan, start writing
            </button>
          </div>
          {list}
        </section>
      )}
      {hall}
    </article>
  );
}

// ---------- After writing: pages, your score, send ----------

function timeLine(a: MainsAnswer) {
  const t = a.times;
  if (!t.writeMs) return "No time was recorded for this one.";
  const over = Math.round(t.overtimeMs / 1000);
  return `You took ${clock(t.writeMs)}${over > 0 ? `, ${over} s over time. That's logged.` : ", inside the time."}`;
}

function Continue({ id }: { id: string }) {
  const mains = useMains();
  const wide = useWide();
  const answer = mains.answers.get(id);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    void refreshAnswer(id).then((a) => setMissing(!a));
  }, [id]);
  const poll = useCallback(() => refreshAnswer(id), [id]);
  usePoll(poll, 4000, answer?.status === "draft");
  const [step, setStep] = useState<"upload" | "score">("upload");
  const [self, setSelf] = useState<number | null>(null);
  const [missed, setMissed] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  if (!answer)
    return (
      <article className="dash mw-page">
        <p className="loading">
          {missing ? "There's no answer here. It may have been started on another account." : "Loading…"}
        </p>
      </article>
    );
  if (answer.status !== "draft") return <Sent answer={answer} wide={wide} />;

  const send = async () => {
    if (self === null) return;
    setSending(true);
    setError("");
    try {
      await changeAnswer(id, { op: "submit", selfScore: self, selfMissed: missed, at: new Date().toISOString() });
    } catch (e) {
      setError(`Couldn't send: ${e instanceof Error ? e.message : String(e)}`);
      setSending(false);
    }
  };
  const q = answer.question;
  const scoreBlock = (
    <>
      <ScoreButtons value={self} onPick={setSelf} />
      <p className="muted mw-q-sub">What do you think you missed?</p>
      <div className="mw-missed" role="group" aria-label="What you think you missed">
        {SELF_MISSED.map((m) => (
          <button
            key={m}
            type="button"
            className={`chip-btn${missed.includes(m) ? " on" : ""}`}
            aria-pressed={missed.includes(m)}
            onClick={() => setMissed(missed.includes(m) ? missed.filter((x) => x !== m) : [...missed, m])}
          >
            {m}
          </button>
        ))}
      </div>
      {error && (
        <p className="mw-error" role="alert">
          {error}
        </p>
      )}
    </>
  );

  if (wide) {
    const link = `${location.origin}/mains/write?answer=${id}`;
    return (
      <article className="dash mw-page mw-desk mw-focus">
        <div className="mw-desk-grid">
          <section className="mw-main" aria-label="The question">
            <div className="mw-q-meta">
              <span className="chip mode">{questionLine(q)}</span>
              <span className="chip">
                {fmtMarks(q.marks)} marks · {q.words} words
              </span>
            </div>
            <p className="mw-q-text">{q.text}</p>
            <div className="mw-plan-row">
              <div className="mw-plan-box">
                <span className="mw-label gold">Your plan</span>
                {answer.plan.length ? (
                  <div className="mw-plan-chips">
                    {answer.plan.map((p, i) => (
                      <span key={i} className="chip">
                        {p}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="muted">No plan this time.</span>
                )}
              </div>
              <div className="mw-timer done">
                <span className="mw-label">Done</span>
                <span className="t">{answer.times.writeMs ? clock(answer.times.writeMs) : "–"}</span>
                <span className="small muted">{timeLine(answer)}</span>
              </div>
            </div>
            {answer.pages.length ? (
              <section className="board-card mw-check" aria-label="Your pages">
                <h2>Your pages</h2>
                <div className="mw-page-row">
                  {answer.pages.map((p, i) => (
                    <Photo key={p.file} answerId={id} page={p} alt={`Your page ${i + 1}`} />
                  ))}
                </div>
                <h2>Your score first</h2>
                <p className="muted">
                  Out of 10, what do you think it's worth? You see the marks after Claude's next run.
                </p>
                {scoreBlock}
                <button
                  type="button"
                  className="board-btn"
                  disabled={self === null || sending}
                  onClick={() => void send()}
                >
                  {sending ? "Sending…" : "Send for marking"}
                </button>
              </section>
            ) : (
              <p className="muted mw-empty">
                Your pages show here once you send them from your phone, or add them on the right.
              </p>
            )}
          </section>
          <aside className="mw-side">
            <section className="board-card mw-send" aria-label="Send your pages">
              <span className="mw-label">Send your pages</span>
              <QrCode text={link} label="QR code: scan it with your phone to add page photos to this answer" />
              <b>Scan with your phone, then photograph each page</b>
              <span className="muted small">or add photos here</span>
              <PagesEditor answer={answer} />
              <span className="muted small">
                Up to 3 pages. Turn a sideways photo with ↻: straightening is a simple turn for now.
              </span>
            </section>
          </aside>
        </div>
      </article>
    );
  }

  return (
    <article className="dash mw-page mw-step mw-focus">
      <Steps at={step === "upload" ? 2 : 3} names={STEPS} />
      {step === "upload" ? (
        <section className="mw-stage" aria-label="Photograph your pages">
          <h1>Photograph your pages</h1>
          <p className="muted">{timeLine(answer)}</p>
          <PagesEditor answer={answer} big />
          <p className="small muted">
            Up to 3 pages. Turn a sideways photo with ↻: straightening is a simple turn for now. Pages you add here also
            show on your computer.
          </p>
          <button
            type="button"
            className="board-btn wide"
            disabled={!answer.pages.length}
            onClick={() => setStep("score")}
          >
            Next: your score
          </button>
        </section>
      ) : (
        <section className="mw-stage" aria-label="Your score first">
          <h1>Your score first</h1>
          <p className="muted">Out of 10, what do you think it's worth?</p>
          {scoreBlock}
          <div className="mw-actions">
            <button
              type="button"
              className="board-btn wide"
              disabled={self === null || sending}
              onClick={() => void send()}
            >
              {sending ? "Sending…" : "Send for marking"}
            </button>
            <button type="button" className="board-btn quiet wide" onClick={() => setStep("upload")}>
              Back to your pages
            </button>
          </div>
        </section>
      )}
    </article>
  );
}

function Sent({ answer, wide }: { answer: MainsAnswer; wide: boolean }) {
  const waiting = answer.status === "waiting";
  return (
    <article className={`dash mw-page${wide ? "" : " mw-step"}`}>
      {!wide && <Steps at={4} names={STEPS} />}
      <section className="board-card mw-waiting" aria-label={waiting ? "Waiting for marking" : "Marked"}>
        <span className="mw-label mode">{waiting ? "Waiting for marking" : "Marked"}</span>
        <h1>{waiting ? "Sent for marking" : `Marked: ${fmtMarks(answer.marking!.score)} / 10`}</h1>
        {waiting && (
          <p>
            Claude marks answers on its next scheduled run, in the morning or the evening. The checklist, comments on
            your page and a stronger outline then show on the answer's page.
          </p>
        )}
        <p className="muted">
          {answer.selfScore !== undefined && <>You said {fmtMarks(answer.selfScore)} · </>}
          {answer.pages.length} {answer.pages.length === 1 ? "page" : "pages"} · {timeLine(answer)}
        </p>
        <div className="mw-actions row">
          <Link className="board-btn" to={`/mains/answers/${answer.id}`}>
            Open the answer
          </Link>
          <Link className="board-btn quiet" to="/mains/write">
            Write another
          </Link>
        </div>
      </section>
    </article>
  );
}
