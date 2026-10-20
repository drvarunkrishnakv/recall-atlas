// The Essay flows reached from the topic drawer: the 20-minute outline sprint (thesis, opening,
// seven one-line paragraphs tagged by angle, the other side, a closing; checked for angles,
// balance and a closing), the full essay (1 h 30) and the full paper (3 h, with a time plan).
// Writing itself happens on paper; the timers end with the Write flow's photo upload.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { changeWork, useMainsExtra, workOf } from "../content/mains-extra";
import {
  checkOutlineDraft,
  OTHER_SIDE,
  OUTLINE_PARAS,
  writeLink,
  type EssayOutline,
  type EssayTopic,
  type OutlineVerdict,
} from "../lib/mains-extra";
import { fmtClock, fmtDuration, newId, NoteLink, Ring, TryFirst, useClock, useTitle, Waiting } from "./parts";
import "../prelims/prelims.css";
import "./mains-extra.css";

const SPRINT_MS = 20 * 60 * 1000;
const ESSAY_MS = 90 * 60 * 1000;
const PAPER_MS = 180 * 60 * 1000;

function Crumb({ here }: { here: string }) {
  return (
    <nav className="mx-crumb" aria-label="Essay">
      <Link to="/mains/essay">← Essay</Link>
      <span>/</span>
      <span>{here}</span>
    </nav>
  );
}

function TopicCard({ topic, children }: { topic: EssayTopic; children?: ReactNode }) {
  return (
    <section className="mx-topic-card" aria-label="Topic">
      <div>
        <span className="mx-kicker tone-essay">
          {topic.year} · Section {topic.section} · {topic.theme}
        </span>
        <p className="mx-topic-text">{topic.text}</p>
      </div>
      {children}
    </section>
  );
}

type Draft = Pick<EssayOutline, "thesis" | "opening" | "paras" | "closing">;
const blank = (): Draft => ({
  thesis: "",
  opening: "",
  paras: Array.from({ length: OUTLINE_PARAS }, () => ({ angle: null, text: "" })),
  closing: "",
});
const hasText = (d: Draft) => !!(d.thesis || d.opening || d.closing || d.paras.some((p) => p.text));

