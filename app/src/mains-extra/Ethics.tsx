// Ethics case studies (the chosen design: Ethics 1 · Case table + drawer). Practice cases Claude
// wrote, labelled as Claude's; real UPSC cases show as not loaded. "Solve step by step" opens the
// bench, in the order the answer is marked: stakeholders, issues and values, options (Do / Weak /
// Never), a clear lawful decision, a fix for the system, then the full answer (250 words, 11
// minutes). "Compare with mine" opens on each step only after your own attempt at it; it isn't a
// mark, since a case often has more than one defensible answer.
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { Link } from "../components/nav";
import { changeWork, useMainsExtra, workOf } from "../content/mains-extra";
import {
  ANSWER_MS,
  BENCH_STEPS,
  stepDone,
  VERDICT_LABEL,
  VERDICTS,
  wordCount,
  writeLink,
  type BenchAttempt,
  type EthicsCase,
  type MainsExtra,
} from "../lib/mains-extra";
import {
  dayLabel,
  Drawer,
  fmtClock,
  fmtDuration,
  newId,
  Stat,
  useClock,
  useSelection,
  useTitle,
  Waiting,
} from "./parts";
import "../prelims/prelims.css";
import "./mains-extra.css";

const MARKED_ON =
  "Stakeholders · the ethical issues · options weighed · a clear, lawful decision · values that justify it · a fix for the system";

export default function EthicsPage() {
  useTitle("Ethics case studies");
  const { status, error, data, saveError } = useMainsExtra();
  const [sel, select] = useSelection("case");
  if (status !== "ready") return <Waiting status={status} error={error} what="the cases" />;
  const practice = data.ethics.filter((c) => c.by === "claude");
  const upsc = data.ethics.filter((c) => c.by === "upsc");
  const attempted = data.ethics.filter((c) => workOf(data, "ethics", c.id).attempts.length).length;
  const current = data.ethics.find((c) => c.id === sel);
  const row = (c: EthicsCase) => {
    const n = workOf(data, "ethics", c.id).attempts.length;
    return (
      <div key={c.id} className={`mx-row${c.id === sel ? " on" : ""}`} onClick={() => select(c.id)} data-id={c.id}>
        <b className="mx-muted">{c.n}</b>
        <span className="mx-main">
          <button type="button" className="mx-row-open" onClick={(e) => (e.stopPropagation(), select(c.id))}>
            {c.title}
          </button>
          <span className="mx-small mx-muted b">
            You are: {c.you} · {c.clash}
          </span>
        </span>
        <span className="mx-c-opt mx-small b">{c.setting}</span>
        <span className="mx-c-wide mx-chips">
          {c.values.map((v) => (
            <span key={v} className="mx-chip tone">
              {v}
            </span>
          ))}
        </span>
        <span className={n ? "mx-small b" : "mx-muted"}>{n || "—"}</span>
      </div>
    );
  };

  return (
    <article className="dash wide mx-page mx-ethics">
      <header className="mx-head">
        <div>
          <h1>Ethics case studies</h1>
          <span className="mx-sub">GS4 Section B · each case 20 marks, about 250 words</span>
        </div>
        <div className="mx-stats">
          <Stat n={attempted}>cases attempted</Stat>
        </div>
      </header>
      {saveError && <p className="mx-error">{saveError}</p>}

      <div className={`mx-split${current ? " has-drawer" : ""}`}>
        <section className="mx-table cols-ethics" aria-label="Cases">
          <div className="mx-thead" aria-hidden="true">
            <span>#</span>
            <span>Case</span>
            <span className="mx-c-opt">Setting</span>
            <span className="mx-c-wide">Values in tension</span>
            <span>Attempts</span>
          </div>
          <div className="mx-group tone">Practice cases · written by Claude</div>
          {practice.length === 0 && <p className="mx-empty">No practice cases are loaded yet.</p>}
          {practice.map(row)}
          {upsc.length > 0 && <div className="mx-group">UPSC cases</div>}
          {upsc.map(row)}
          {upsc.length === 0 && (
            <div className="mx-foot">
              <span className="mx-small">
                <b>UPSC case studies 2013–2025 aren&apos;t loaded yet.</b>{" "}
                <span className="mx-muted">The GS4 PYQs in your register are theory questions only.</span>
              </span>
            </div>
          )}
        </section>
        {current && <CaseDrawer c={current} data={data} onClose={() => select(null)} />}
      </div>
    </article>
  );
}

