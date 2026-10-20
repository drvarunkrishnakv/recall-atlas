// One answer's page (the chosen design: Feedback 1 · Marked page). Your photo with the examiner's
// comments pinned to it in pen colours, the reading to check, the checklist out of 10 with
// "I disagree" on each item, what to fix first, a stronger outline that stays hidden until you
// ask, a rewrite of the weakest part, what your notes could have added, and your earlier attempts.
// Until Claude's next run has marked it, the page says it is waiting.
import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { Link } from "../components/nav";
import { changeAnswer, refreshAnswer, useMains, usePoll } from "../content/mains";
import {
  attemptsAt,
  calibration,
  clock,
  COMMENT_KINDS,
  compareAttempts,
  FIX_TAGS,
  fmtMarks,
  ITEM,
  KIND_LABEL,
  newId,
  ordinal,
  previousAttempt,
  tagTimes,
  wordCount,
  type ChecklistKey,
  type Dispute,
  type MainsAnswer,
  type Marking,
  type Rewrite,
  type RewritePrompt,
} from "../lib/mains";
import { fmtDate, NoteLink, Photo, questionLine, tone, useNow } from "./parts";
import { sendPhoto } from "./photos";
import "../prelims/prelims.css";
import "./mains.css";

export default function AnswerPage() {
  const { id = "" } = useParams();
  const mains = useMains();
  const answer = mains.answers.get(id);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    document.title = "Your answer · Mains Atlas";
    void refreshAnswer(id).then((a) => setMissing(!a));
  }, [id]);
  const poll = useCallback(() => refreshAnswer(id), [id]);
  const waiting =
    !!answer &&
    (answer.status === "waiting" ||
      answer.status === "disputed" ||
      answer.rewrites.some((r) => r.status === "waiting"));
  usePoll(poll, 60_000, waiting);

  if (mains.status !== "ready" || !answer)
    return (
      <article className="dash mw-page">
        <p className="loading">
          {mains.status === "error"
            ? `Couldn't load: ${mains.error}`
            : missing && mains.status === "ready"
              ? "There's no answer here."
              : "Loading…"}
        </p>
      </article>
    );

  const all = [...mains.answers.values()];
  const q = answer.question;
  const m = answer.marking;
  const prev = previousAttempt(answer, all);
  const sent = answer.submittedAt ?? answer.createdAt;
  const dayLine = new Date(sent).toDateString() === new Date().toDateString() ? "today" : fmtDate(sent, true);
  const words = answer.transcript ? wordCount(answer.transcript.corrected ?? answer.transcript.text) : null;
  const facts = [
    `Written ${dayLine}`,
    answer.times.writeMs ? `${clock(answer.times.writeMs)} min` : null,
    words !== null ? `${words} words` : null,
    `${answer.pages.length} ${answer.pages.length === 1 ? "page" : "pages"}`,
  ].filter(Boolean);
  const cal = m ? calibration(answer.selfScore, m.score) : null;

  return (
    <article className="dash mw-page mw-answer">
      <div className="mw-crumb">
        <Link to="/mains/feedback">← All feedback</Link>
        <span aria-hidden="true">/</span>
        <span>{facts.join(" · ")}</span>
      </div>
      <header className="mw-fb-head">
        <div className="q">
          <div className="mw-q-meta">
            <span className="chip mode">{questionLine(q)}</span>
            <span className="chip">
              {fmtMarks(q.marks)} marks · {q.words} words
            </span>
          </div>
          <h1 className="mw-q-text">{q.text}</h1>
        </div>
        {m && (
          <div className="mw-scorecard" role="group" aria-label="Score">
            <span className="big">
              {fmtMarks(m.score)}
              <span>/ 10</span>
            </span>
            <span className="lines">
              {cal && <span className={cal.close ? "up" : "down"}>{cal.label}</span>}
              {prev?.marking && (
                <span className={m.score >= prev.marking.score ? "up" : "down"}>
                  {m.score >= prev.marking.score ? "+" : "−"}
                  {fmtMarks(Math.abs(m.score - prev.marking.score))} since {fmtDate(prev.submittedAt!)} (
                  {fmtMarks(prev.marking.score)})
                </span>
              )}
            </span>
          </div>
        )}
      </header>

      {answer.status === "draft" ? (
        <section className="board-card mw-waiting" aria-label="Not sent yet">
          <span className="mw-label mode">Not sent yet</span>
          <h2>This answer hasn't been sent for marking</h2>
          <Link className="board-btn" to={`/mains/write?answer=${answer.id}`}>
            Add its pages and send it
          </Link>
        </section>
      ) : !m ? (
        <section className="board-card mw-waiting" aria-label="Waiting for marking">
          <span className="mw-label mode">Waiting for marking</span>
          <h2>Claude marks this on its next scheduled run</h2>
          <p>
            Runs happen in the morning and the evening. Your pages, your time and your own score are saved. The
            checklist, comments on your page and a stronger outline appear here after the run.
          </p>
          <p className="muted">
            {answer.selfScore !== undefined && <>You said {fmtMarks(answer.selfScore)} · </>}
            Sent {fmtDate(sent)} at {new Date(sent).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <div className="mw-page-row">
            {answer.pages.map((p, i) => (
              <Photo key={p.file} answerId={answer.id} page={p} alt={`Your page ${i + 1}`} />
            ))}
          </div>
        </section>
      ) : (
        <div className="mw-fb-grid">
          <div className="mw-fb-left">
            <MarkedPages answer={answer} marking={m} />
            <TranscriptCheck key={answer.transcript?.correctedAt ?? "t"} answer={answer} />
            <div className="mw-two">
              <FromNotes marking={m} />
              <Attempts answer={answer} all={all} prev={prev} />
            </div>
          </div>
          <aside className="mw-fb-right">
            <Checklist answer={answer} marking={m} />
            <FixFirst answer={answer} marking={m} all={all} />
            <Stronger answer={answer} marking={m} />
          </aside>
        </div>
      )}
    </article>
  );
}