export function EssaySprint() {
  const { id = "" } = useParams();
  const { status, error, data, saveError } = useMainsExtra();
  const [params, setParams] = useSearchParams();
  const outlineId = params.get("outline");
  const topic = data.essay.find((t) => t.id === id);
  useTitle("Outline sprint");
  const clock = useClock(`sprint-${id}`, SPRINT_MS);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [verdicts, setVerdicts] = useState<OutlineVerdict[] | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const w = workOf(data, "essay", id);
  const existing = w.outlines.find((o) => o.id === outlineId);

  // Open the outline named in the URL once the data is here; otherwise start a blank one with a
  // fresh clock (an outline in the URL keeps its clock across a reload).
  useEffect(() => {
    if (status !== "ready" || draft) return;
    setDraft(existing ? { ...existing, paras: existing.paras.map((p) => ({ ...p })) } : blank());
    if (!outlineId) clock.reset();
  }, [status, existing, draft, outlineId, clock]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (status !== "ready") return <Waiting status={status} error={error} what="the topic" />;
  if (!topic)
    return (
      <article className="dash wide mx-page">
        <Crumb here="Outline sprint" />
        <p className="mx-empty">No such topic.</p>
      </article>
    );
  const angles = topic.decode?.angles ?? [];
  const tags = [...angles.map((a) => a.k), OTHER_SIDE];
  const d = draft ?? blank();

  const save = (next: Draft) => {
    if (!hasText(next)) return;
    let oid = outlineId;
    if (!oid) {
      oid = newId("o");
      const p = new URLSearchParams(params);
      p.set("outline", oid);
      setParams(p, { replace: true });
    }
    changeWork("essay", topic.id, {
      op: "outline",
      outline: { ...next, id: oid, at: new Date().toISOString(), ms: Math.round(clock.elapsed) },
    });
  };
  const edit = (next: Draft) => {
    setDraft(next);
    setVerdicts(null);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save(next), 800);
  };
  const check = () => {
    window.clearTimeout(timer.current);
    save(d);
    setVerdicts(
      checkOutlineDraft(
        d,
        angles.map((a) => a.k),
      ).verdicts,
    );
  };
  const fresh = () => {
    window.clearTimeout(timer.current);
    setDraft(blank());
    setVerdicts(null);
    clock.reset();
    const p = new URLSearchParams(params);
    p.delete("outline");
    setParams(p, { replace: true });
  };
  const used = new Set(d.paras.filter((p) => p.angle && p.text.trim()).map((p) => p.angle!));
  const covered = angles.filter((a) => used.has(a.k)).length;
  const filled = d.paras.filter((p) => p.text.trim()).length;

  return (
    <article className="dash wide mx-page mx-essay mx-focus">
      <Crumb here="Outline sprint" />
      <TopicCard topic={topic}>
        <div className="mx-clock-col">
          <Ring left={clock.left} limit={SPRINT_MS} label="of 20:00" />
          <button
            type="button"
            className="board-btn small"
            onClick={clock.running ? clock.pause : clock.start}
            disabled={!w.tried}
          >
            {clock.running ? "Pause" : clock.started ? "Resume" : "Start"}
          </button>
        </div>
      </TopicCard>
      {saveError && <p className="mx-error">{saveError}</p>}

      {!w.tried ? (
        <TryFirst
          topic={topic}
          intro="Name the keywords and angles in a minute. Then the sprint opens with Claude's angles to tag."
        />
      ) : (
        <div className="mx-cols">
          <section className="mx-panel mx-outline" aria-label="Your outline">
            <div className="mx-field-grid">
              <label htmlFor="es-thesis" className="mx-label tone">
                Thesis
              </label>
              <input
                id="es-thesis"
                className="mx-input strong"
                value={d.thesis}
                placeholder="Your answer to the topic, in one line"
                onChange={(e) => edit({ ...d, thesis: e.target.value })}
              />
              <label htmlFor="es-opening" className="mx-label">
                Opening
              </label>
              <input
                id="es-opening"
                className="mx-input"
                value={d.opening}
                placeholder="A story, a scene or a question"
                onChange={(e) => edit({ ...d, opening: e.target.value })}
              />
            </div>
            <div className="mx-paras">
              <span className="mx-label">Body · one line per paragraph · tag its angle</span>
              {d.paras.map((p, i) => {
                const k = p.angle ? tags.indexOf(p.angle) : -1;
                const nextTag = k + 1 < tags.length ? tags[k + 1] : null;
                return (
                  <div key={i} className="mx-para">
                    <b className="mx-muted">{i + 1}</b>
                    <button
                      type="button"
                      className={`mx-tag${p.angle ? " on" : ""}`}
                      title="Change the angle"
                      aria-label={`Paragraph ${i + 1} angle: ${p.angle ?? "none"}. Change it`}
                      onClick={() =>
                        edit({ ...d, paras: d.paras.map((q, j) => (j === i ? { ...q, angle: nextTag } : q)) })
                      }
                    >
                      {p.angle ?? "Tag angle"}
                    </button>
                    <input
                      className="mx-input"
                      aria-label={`Paragraph ${i + 1}`}
                      value={p.text}
                      placeholder={
                        i === OUTLINE_PARAS - 1
                          ? "The other side, and your answer to it"
                          : "One line: the point of this paragraph"
                      }
                      onChange={(e) =>
                        edit({ ...d, paras: d.paras.map((q, j) => (j === i ? { ...q, text: e.target.value } : q)) })
                      }
                    />
                  </div>
                );
              })}
            </div>
            <div className="mx-field-grid">
              <label htmlFor="es-closing" className="mx-label">
                Closing
              </label>
              <input
                id="es-closing"
                className="mx-input"
                value={d.closing}
                placeholder="Return to the opening; end looking forward"
                onChange={(e) => edit({ ...d, closing: e.target.value })}
              />
            </div>
            <div className="mx-row-actions">
              <span className="mx-muted b">
                {filled} of {OUTLINE_PARAS} paragraphs · {covered} of {angles.length} angles
                {outlineId && existing
                  ? ` · saved ${new Date(existing.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </span>
              <span className="mx-gap" />
              {outlineId && (
                <button type="button" className="board-btn quiet small" onClick={fresh}>
                  New outline
                </button>
              )}
              <button type="button" className="board-btn" onClick={check} disabled={!hasText(d)}>
                Check my outline
              </button>
            </div>
            {verdicts && (
              <ul className="mx-verdicts" aria-label="Outline check">
                {verdicts.map((v) => (
                  <li key={v.text} className={v.mark}>
                    <b aria-hidden="true">{v.mark === "ok" ? "✓" : v.mark === "partly" ? "~" : "!"}</b>
                    {v.text}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="mx-side">
            <section className="mx-panel" aria-label="Angles">
              <div className="mx-panel-head">
                <h2>Angles</h2>
                <span className={covered >= Math.min(5, angles.length) ? "t-up b" : "t-gold b"}>
                  {covered} of {angles.length}
                </span>
              </div>
              {angles.length === 0 && (
                <p className="mx-muted">Claude hasn&apos;t written this topic&apos;s angles yet.</p>
              )}
              {angles.map((a) => (
                <div key={a.k} className="mx-angle">
                  <span className={`mx-tick${used.has(a.k) ? " on" : ""}`} aria-hidden="true">
                    {used.has(a.k) ? "✓" : ""}
                  </span>
                  <span>
                    <b>{a.k}</b>
                    <span className="mx-muted">{a.v}</span>
                  </span>
                </div>
              ))}
              <span className="mx-hint">
                Tap a paragraph&apos;s tag to change its angle. Keep one paragraph for the other side.
              </span>
            </section>
            {!!topic.decode?.notes.length && (
              <section className="mx-panel" aria-label="From your notes">
                <h2>Evidence from your notes</h2>
                {topic.decode.notes.map((n) => (
                  <NoteLink key={n.id} id={n.id} why={n.why} />
                ))}
              </section>
            )}
          </aside>
        </div>
      )}
    </article>
  );
}

// ---------- the timed sittings ----------

interface Segment {
  t: string;
  min: number;
  write?: boolean;
}

function PlanBar({ plan, elapsed, running }: { plan: Segment[]; elapsed: number; running: boolean }) {
  let acc = 0;
  return (
    <div className="mx-plan" role="list" aria-label="Time plan">
      {plan.map((p) => {
        const from = acc * 60_000;
        acc += p.min;
        const to = acc * 60_000;
        const now = running && elapsed >= from && elapsed < to;
        const past = elapsed >= to;
        return (
          <div
            key={p.t}
            role="listitem"
            className={`mx-seg${now ? " now" : ""}${past ? " past" : ""}${p.write ? " write" : ""}`}
            style={{ flexGrow: p.min }}
          >
            <b>{p.t}</b>
            <span>{p.min} min</span>
          </div>
        );
      })}
    </div>
  );
}

function Finished({ links, ms }: { links: { label: string; to: string }[]; ms: number }) {
  return (
    <div className="mx-done" role="status">
      <b>Logged: {fmtDuration(ms)}.</b>
      <span>Now photograph your pages. The Write flow reads and marks them.</span>
      <span className="mx-actions-row">
        {links.map((l) => (
          <Link key={l.to} className="board-btn" to={l.to}>
            {l.label}
          </Link>
        ))}
      </span>
    </div>
  );
}

const ESSAY_PLAN: Segment[] = [
  { t: "Plan", min: 20 },
  { t: "Write", min: 60, write: true },
  { t: "Read through", min: 10 },
];

export function FullEssay() {
  const { id = "" } = useParams();
  const { status, error, data } = useMainsExtra();
  const topic = data.essay.find((t) => t.id === id);
  useTitle("Full essay");
  const clock = useClock(`essay-${id}`, ESSAY_MS);
  const [done, setDone] = useState<number | null>(null);
  if (status !== "ready") return <Waiting status={status} error={error} what="the topic" />;
  if (!topic)
    return (
      <article className="dash wide mx-page">
        <Crumb here="Full essay" />
        <p className="mx-empty">No such topic.</p>
      </article>
    );
  const finish = () => {
    const ms = Math.round(clock.elapsed);
    changeWork("essay", topic.id, {
      op: "sitting",
      sitting: { id: newId("s"), kind: "essay", at: new Date().toISOString(), ms },
    });
    clock.reset();
    setDone(ms);
  };
  return (
    <article className="dash wide mx-page mx-essay mx-focus">
      <Crumb here="Full essay" />
      <TopicCard topic={topic} />
      <section className="mx-panel mx-sitting" aria-label="Your 90 minutes">
        <div className="mx-panel-head">
          <h2>Your 90 minutes</h2>
          <span className="mx-muted b">1,000–1,200 words on paper · notes and phone away</span>
          <span className={`mx-big-clock${clock.left < 0 ? " over" : ""}`} role="timer">
            {fmtClock(clock.left)}
          </span>
        </div>
        <PlanBar plan={ESSAY_PLAN} elapsed={clock.elapsed} running={clock.running} />
        {done !== null ? (
          <Finished ms={done} links={[{ label: "Send the photos", to: writeLink("essay", topic.id) }]} />
        ) : (
          <div className="mx-row-actions">
            <Link className="board-btn quiet" to={`/mains/essay/sprint/${topic.id}`}>
              Just an outline · 20 min
            </Link>
            <span className="mx-gap" />
            {clock.started && (
              <button type="button" className="board-btn quiet" onClick={finish}>
                I&apos;ve finished
              </button>
            )}
            <button type="button" className="board-btn" onClick={clock.running ? clock.pause : clock.start}>
              {clock.running ? "Pause" : clock.started ? "Resume" : "Start the 90 minutes"}
            </button>
          </div>
        )}
      </section>
    </article>
  );
}

const PAPER_PLAN: Segment[] = [
  { t: "Read and choose", min: 10 },
  { t: "Plan essay A", min: 20 },
  { t: "Write essay A", min: 60, write: true },
  { t: "Plan essay B", min: 20 },
  { t: "Write essay B", min: 60, write: true },
  { t: "Read through", min: 10 },
];
const READY = [
  ["pages", "16–20 ruled pages"],
  ["phone", "Phone ready for photos"],
  ["away", "Notes and phone away"],
] as const;

export function FullPaper() {
  const { status, error, data } = useMainsExtra();
  const [params, setParams] = useSearchParams();
  useTitle("Full essay paper");
  const years = useMemo(
    () =>
      [...new Set(data.essay.map((t) => t.year))]
        .filter((y) => ["A", "B"].every((s) => data.essay.some((t) => t.year === y && t.section === s)))
        .sort((a, b) => b - a),
    [data.essay],
  );
  const year = Number(params.get("year")) || years[0];
  const clock = useClock(`paper-${year}`, PAPER_MS);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState<number | null>(null);
  if (status !== "ready") return <Waiting status={status} error={error} what="the essay paper" />;
  const pick = { A: params.get("a"), B: params.get("b") };
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };
  const allReady = READY.every(([k]) => ready[k]);
  const canStart = !!pick.A && !!pick.B && allReady;
  const finish = () => {
    const ms = Math.round(clock.elapsed);
    const sitting = {
      id: newId("p"),
      kind: "paper" as const,
      at: new Date().toISOString(),
      ms,
      topics: [pick.A!, pick.B!],
    };
    for (const t of [pick.A!, pick.B!]) changeWork("essay", t, { op: "sitting", sitting });
    clock.reset();
    setDone(ms);
  };

  return (
    <article className="dash wide mx-page mx-essay mx-focus">
      <Crumb here="Full paper" />
      <header className="mx-head">
        <div>
          <span className="mx-kicker tone-essay">Essay · CSE {year ?? ""} paper</span>
          <h1>Choose one topic from each section</h1>
          <span className="mx-sub">250 marks · 3 hours · 1,000–1,200 words each · on paper, then photographed</span>
        </div>
        {years.length > 1 && (
          <div className="seg mx-stats" role="group" aria-label="Paper year">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={y === year}
                disabled={clock.running}
                onClick={() => {
                  const p = new URLSearchParams();
                  p.set("year", String(y));
                  setParams(p, { replace: true });
                }}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </header>
      {!years.length && <p className="mx-empty">No full paper is loaded yet.</p>}

      <div className="mx-sections">
        {(["A", "B"] as const).map((sec) => (
          <section key={sec} aria-label={`Section ${sec}`} className="mx-section">
            <div className="mx-section-head">
              <h2>Section {sec}</h2>
              <span className={pick[sec] ? "t-up b" : "mx-muted b"}>
                {pick[sec] ? `Chosen: topic ${data.essay.find((t) => t.id === pick[sec])?.n ?? ""}` : "Pick one"}
              </span>
            </div>
            <div role="radiogroup" aria-label={`Section ${sec} topics`} className="mx-pick-list">
              {data.essay
                .filter((t) => t.year === year && t.section === sec)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={pick[sec] === t.id}
                    className={`mx-pick${pick[sec] === t.id ? " on" : ""}`}
                    disabled={clock.running}
                    onClick={() => set(sec.toLowerCase(), t.id)}
                  >
                    <span className="mx-dot" aria-hidden="true" />
                    <span>
                      <b>{t.text}</b>
                      <span className="mx-small">
                        <span className="t-essay">{t.theme}</span>
                        {t.decode ? <span className="mx-muted"> · {t.decode.angles.length} angles</span> : null}
                        {t.decode?.notes.length ? (
                          <span className="t-mode"> · {t.decode.notes.length} from your notes</span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mx-panel mx-sitting" aria-label="Your three hours">
        <div className="mx-panel-head">
          <h2>Your three hours</h2>
          <span className="mx-muted b">Ten minutes to choose, twenty to plan each essay, an hour to write each</span>
          <span className={`mx-big-clock${clock.left < 0 ? " over" : ""}`} role="timer">
            {fmtClock(clock.left)}
          </span>
        </div>
        <PlanBar plan={PAPER_PLAN} elapsed={clock.elapsed} running={clock.running} />
        {done !== null ? (
          <Finished
            ms={done}
            links={[
              { label: "Photos of essay A", to: writeLink("essay", pick.A!) },
              { label: "Photos of essay B", to: writeLink("essay", pick.B!) },
            ]}
          />
        ) : (
          <div className="mx-row-actions">
            {!clock.started &&
              READY.map(([k, label]) => (
                <label key={k} className="mx-check">
                  <input
                    type="checkbox"
                    checked={!!ready[k]}
                    onChange={(e) => setReady({ ...ready, [k]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            <span className="mx-gap" />
            {!clock.started && (
              <Link className="board-btn quiet" to={pick.A ? `/mains/essay/sprint/${pick.A}` : "/mains/essay"}>
                Just an outline · 20 min
              </Link>
            )}
            {clock.started && (
              <button type="button" className="board-btn quiet" onClick={finish} disabled={!pick.A || !pick.B}>
                I&apos;ve finished
              </button>
            )}
            <button
              type="button"
              className="board-btn"
              disabled={!clock.started && !canStart}
              onClick={clock.running ? clock.pause : clock.start}
            >
              {clock.running
                ? "Pause"
                : clock.started
                  ? "Resume"
                  : canStart
                    ? "Start the 3 hours"
                    : !pick.A || !pick.B
                      ? "Pick one topic in each section"
                      : "Tick all three to start"}
            </button>
          </div>
        )}
      </section>
    </article>
  );
}