function CaseDrawer({ c, data, onClose }: { c: EthicsCase; data: MainsExtra; onClose: () => void }) {
  const attempts = workOf(data, "ethics", c.id).attempts;
  const benchReady = !!c.text && !!c.key;
  return (
    <Drawer
      label="Case"
      tone="eth"
      onClose={onClose}
      kicker={
        c.by === "claude"
          ? `Practice case ${c.n} · ${c.setting} · written by Claude`
          : `UPSC ${c.year ?? ""} · ${c.setting}`
      }
      title={c.title}
      sub={`You are: ${c.you}`}
    >
      {c.text ? (
        <div className="mx-case-box">
          {c.text.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {c.asks && (
            <ol className="mx-asks">
              {c.asks.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <div className="mx-gate left">
          <span>
            <b>The brief:</b> {c.clash}.
          </span>
          <span className="mx-muted">
            Claude writes the full case on a later run, about 200 words, and checks any law or rule it cites before you
            see it.
          </span>
        </div>
      )}
      <div className="mx-block">
        <span className="mx-label">Values in tension</span>
        <span className="mx-chips">
          {c.values.map((v) => (
            <span key={v} className="mx-chip tone">
              {v}
            </span>
          ))}
        </span>
      </div>
      <div className="mx-block">
        <span className="mx-label">How it&apos;s marked</span>
        <span className="mx-muted mx-small">{MARKED_ON}</span>
      </div>
      {c.laws.length > 0 && (
        <div className="mx-block">
          <span className="mx-label">Laws it cites · checked</span>
          {c.laws.map((l) => (
            <a key={l.cite} className="mx-src" href={l.source.url} target="_blank" rel="noopener noreferrer">
              {l.cite} · {l.source.label} ↗
            </a>
          ))}
        </div>
      )}
      {attempts.length > 0 && (
        <div className="mx-block">
          <span className="mx-label">Your attempts</span>
          {[...attempts].reverse().map((a) => (
            <span key={a.id} className="mx-small">
              <b>{dayLabel(a.updated)}</b> ·{" "}
              {[1, 2, 3, 4, 5].filter((s) => stepDone(s, a, c.key?.options.length ?? 0)).length} of 5 steps
              {a.answer ? ` · answer ${wordCount(a.answer)} words` : ""}
            </span>
          ))}
        </div>
      )}
      <div className="mx-actions two">
        {benchReady ? (
          <Link className="board-btn big" to={`/mains/ethics/bench/${c.id}`}>
            Solve step by step<span>about 5 min</span>
          </Link>
        ) : (
          <button type="button" className="board-btn big" disabled>
            Solve step by step<span>once the case is written</span>
          </button>
        )}
        <Link className="board-btn big quiet" to={writeLink("ethics", c.id)}>
          Full answer<span>250 words · 11 min</span>
        </Link>
      </div>
    </Drawer>
  );
}

// ---------- the bench ----------

const HINTS = [
  "Who is affected, including those not in the room",
  "Which values pull against each other",
  "Weigh every option, including the tempting one",
  "What you will do first, what goes on record, and why it is lawful",
  "One change so this doesn't happen again",
  "11 minutes, about 250 words",
];

const blankAttempt = (options: number): BenchAttempt => {
  const now = new Date().toISOString();
  return {
    id: newId("a"),
    at: now,
    updated: now,
    stakeholders: [],
    own: [],
    issues: [],
    verdicts: Array.from({ length: options }, () => null),
    decision: "",
    system: "",
    answer: "",
  };
};

export function EthicsBench() {
  const { id = "" } = useParams();
  const { status, error, data, saveError } = useMainsExtra();
  const c = data.ethics.find((x) => x.id === id);
  useTitle(c ? c.title : "Ethics bench");
  const [step, setStep] = useState(1);
  const [shown, setShown] = useState<Record<number, boolean>>({});
  const [attempt, setAttempt] = useState<BenchAttempt | null>(null);
  const [own, setOwn] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const clock = useClock(`ethics-${id}`, ANSWER_MS);
  const attempts = workOf(data, "ethics", id).attempts;
  const latest = attempts.at(-1);

  // Carry on with your latest attempt, or start one.
  useEffect(() => {
    if (status !== "ready" || attempt || !c?.key) return;
    setAttempt(latest ? { ...latest, verdicts: [...latest.verdicts] } : blankAttempt(c.key.options.length));
  }, [status, attempt, c, latest]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (status !== "ready" || (c?.text && c.key && !attempt))
    return <Waiting status={status} error={error} what="the case" />;
  if (!c || !c.text || !c.key || !attempt)
    return (
      <article className="dash wide mx-page">
        <nav className="mx-crumb">
          <Link to="/mains/ethics">← Ethics case studies</Link>
        </nav>
        <p className="mx-empty">{c ? "This case isn't written in full yet." : "No such case."}</p>
      </article>
    );
  const key = c.key;
  const a = attempt;
  const save = (next: BenchAttempt, now = false) => {
    window.clearTimeout(timer.current);
    const go = () =>
      changeWork("ethics", c.id, { op: "attempt", attempt: { ...next, updated: new Date().toISOString() } });
    if (now) go();
    else timer.current = window.setTimeout(go, 700);
  };
  const edit = (next: BenchAttempt, now = false) => {
    setAttempt(next);
    save(next, now);
  };
  const done = (s: number) => stepDone(s, a, key.options.length);
  const isShown = !!shown[step] && done(step);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const fresh = () => {
    window.clearTimeout(timer.current);
    setAttempt(blankAttempt(key.options.length));
    setShown({});
    setStep(1);
    clock.reset();
  };
  const finishAnswer = () => {
    clock.pause();
    edit({ ...a, answerMs: Math.round(clock.elapsed) }, true);
  };

  return (
    <article className="dash wide mx-page mx-ethics mx-focus">
      <nav className="mx-crumb" aria-label="Ethics">
        <Link to="/mains/ethics">← Ethics case studies</Link>
        <span>/</span>
        <span className="t-eth">
          {c.by === "claude" ? `Practice case ${c.n}, written by Claude` : `UPSC ${c.year ?? ""}`}
        </span>
        <span className="mx-gap" />
        {attempts.length > 0 && (
          <button type="button" className="mx-pill" onClick={fresh}>
            Start a fresh attempt
          </button>
        )}
      </nav>
      {saveError && <p className="mx-error">{saveError}</p>}
      <div className="mx-bench">
        <article className="mx-panel mx-case" aria-label="The case">
          <span className="mx-kicker tone-eth">
            {c.setting} · You are the {c.you}
          </span>
          <h1>{c.title}</h1>
          {c.text.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {c.asks && (
            <ol className="mx-asks">
              {c.asks.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ol>
          )}
        </article>

        <section className="mx-solve" aria-label="Solve it">
          <nav className="mx-steps" aria-label="Steps">
            {BENCH_STEPS.map((t, i) => {
              const s = i + 1;
              const ok = s < 6 ? done(s) : !!a.answer || !!a.answerMs;
              return (
                <button
                  key={t}
                  type="button"
                  aria-current={s === step ? "step" : undefined}
                  className={`mx-step${s === step ? " now" : ""}${ok ? " ok" : ""}`}
                  onClick={() => setStep(s)}
                >
                  <span className="mx-step-dot">{ok ? "✓" : s}</span>
                  <span>{t}</span>
                </button>
              );
            })}
          </nav>

          <div className="mx-panel mx-step-panel">
            <div className="mx-panel-head">
              <h2>
                {step}. {BENCH_STEPS[step - 1]}
              </h2>
              <span className="mx-muted b">{HINTS[step - 1]}</span>
            </div>

            {step === 1 && (
              <>
                <div className="mx-chips big">
                  {key.stakeholders.map((k) => {
                    const on = a.stakeholders.includes(k.t);
                    const note = isShown ? (k.key ? (on ? "✓" : "missed") : on ? "" : "") : "";
                    return (
                      <button
                        key={k.t}
                        type="button"
                        aria-pressed={on}
                        className={`mx-toggle${on ? " on" : ""}`}
                        onClick={() => edit({ ...a, stakeholders: toggle(a.stakeholders, k.t) })}
                      >
                        {k.t}
                        {note && <b className={note === "missed" ? "t-down" : "t-up"}> {note}</b>}
                      </button>
                    );
                  })}
                  {a.own.map((o) => (
                    <button
                      key={o}
                      type="button"
                      aria-pressed
                      className="mx-toggle on own"
                      title="Remove"
                      onClick={() => edit({ ...a, own: a.own.filter((x) => x !== o) })}
                    >
                      {o} ×
                    </button>
                  ))}
                </div>
                <form
                  className="mx-inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = own.trim();
                    if (t && !a.own.includes(t)) edit({ ...a, own: [...a.own, t] });
                    setOwn("");
                  }}
                >
                  <input
                    className="mx-input"
                    aria-label="Add a stakeholder of your own"
                    placeholder="Add one of your own"
                    value={own}
                    onChange={(e) => setOwn(e.target.value)}
                  />
                  <button type="submit" className="board-btn quiet small" disabled={!own.trim()}>
                    Add
                  </button>
                </form>
              </>
            )}

            {step === 2 && (
              <div className="mx-list">
                {key.issues.map((x) => {
                  const on = a.issues.includes(x.k);
                  const note = isShown
                    ? x.central
                      ? on
                        ? "central ✓"
                        : "central · missed"
                      : on
                        ? "supporting"
                        : ""
                    : "";
                  return (
                    <button
                      key={x.k}
                      type="button"
                      aria-pressed={on}
                      className={`mx-issue${on ? " on" : ""}`}
                      onClick={() => edit({ ...a, issues: toggle(a.issues, x.k) })}
                    >
                      <span className="mx-box" aria-hidden="true">
                        {on ? "✓" : ""}
                      </span>
                      <span>
                        <b>{x.k}</b> <span className="mx-muted">· {x.v}</span>
                      </span>
                      {note && <b className={note.includes("missed") ? "t-down" : "t-up"}>{note}</b>}
                    </button>
                  );
                })}
              </div>
            )}

            {step === 3 && (
              <div className="mx-list">
                {key.options.map((o, i) => {
                  const yours = a.verdicts[i] ?? null;
                  const same = yours === o.verdict;
                  return (
                    <div key={o.t} className={`mx-option${isShown && yours ? (same ? " same" : " differ") : ""}`}>
                      <div className="mx-option-top">
                        <span>
                          <b>{o.t}</b>
                          <span className="mx-small">
                            <b className="t-up">For:</b> {o.pro} · <b className="t-down">Against:</b> {o.con}
                          </span>
                        </span>
                        <span className="mx-verdicts-pick" role="group" aria-label={`Your verdict on option ${i + 1}`}>
                          {VERDICTS.map((v) => (
                            <button
                              key={v}
                              type="button"
                              aria-pressed={yours === v}
                              className={`mx-verdict v-${v}${yours === v ? " on" : ""}`}
                              onClick={() =>
                                edit({
                                  ...a,
                                  verdicts: key.options.map((_, j) => (j === i ? v : (a.verdicts[j] ?? null))),
                                })
                              }
                            >
                              {VERDICT_LABEL[v]}
                            </button>
                          ))}
                        </span>
                      </div>
                      {isShown && (
                        <span className={`mx-small b ${same ? "t-up" : "t-down"}`}>
                          Claude: {VERDICT_LABEL[o.verdict]}
                          {yours ? (same ? " · same as yours" : ` · yours: ${VERDICT_LABEL[yours]}`) : ""}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {(step === 4 || step === 5) && (
              <div className="mx-list">
                <label htmlFor={`bench-${step}`} className="mx-sr">
                  {step === 4 ? "Your decision" : "Your fix for the system"}
                </label>
                <textarea
                  id={`bench-${step}`}
                  className="mx-input"
                  rows={5}
                  value={step === 4 ? a.decision : a.system}
                  placeholder={
                    step === 4
                      ? "What you will do first, what you will put on record, and why it is lawful"
                      : "One change to the system so this doesn't happen again"
                  }
                  onChange={(e) =>
                    edit(step === 4 ? { ...a, decision: e.target.value } : { ...a, system: e.target.value })
                  }
                />
                {isShown && (
                  <div className="mx-claude-box">
                    <b className="t-eth">{step === 4 ? "What Claude would do:" : "Claude's fix:"}</b>{" "}
                    {step === 4 ? key.decision : key.system}
                  </div>
                )}
              </div>
            )}

            {step === 6 && (
              <div className="mx-write">
                <span
                  className={`mx-big-clock${clock.left < 0 ? " over" : clock.left <= 60_000 ? " low" : ""}`}
                  role="timer"
                >
                  {fmtClock(clock.left)}
                </span>
                <span className="mx-muted b">About 250 words, using your notes from steps 1–5</span>
                <label htmlFor="bench-answer" className="mx-sr">
                  Your answer
                </label>
                <textarea
                  id="bench-answer"
                  className="mx-input"
                  rows={9}
                  value={a.answer}
                  placeholder="Type it here, or write it on paper and send the photo"
                  onChange={(e) => edit({ ...a, answer: e.target.value })}
                />
                <div className="mx-row-actions">
                  <span className="mx-muted b">
                    {wordCount(a.answer)} of 250 words
                    {a.answerMs ? ` · took ${fmtDuration(a.answerMs)}` : ""}
                  </span>
                  <span className="mx-gap" />
                  {clock.started && (
                    <button type="button" className="board-btn quiet small" onClick={finishAnswer}>
                      Done
                    </button>
                  )}
                  <button type="button" className="board-btn small" onClick={clock.running ? clock.pause : clock.start}>
                    {clock.running ? "Pause" : clock.started ? "Resume" : "Start 11:00"}
                  </button>
                  <Link className="board-btn quiet small" to={writeLink("ethics", c.id)}>
                    On paper? Send the photo
                  </Link>
                </div>
              </div>
            )}

            <div className="mx-step-foot">
              {step < 6 && (
                <button
                  type="button"
                  className="mx-ghost tone-eth"
                  disabled={!done(step)}
                  aria-pressed={isShown}
                  onClick={() => setShown({ ...shown, [step]: !shown[step] })}
                  title={done(step) ? undefined : "Do this step yourself first"}
                >
                  {isShown ? "Hide mine" : done(step) ? "Compare with mine" : "Compare with mine · after your attempt"}
                </button>
              )}
              <span className="mx-gap" />
              <button
                type="button"
                className="board-btn quiet small"
                disabled={step === 1}
                onClick={() => setStep(step - 1)}
              >
                Back
              </button>
              <button type="button" className="board-btn small" disabled={step === 6} onClick={() => setStep(step + 1)}>
                Next
              </button>
            </div>
            {isShown && (
              <p className="mx-hint">
                There is often more than one defensible answer. This is Claude&apos;s, to compare with yours, not a
                mark.
              </p>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