// ---------- Your page, marked ----------

function MarkedPages({ answer, marking }: { answer: MainsAnswer; marking: Marking }) {
  const comments = [...marking.comments]
    .sort((a, b) => a.page - b.page || a.y - b.y)
    .map((c, i) => ({ ...c, n: i + 1 }));
  const [active, setActive] = useState<number | null>(comments[0]?.n ?? null);
  return (
    <section className="mw-marked" aria-label="Your page, marked">
      <div className="mw-legend">
        <h2>Your {answer.pages.length > 1 ? "pages" : "page"}, marked</h2>
        {COMMENT_KINDS.map((k) => (
          <span key={k} className={`mw-kind ${k}`}>
            <i aria-hidden="true" />
            {KIND_LABEL[k]} {comments.filter((c) => c.kind === k).length}
          </span>
        ))}
      </div>
      {answer.pages.map((p, i) => {
        const mine = comments.filter((c) => c.page === i + 1);
        return (
          <div key={p.file} className="mw-sheet-row">
            <div className="mw-sheet">
              <Photo answerId={answer.id} page={p} alt={`Your page ${i + 1}, marked`} />
              {mine.map((c) => (
                <Fragment key={c.n}>
                  {active === c.n && <span className="band" style={{ top: `${c.y * 100}%` }} />}
                  <button
                    type="button"
                    className={`pin ${c.kind}`}
                    style={{ top: `${c.y * 100}%` }}
                    aria-label={`Comment ${c.n}, ${KIND_LABEL[c.kind]}`}
                    aria-pressed={active === c.n}
                    onClick={() => setActive(c.n)}
                  >
                    {c.n}
                  </button>
                </Fragment>
              ))}
            </div>
            {mine.length > 0 && (
              <ol className="mw-comments" aria-label={`Comments on page ${i + 1}`}>
                {mine.map((c) => (
                  <li key={c.n}>
                    <button
                      type="button"
                      className={`mw-comment ${c.kind}`}
                      aria-pressed={active === c.n}
                      onClick={() => setActive(c.n)}
                    >
                      <span className="k">
                        {c.n} · {KIND_LABEL[c.kind]}
                      </span>
                      <span>{c.text}</span>
                      {c.note && <span className="from">From your note {c.note}</span>}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ---------- Check my reading ----------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The transcript with the words Claude wasn't sure of highlighted. */
function highlighted(text: string, unsure: string[]): ReactNode[] {
  const words = unsure.filter((w) => w.trim());
  if (!words.length) return [text];
  const re = new RegExp(`(${words.map(escape).join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} title="Not sure I read this right">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function TranscriptCheck({ answer }: { answer: MainsAnswer }) {
  const t = answer.transcript;
  const text = t ? (t.corrected ?? t.text) : "";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!t) return null;
  const dispute = answer.disputes.filter((d) => d.item === "transcript").at(-1);
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await changeAnswer(answer.id, {
        op: "transcript",
        text: value.trim(),
        at: new Date().toISOString(),
        disputeId: newId("t"),
      });
      setEditing(false);
    } catch (e) {
      setError(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="board-card mw-transcript" aria-label="Check my reading">
      <div className="head">
        <h2>Check my reading</h2>
        {t.unsure.length > 0 && (
          <span className="unsure">I wasn't sure about: {t.unsure.map((w) => `"${w}"`).join(", ")}</span>
        )}
      </div>
      <p className="muted small">Fix anything I misread, so a misread word doesn't cost you marks.</p>
      {editing ? (
        <>
          <textarea
            className="mw-handwriting"
            aria-label="Transcription of your answer"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={12}
          />
          <div className="mw-actions row">
            <button type="button" className="board-btn quiet small" onClick={() => (setEditing(false), setValue(text))}>
              Cancel
            </button>
            <button
              type="button"
              className="board-btn small"
              disabled={saving || !value.trim() || value.trim() === text}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save my corrections"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mw-handwriting">{highlighted(text, t.unsure)}</div>
          <button type="button" className="board-btn quiet small" onClick={() => setEditing(true)}>
            Correct the reading
          </button>
        </>
      )}
      {t.correctedAt && <p className="small muted">You corrected the reading on {fmtDate(t.correctedAt)}.</p>}
      {dispute && <DisputeNote d={dispute} />}
      {error && (
        <p className="mw-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

// ---------- Where the marks went ----------

function DisputeNote({ d }: { d: Dispute }) {
  if (d.status === "open")
    return (
      <div className="mw-reply open">
        <b>Waiting for Claude</b>
        {d.item === "transcript"
          ? "Claude checks on its next run whether your corrected reading changes any mark."
          : "Logged. Claude looks at your page again on its next run; the mark changes or stands with a reason."}
      </div>
    );
  return (
    <div className={`mw-reply ${d.status}`}>
      <b>
        {d.status === "changed"
          ? `Mark changed${d.changedItem ? `: ${ITEM[d.changedItem].label} ${fmtMarks(d.from ?? 0)} → ${fmtMarks(d.to ?? 0)}` : ""}`
          : "Mark stands"}
      </b>
      {d.reply}
    </div>
  );
}

function Checklist({ answer, marking }: { answer: MainsAnswer; marking: Marking }) {
  const [open, setOpen] = useState<ChecklistKey | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const count = (s: Dispute["status"]) => answer.disputes.filter((d) => d.status === s).length;
  const send = async (key: ChecklistKey) => {
    setSending(true);
    setError("");
    try {
      await changeAnswer(answer.id, {
        op: "dispute",
        dispute: { id: newId("d"), item: key, text: text.trim(), at: new Date().toISOString() },
      });
      setOpen(null);
      setText("");
    } catch (e) {
      setError(`Couldn't send: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSending(false);
    }
  };
  return (
    <section className="board-card mw-checklist" aria-label="Where the marks went">
      <div className="head">
        <h2>Where the marks went</h2>
        <b>{fmtMarks(marking.score)} / 10</b>
      </div>
      {marking.checklist.map((c) => {
        const { label, max } = ITEM[c.key];
        const ratio = c.got / max;
        const t = ratio >= 1 ? "hi" : ratio >= 0.5 ? "mid" : "lo";
        const d = answer.disputes.filter((x) => x.item === c.key).at(-1);
        return (
          <div key={c.key} className="mw-item" role="group" aria-label={label}>
            <div className="line">
              <b>{label}</b>
              <span className="bar" aria-hidden="true">
                <span className={t} style={{ width: `${Math.round(ratio * 100)}%` }} />
              </span>
              <b className={`v ${t}`}>
                {fmtMarks(c.got)} / {fmtMarks(max)}
              </b>
            </div>
            <div className="why">
              <span>{c.why}</span>
              {!d && c.got < max && open !== c.key && (
                <button type="button" className="link" onClick={() => (setOpen(c.key), setText(""))}>
                  I disagree
                </button>
              )}
            </div>
            {open === c.key && (
              <form
                className="mw-dispute"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) void send(c.key);
                }}
              >
                <label htmlFor={`why-${c.key}`}>Why do you disagree?</label>
                <textarea
                  id={`why-${c.key}`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Say why, in a line"
                  rows={2}
                />
                <div className="mw-actions row">
                  <button type="button" className="board-btn quiet small" onClick={() => setOpen(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="board-btn small" disabled={sending || !text.trim()}>
                    {sending ? "Sending…" : "Send to Claude"}
                  </button>
                </div>
                {error && (
                  <p className="mw-error" role="alert">
                    {error}
                  </p>
                )}
              </form>
            )}
            {d && <DisputeNote d={d} />}
          </div>
        );
      })}
      {answer.disputes.length > 0 && (
        <p className="log">
          Disputes: {count("changed")} changed, {count("kept")} kept
          {count("open") ? `, ${count("open")} waiting` : ""}
        </p>
      )}
    </section>
  );
}

// ---------- Fix first ----------

function FixFirst({ answer, marking, all }: { answer: MainsAnswer; marking: Marking; all: MainsAnswer[] }) {
  const fixes = [...marking.fix].sort((a, b) => b.gain - a.gain);
  return (
    <section className="board-card mw-fix" aria-label="Fix first">
      <h2>Fix first</h2>
      {fixes.length ? (
        <ol>
          {fixes.map((f, i) => (
            <li key={i}>
              <b className="gain">+{fmtMarks(f.gain)}</b>
              <span>
                <b>{ITEM[f.item].label}.</b> {f.text}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">Nothing to fix this time.</p>
      )}
      {marking.keep.length > 0 && (
        <p className="keep">
          <b>Keep:</b> {marking.keep.join(" ")}
        </p>
      )}
      {marking.tags.length > 0 && (
        <div className="tags">
          <span className="muted">Tagged</span>
          {marking.tags.map((t) => (
            <Link key={t.tag} className="chip" to={`/mains/feedback?tag=${t.tag}`}>
              {FIX_TAGS[t.tag].label} <span className="muted">· {ordinal(tagTimes(answer, t.tag, all))} time</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- A stronger answer, and the rewrite ----------

/** The weakest checklist item, when the marking names no part to rewrite. */
function weakest(m: Marking): RewritePrompt {
  const c = [...m.checklist].sort(
    (a, b) => a.got / ITEM[a.key].max - b.got / ITEM[b.key].max || ITEM[b.key].max - ITEM[a.key].max,
  )[0];
  return {
    item: c.key,
    part: ITEM[c.key].label,
    words: 40,
    minutes: 3,
    hint: "Make it carry its full share of the marks.",
  };
}

function Stronger({ answer, marking }: { answer: MainsAnswer; marking: Marking }) {
  const [shown, setShown] = useState(false);
  return (
    <section className="board-card mw-stronger" aria-label="A stronger answer">
      <h2>A stronger answer</h2>
      {!shown ? (
        <div className="think">
          <span className="muted">Think first: which headings would you use? Then look.</span>
          <button type="button" className="board-btn quiet" onClick={() => setShown(true)}>
            Show a stronger outline
          </button>
        </div>
      ) : (
        <ol className="mw-outline" aria-label="A stronger outline">
          {marking.outline.map((o, i) => (
            <li key={i}>
              <b>{o.h}.</b> {o.p}
            </li>
          ))}
        </ol>
      )}
      <RewriteBox answer={answer} marking={marking} />
    </section>
  );
}

function RewriteLog({ answer, r, score }: { answer: MainsAnswer; r: Rewrite; score: number }) {
  return (
    <div className={`mw-rw ${r.status}${r.better ? " better" : ""}`}>
      <Photo answerId={answer.id} page={r.page} alt={`Your rewrite of ${r.part}`} />
      <div>
        <b>
          {r.status === "waiting"
            ? `Rewrite of ${r.part.toLowerCase()}: waiting for marking`
            : r.better
              ? `Rewrite: ${r.part.toLowerCase()} now better`
              : `Rewrite: ${r.part.toLowerCase()}`}
        </b>
        <span>
          {r.verdict ?? "Claude marks only this part on its next run."} The answer's score stays {fmtMarks(score)}; the
          rewrite is logged beside it.
        </span>
      </div>
    </div>
  );
}

function RewriteBox({ answer, marking }: { answer: MainsAnswer; marking: Marking }) {
  const prompt = marking.rewrite ?? weakest(marking);
  const [stage, setStage] = useState<"idle" | "ready" | "running" | "sending">("idle");
  const [start, setStart] = useState(0);
  const [error, setError] = useState("");
  const now = useNow(stage === "running", 500);
  const left = prompt.minutes * 60_000 - (now - start);
  const send = async (file: File | undefined) => {
    if (!file) return;
    setStage("sending");
    setError("");
    try {
      const page = await sendPhoto(answer, file, "rewrite");
      await changeAnswer(answer.id, {
        op: "rewrite",
        rewrite: {
          id: newId("r"),
          at: new Date().toISOString(),
          item: prompt.item,
          part: prompt.part,
          page,
          ms: Math.min(Date.now() - start, 6 * 3_600_000),
        },
      });
      setStage("idle");
    } catch (e) {
      setError(`Couldn't send: ${e instanceof Error ? e.message : String(e)}`);
      setStage("running");
    }
  };
  return (
    <div className="mw-rewrite">
      {answer.rewrites.map((r) => (
        <RewriteLog key={r.id} answer={answer} r={r} score={marking.score} />
      ))}
      {stage === "idle" && answer.rewrites.length < 5 && (
        <button type="button" className="board-btn big" onClick={() => setStage("ready")}>
          Rewrite one part
          <span>
            {prompt.part} · about {prompt.words} words · {prompt.minutes} min
          </span>
        </button>
      )}
      {stage === "ready" && (
        <div className="ready">
          <span>
            Rewrite only your <b>{prompt.part.toLowerCase()}</b> on paper, in about {prompt.words} words. {prompt.hint}{" "}
            Only that part is marked.
          </span>
          <button type="button" className="board-btn" onClick={() => (setStart(Date.now()), setStage("running"))}>
            Start {prompt.minutes}:00
          </button>
        </div>
      )}
      {stage === "running" && (
        <div className="run">
          <span className={`t${left < 0 ? " over" : left <= 30_000 ? " last" : ""}`} role="timer">
            {clock(left)}
          </span>
          <label className="board-btn quiet">
            Add the photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              aria-label="Add the photo of your rewrite"
              onChange={(e) => void send(e.target.files?.[0])}
            />
          </label>
        </div>
      )}
      {stage === "sending" && (
        <p className="muted" role="status">
          Sending…
        </p>
      )}
      {error && (
        <p className="mw-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------- From your notes, and your attempts ----------

function FromNotes({ marking }: { marking: Marking }) {
  return (
    <section className="board-card mw-notes" aria-label="From your notes">
      <h3>From your notes, you could have used…</h3>
      {marking.fromNotes.length ? (
        marking.fromNotes.map((f, i) => (
          <div key={i} className="mw-fn">
            <NoteLink id={f.note} short />
            <span>
              {f.fact} <span className="for">→ {ITEM[f.item].label}</span>
            </span>
          </div>
        ))
      ) : (
        <p className="muted">Nothing this time: your notes don't cover more for this question yet.</p>
      )}
    </section>
  );
}

function Attempts({ answer, all, prev }: { answer: MainsAnswer; all: MainsAnswer[]; prev: MainsAnswer | null }) {
  // Up to four side by side, always with this one: the three before it, then any after.
  const every = attemptsAt(answer, all);
  const at = every.findIndex((x) => x.id === answer.id);
  const from = Math.max(0, at - 3);
  const list = every.slice(from, from + 4);
  const { fixed, repeated } = prev ? compareAttempts(prev, answer) : { fixed: [], repeated: [] };
  return (
    <section className="board-card mw-attempts" aria-label="Your attempts at this question">
      <h3>Your attempts at this question</h3>
      {list.length > 1 ? (
        <>
          <div className="mw-att-grid">
            {list.map((x) => (
              <Link
                key={x.id}
                to={`/mains/answers/${x.id}`}
                className={`mw-att${x.id === answer.id ? " on" : ""}`}
                aria-current={x.id === answer.id ? "page" : undefined}
              >
                {x.pages[0] ? (
                  <Photo
                    answerId={x.id}
                    page={x.pages[0]}
                    alt={`Your page from ${fmtDate(x.submittedAt ?? x.createdAt)}`}
                  />
                ) : (
                  <span className="mw-photo empty" />
                )}
                <span className="when">
                  {x.id === answer.id ? "This one" : fmtDate(x.submittedAt ?? x.createdAt, true)}
                </span>
                <b className={x.marking ? tone(x.marking.score) : ""}>{x.marking ? fmtMarks(x.marking.score) : "…"}</b>
              </Link>
            ))}
          </div>
          {prev && (fixed.length > 0 || repeated.length > 0) && (
            <div className="cmp">
              {fixed.length > 0 && (
                <span>
                  <b className="up">Better since {fmtDate(prev.submittedAt!)}:</b>{" "}
                  {fixed.map((f) => `${f.label}, ${fmtMarks(f.from)} → ${fmtMarks(f.to)}`).join("; ")}
                </span>
              )}
              {repeated.length > 0 && (
                <span>
                  <b className="down">Same gap both times:</b>{" "}
                  {repeated.map((r) => `${r.label} (${fmtMarks(r.got)} of ${fmtMarks(r.max)})`).join(", ")}
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        <p className="muted">
          Your first go at this question. Try it again in four weeks and both show here side by side.
        </p>
      )}
    </section>
  );
}
