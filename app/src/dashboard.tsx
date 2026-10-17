// Home, the subject database (table / board / due), Revise today and the Claude inbox.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  COMING_SUBJECTS,
  PAPERS,
  subjectStyle,
  type Paper,
  type PlannedNote,
  type Subject,
  type Topic,
} from "./content/syllabus";
import { createPage, getPage, savePage, STATUS_LABEL, useContent, type Page } from "./content/store";
import {
  addCapture,
  claudeState,
  commentCounts,
  deleteCapture,
  markRevised,
  setConfidence,
  undoRevised,
  useStudy,
} from "./content/study";
import { dueLabel, isDue, nextDue, today, type Confidence, type NoteProgress } from "./lib/progress";
import type { Block } from "./lib/blocks";
import { grokBot } from "./lib/personas";
import type { StoredThread } from "./lib/threads";
import { Icon } from "./components/Icon";

function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Mains Atlas` : "Mains Atlas";
  }, [title]);
}

// ---------- shared cells ----------

const STATUS_TONE: Record<string, string> = { draft: "draft", "in-review": "review", live: "live" };

export function StatusPill({ status }: { status: string }) {
  return <span className={`chip ${STATUS_TONE[status] ?? ""}`}>{STATUS_LABEL[status] ?? status}</span>;
}

const CONF_LABEL: Record<Confidence, string> = { weak: "Weak", ok: "OK", strong: "Strong" };

export function ConfidenceSelect({ noteId, value }: { noteId: string; value?: Confidence }) {
  return (
    <select
      className={`chip select conf-${value ?? "none"}`}
      aria-label="Confidence"
      value={value ?? ""}
      onChange={(e) => void setConfidence(noteId, (e.target.value || null) as Confidence | null)}
    >
      <option value="">Rate</option>
      <option value="weak">Weak</option>
      <option value="ok">OK</option>
      <option value="strong">Strong</option>
    </select>
  );
}

export function RevisionCell({ p }: { p?: NoteProgress }) {
  if (!p?.readAt) return <span className="faint">Not read yet</span>;
  const due = nextDue(p)!;
  const late = due <= today();
  const n = p.revisions.length;
  return (
    <span className="revision">
      <span className="dots" aria-label={`Revised ${n} times`}>
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i < n ? "on" : ""} />
        ))}
      </span>
      <span className={late ? "due-now" : ""}>Due {dueLabel(due)}</span>
    </span>
  );
}

export function ClaudeChip({ threads }: { threads?: StoredThread[] }) {
  const { waiting, replied } = claudeState(threads);
  if (replied) return <span className="chip claude">{replied === 1 ? "1 reply" : `${replied} replies`}</span>;
  if (waiting) return <span className="chip claude-soft">{waiting} waiting</span>;
  return <span className="faint">—</span>;
}

function CommentsCell({ threads }: { threads?: StoredThread[] }) {
  const { open, sticky, flags } = commentCounts(threads);
  const parts = [open && `${open} open`, sticky && `${sticky} sticky`, flags && `${flags} ⚑`].filter(Boolean);
  if (!parts.length) return <span className="faint">—</span>;
  return <span>{parts.join(" · ")}</span>;
}

// Section order from docs/CONTENT_CONVENTIONS.md, for a note started in the app.
const NOTE_SECTIONS = [
  "State of play",
  "Core",
  "How it works",
  "Dimensions",
  "Evidence bank",
  "Prelims box",
  "PYQ trail and linkages",
  "Sources and open checks",
];
const noteTemplate = (): Block[] => [
  {
    type: "paragraph",
    content: [{ type: "text", text: "Lead: the current position in one or two sentences.", styles: { italic: true } }],
  },
  ...NOTE_SECTIONS.flatMap((h): Block[] =>
    h === "Prelims box"
      ? [
          { type: "heading", props: { level: 2 }, content: h },
          { type: "callout", props: { tone: "prelims" }, content: [] },
        ]
      : [
          { type: "heading", props: { level: 2 }, content: h },
          { type: "paragraph", content: [] },
        ],
  ),
];

export function StartNote({
  paper,
  subject,
  topic,
  note,
}: {
  paper: Paper;
  subject: Subject;
  topic: Topic;
  note: PlannedNote;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="chip start"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await createPage({
          collection: "notes",
          id: note.id,
          title: note.title,
          paper: paper.id.toUpperCase(),
          subject: subject.id,
          topic: topic.id,
          status: "draft",
          pyqs: note.pyqs,
          blocks: noteTemplate(),
        });
        navigate(`/notes/${note.id}`);
      }}
    >
      Start this note
    </button>
  );
}

async function setStatus(page: Page, status: string) {
  await savePage({ ...page, status }, page.blocks);
}

/** Every planned note in a subject, with its page, progress and threads. */
function useRows(subject: Subject) {
  const { pages } = useContent();
  const { progress, threads } = useStudy();
  return subject.topics.map((topic) => ({
    topic,
    notes: topic.notes.map((note) => ({
      note,
      page: pages.get(`notes:${note.id}`),
      p: progress.notes[note.id],
      threads: threads[`notes:${note.id}`],
    })),
  }));
}

function SubjectShapes({ id }: { id: string }) {
  const st = subjectStyle(id);
  return (
    <>
      <span className="shape a" style={{ background: st.shape }} />
      <span className="shape b" style={{ background: st.ink }} />
    </>
  );
}

// ---------- Home ----------

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function HomePage() {
  useTitle("");
  const { pages } = useContent();
  const { progress, threads, captures, recent } = useStudy();
  const notes = [...pages.values()].filter((p) => p.collection === "notes");
  const due = notes
    .filter((n) => isDue(progress.notes[n.id]))
    .sort((a, b) => nextDue(progress.notes[a.id])!.localeCompare(nextDue(progress.notes[b.id])!));
  const continueList = [...recent.map((id) => pages.get(`notes:${id}`)).filter(Boolean), ...notes]
    .filter((p, i, all) => all.indexOf(p) === i)
    .slice(0, 3) as Page[];
  const replies = Object.entries(threads).flatMap(([key, ts]) =>
    ts
      .filter((t) => t.kind === "claude" && !t.resolved && t.comments.at(-1)?.userId === "claude")
      .map((t) => ({ key, t })),
  );
  const filed = captures.filter((c) => c.status === "done");
  const fromClaude = replies.length + filed.length;

  return (
    <article className="dash">
      <header className="dash-head">
        <div>
          <div className="eyebrow">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1>{greeting()}</h1>
        </div>
        <div className="head-chips">
          <Link className="chip go big" to="/revise">
            {due.length === 1 ? "1 note to revise" : `${due.length} notes to revise`}
          </Link>
          <Link className="chip claude big" to="/inbox">
            {fromClaude} from Claude
          </Link>
        </div>
      </header>

      <section aria-labelledby="subjects-h">
        <h2 id="subjects-h" className="sec-h">
          Subjects
        </h2>
        <div className="subject-grid">
          {PAPERS.flatMap((paper) =>
            paper.subjects.map((s) => {
              const planned = s.topics.flatMap((t) => t.notes);
              const written = planned.filter((n) => pages.has(`notes:${n.id}`)).length;
              const st = subjectStyle(s.id);
              return (
                <Link key={s.id} className="subject-card" to={`/${paper.id}/${s.id}`}>
                  <span className="art" style={{ background: st.color }}>
                    <SubjectShapes id={s.id} />
                    <span className="paper-tag" style={{ color: st.ink }}>
                      {paper.title.replace("GS Paper ", "GS")}
                    </span>
                  </span>
                  <span className="body">
                    <b>{s.title}</b>
                    <span className="muted">
                      {written} of {planned.length} notes written
                    </span>
                    <span className="bar" style={{ background: st.tint }}>
                      <span
                        style={{ width: `${Math.max(4, (written / planned.length) * 100)}%`, background: st.color }}
                      />
                    </span>
                  </span>
                </Link>
              );
            }),
          )}
          {COMING_SUBJECTS.slice(0, 3).map((s) => {
            const st = subjectStyle(s.title);
            return (
              <div key={s.title} className="subject-card off">
                <span className="art" style={{ background: st.color }}>
                  <SubjectShapes id={s.title} />
                  <span className="paper-tag" style={{ color: st.ink }}>
                    {s.paper}
                  </span>
                </span>
                <span className="body">
                  <b>{s.title}</b>
                  <span className="muted">Not planned yet</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="tri">
        <section className="panel" aria-labelledby="continue-h">
          <h2 id="continue-h">Continue reading</h2>
          {continueList.length === 0 && <p className="muted">Open a note and it shows up here.</p>}
          {continueList.map((n) => {
            const st = subjectStyle(String(n.subject ?? "polity"));
            return (
              <Link key={n.id} className="note-row" to={`/notes/${n.id}`}>
                <span className="id-tile" style={{ background: st.tint, color: st.ink }}>
                  {n.id}
                </span>
                <span>
                  <b>{n.title}</b>
                  <span className="muted">
                    <RevisionText p={progress.notes[n.id]} />
                  </span>
                </span>
              </Link>
            );
          })}
        </section>

        <section className="panel tone-go" aria-labelledby="due-h">
          <div className="panel-title">
            <h2 id="due-h">Due for revision</h2>
            <span className="count-pill go">{due.length}</span>
          </div>
          {due.length === 0 && <p className="muted-on">Nothing due. Read a note to start its revision cycle.</p>}
          {due.slice(0, 4).map((n) => (
            <Link key={n.id} className="due-row" to={`/notes/${n.id}`}>
              <span className="dot" style={{ background: subjectStyle(String(n.subject ?? "polity")).color }} />
              <span className="grow">{n.title}</span>
              <ConfChip value={progress.notes[n.id]?.confidence} />
            </Link>
          ))}
          {due.length > 0 && (
            <Link className="pill-btn go self-start" to="/revise">
              Start revising
            </Link>
          )}
        </section>

        <section className="panel tone-claude" aria-labelledby="inbox-h">
          <div className="panel-title">
            <Icon name="sparkle" />
            <h2 id="inbox-h">Claude inbox</h2>
          </div>
          {fromClaude === 0 && (
            <p className="muted-on">Replies to your Ask Claude comments and filed captures land here.</p>
          )}
          {replies.slice(0, 2).map(({ key, t }) => (
            <Link key={t.id} className="inbox-item" to={`/notes/${key.split(":")[1]}`}>
              <span className="kicker">Reply · {key.split(":")[1]}</span>
              <span>{t.comments[0]?.body}</span>
            </Link>
          ))}
          {filed.slice(0, 2).map((c) => (
            <Link key={c.id} className="inbox-item" to="/inbox">
              <span className="kicker">Filed{c.note ? ` · ${c.note}` : ""}</span>
              <span>{c.reply || c.text}</span>
            </Link>
          ))}
          {fromClaude > 0 && (
            <Link className="pill-btn self-start" to="/inbox">
              Open inbox
            </Link>
          )}
        </section>
      </div>

      <ScratchPad />
    </article>
  );
}

function RevisionText({ p }: { p?: NoteProgress }) {
  if (!p?.readAt) return <>Not read yet</>;
  const n = p.revisions.length;
  return (
    <>
      {n ? `Revised ${n}×` : "Read once"} · due {dueLabel(nextDue(p)!)}
    </>
  );
}

function ConfChip({ value }: { value?: Confidence }) {
  if (!value) return null;
  return <span className={`chip conf-${value}`}>{CONF_LABEL[value]}</span>;
}

function ScratchPad() {
  const { captures } = useStudy();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const open = captures.filter((c) => c.status === "open");
  const save = async () => {
    if (!text.trim()) return setError("Write something first.");
    try {
      await addCapture(text);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <section className="scratch" aria-labelledby="scratch-h">
      <div className="panel-title">
        <h2 id="scratch-h">Scratch pad</h2>
        <span className="hint">Claude files these into the right note on its next run</span>
      </div>
      <label htmlFor="scratch-text" className="sr-only">
        New capture
      </label>
      <textarea
        id="scratch-text"
        rows={2}
        value={text}
        placeholder="Jot a doubt or something to check, in your own words"
        onChange={(e) => (setText(e.target.value), setError(""))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void save();
          }
        }}
      />
      {error && <p className="error">{error}</p>}
      {text.trim() && (
        <button type="button" className="pill-btn go self-start" onClick={() => void save()}>
          Save
        </button>
      )}
      {open.length > 0 && (
        <ul className="captures">
          {open.map((c) => (
            <li key={c.id}>
              <span className="grow">{c.text}</span>
              <span className="when">Waiting for Claude</span>
              <button type="button" className="x" aria-label="Delete capture" onClick={() => void deleteCapture(c.id)}>
                <Icon name="close" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- Subject database ----------

type View = "table" | "board" | "due";
type Filter = "all" | "written" | "due" | "weak";

export function SubjectPage() {
  const { paperId, subjectId } = useParams();
  const paper = PAPERS.find((p) => p.id === paperId);
  const subject = paper?.subjects.find((s) => s.id === subjectId);
  useTitle(subject?.title ?? "Not found");
  const [params, setParams] = useSearchParams();
  const view = (["table", "board", "due"].includes(params.get("view") ?? "") ? params.get("view") : "table") as View;
  const [filter, setFilter] = useState<Filter>("all");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const rows = useRows(subject ?? { id: "", title: "", topics: [] });
  const day = today();

  const all = useMemo(() => rows.flatMap((g) => g.notes.map((r) => ({ ...r, topic: g.topic }))), [rows]);
  if (!paper || !subject) return <NotFoundInline />;
  const st = subjectStyle(subject.id);
  const keep = (r: (typeof all)[number]) =>
    filter === "all" ||
    (filter === "written" && !!r.page) ||
    (filter === "due" && isDue(r.p, day)) ||
    (filter === "weak" && r.p?.confidence === "weak");
  const written = all.filter((r) => r.page).length;
  const pyqs = all.reduce((n, r) => n + r.note.pyqs, 0);
  const dueCount = all.filter((r) => r.page && isDue(r.p, day)).length;
  const setView = (v: View) => setParams(v === "table" ? {} : { view: v }, { replace: true });

  return (
    <article className="dash wide">
      <header className="subject-banner" style={{ background: st.color } as CSSProperties}>
        <span className="shape a" style={{ background: st.shape }} />
        <span className="shape b" style={{ background: st.ink }} />
        <div className="banner-inner">
          <div className="eyebrow light">{paper.title}</div>
          <h1>{subject.title}</h1>
          <div className="head-chips">
            <span className="chip white" style={{ color: st.ink }}>
              {all.length} notes
            </span>
            <span className="chip white" style={{ color: st.ink }}>
              {written} written
            </span>
            <span className="chip white" style={{ color: st.ink }}>
              {pyqs} Mains PYQs
            </span>
            <span className="chip white" style={{ color: st.ink }}>
              {dueCount} due
            </span>
          </div>
        </div>
      </header>

      <div className="db-bar">
        <div className="segmented" role="tablist" aria-label="View">
          {(["table", "board", "due"] as View[]).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}>
              {v === "table" ? "Table" : v === "board" ? "Board" : "Due"}
            </button>
          ))}
        </div>
        {view !== "due" && (
          <div className="filters" role="group" aria-label="Filter">
            {(["all", "written", "due", "weak"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`pill-btn small${filter === f ? " on" : ""}`}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f === "written" ? "Written" : f === "due" ? "Due" : "Weak"}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "table" && (
        <div className="db">
          <table>
            <thead>
              <tr>
                <th>Note</th>
                <th>PYQs</th>
                <th>Status</th>
                <th>Revision</th>
                <th>Confidence</th>
                <th>Claude</th>
                <th>Comments</th>
              </tr>
            </thead>
            {rows.map((g) => {
              const shown = g.notes.filter((r) => keep({ ...r, topic: g.topic }));
              if (!shown.length) return null;
              const isClosed = closed.has(g.topic.id);
              return (
                <tbody key={g.topic.id}>
                  <tr className="group">
                    <td colSpan={7}>
                      <button
                        type="button"
                        className="group-btn"
                        aria-expanded={!isClosed}
                        onClick={() =>
                          setClosed((s) => {
                            const n = new Set(s);
                            if (n.has(g.topic.id)) n.delete(g.topic.id);
                            else n.add(g.topic.id);
                            return n;
                          })
                        }
                      >
                        <span className={`caret${isClosed ? "" : " open"}`}>
                          <Icon name="chevron" />
                        </span>
                        <span className="num" style={{ background: st.color }}>
                          {g.topic.n}
                        </span>
                        {g.topic.title}
                        <span className="muted">
                          {g.notes.length} notes · {g.notes.reduce((n, r) => n + r.note.pyqs, 0)} PYQs
                        </span>
                      </button>
                    </td>
                  </tr>
                  {!isClosed &&
                    shown.map(({ note, page, p, threads }) => (
                      <tr key={note.id} className={page ? "" : "planned"}>
                        <td className="title-cell">
                          {page ? <Link to={`/notes/${note.id}`}>{page.title}</Link> : <span>{note.title}</span>}
                        </td>
                        <td>{note.pyqs}</td>
                        <td>
                          {page ? (
                            <select
                              className={`chip select ${STATUS_TONE[String(page.status)] ?? ""}`}
                              aria-label="Status"
                              value={String(page.status ?? "draft")}
                              onChange={(e) => void setStatus(page, e.target.value)}
                            >
                              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <StartNote paper={paper} subject={subject} topic={g.topic} note={note} />
                          )}
                        </td>
                        <td>{page ? <RevisionCell p={p} /> : <span className="faint">—</span>}</td>
                        <td>
                          {page ? (
                            <ConfidenceSelect noteId={note.id} value={p?.confidence} />
                          ) : (
                            <span className="faint">—</span>
                          )}
                        </td>
                        <td>{page ? <ClaudeChip threads={threads} /> : <span className="faint">—</span>}</td>
                        <td>{page ? <CommentsCell threads={threads} /> : <span className="faint">—</span>}</td>
                      </tr>
                    ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      {view === "board" && (
        <div className="board">
          {[
            ["planned", "Not started"],
            ["draft", "Drafting"],
            ["in-review", "In review"],
            ["live", "Live"],
          ].map(([key, label]) => {
            const items = all.filter((r) => keep(r) && (r.page ? String(r.page.status ?? "draft") : "planned") === key);
            return (
              <section key={key} className={`lane lane-${key}`} aria-label={label}>
                <h3>
                  {label} <span className="muted">{items.length}</span>
                </h3>
                {items.map((r) =>
                  r.page ? (
                    <Link key={r.note.id} className="board-card" to={`/notes/${r.note.id}`}>
                      <b>{r.page.title}</b>
                      <span className="muted">
                        {r.topic.n} · {r.note.pyqs} PYQs
                      </span>
                      <span className="row">
                        <ConfChip value={r.p?.confidence} />
                        <ClaudeChip threads={r.threads} />
                      </span>
                    </Link>
                  ) : (
                    <div key={r.note.id} className="board-card planned">
                      <b>{r.note.title}</b>
                      <span className="muted">
                        {r.topic.n} · {r.note.pyqs} PYQs
                      </span>
                    </div>
                  ),
                )}
              </section>
            );
          })}
        </div>
      )}

      {view === "due" && <DueList rows={all.filter((r) => r.page)} />}
    </article>
  );
}

function DueList({ rows }: { rows: { note: PlannedNote; page?: Page; p?: NoteProgress }[] }) {
  const day = today();
  const read = rows.filter((r) => r.p?.readAt).sort((a, b) => nextDue(a.p)!.localeCompare(nextDue(b.p)!));
  const unread = rows.filter((r) => !r.p?.readAt);
  return (
    <div className="due-list">
      {read.length === 0 && <p className="muted">Nothing read yet. Opening a note starts its revision cycle.</p>}
      {read.map((r) => (
        <DueRow
          key={r.note.id}
          id={r.note.id}
          title={r.page?.title ?? r.note.title}
          p={r.p!}
          late={nextDue(r.p)! <= day}
        />
      ))}
      {unread.length > 0 && (
        <p className="muted">
          Not read yet:{" "}
          {unread.map((r, i) => (
            <span key={r.note.id}>
              {i > 0 && ", "}
              <Link to={`/notes/${r.note.id}`}>{r.page?.title ?? r.note.title}</Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function DueRow({ id, title, p, late }: { id: string; title: string; p: NoteProgress; late: boolean }) {
  const revisedToday = p.revisions.at(-1) === today();
  return (
    <div className={`due-item${late ? " late" : ""}`}>
      <Link to={`/notes/${id}`} className="grow">
        <b>{title}</b>
        <span className="muted">
          <RevisionText p={p} />
        </span>
      </Link>
      <ConfidenceSelect noteId={id} value={p.confidence} />
      {revisedToday ? (
        <button type="button" className="pill-btn small" onClick={() => void undoRevised(id)}>
          Undo
        </button>
      ) : (
        <button type="button" className="pill-btn go small" onClick={() => void markRevised(id)}>
          <Icon name="check" />
          Revised
        </button>
      )}
    </div>
  );
}

// ---------- Revise today ----------

export function RevisePage() {
  useTitle("Revise today");
  const { pages } = useContent();
  const { progress } = useStudy();
  const day = today();
  const notes = [...pages.values()].filter((p) => p.collection === "notes" && progress.notes[p.id]?.readAt);
  const byDue = notes.sort((a, b) => nextDue(progress.notes[a.id])!.localeCompare(nextDue(progress.notes[b.id])!));
  const now = byDue.filter((n) => nextDue(progress.notes[n.id])! <= day);
  const soon = byDue.filter((n) => nextDue(progress.notes[n.id])! > day).slice(0, 8);
  return (
    <article className="dash">
      <header className="dash-head">
        <div>
          <div className="eyebrow">Spaced revision · 3, 7, 21, 60 days; weak notes sooner</div>
          <h1>Revise today</h1>
        </div>
      </header>
      <section className="due-list">
        {now.length === 0 && <p className="muted">Nothing due today.</p>}
        {now.map((n) => (
          <DueRow key={n.id} id={n.id} title={n.title} p={progress.notes[n.id]} late />
        ))}
      </section>
      {soon.length > 0 && (
        <section className="due-list">
          <h2 className="sec-h">Coming up</h2>
          {soon.map((n) => (
            <DueRow key={n.id} id={n.id} title={n.title} p={progress.notes[n.id]} late={false} />
          ))}
        </section>
      )}
    </article>
  );
}

// ---------- Claude inbox ----------

export function InboxPage() {
  useTitle("Claude inbox");
  const { threads, captures } = useStudy();
  const items = Object.entries(threads).flatMap(([key, ts]) => ts.map((t) => ({ key, t })));
  const replied = items.filter(({ t }) => t.kind === "claude" && !t.resolved && t.comments.at(-1)?.userId === "claude");
  const waiting = items.filter(({ t }) => t.kind === "claude" && !t.resolved && t.comments.at(-1)?.userId !== "claude");
  const flags = items.filter(({ t }) => t.kind === "flag" && !t.resolved);
  const openCaptures = captures.filter((c) => c.status === "open");
  const filed = captures.filter((c) => c.status === "done");
  const title = (key: string) => {
    const [c, id] = key.split(":");
    return getPage(c === "notes" ? "notes" : "cards", id)?.title ?? id;
  };
  const href = (key: string) => {
    const [c, id] = key.split(":");
    return `/${c}/${id}`;
  };
  return (
    <article className="dash">
      <header className="dash-head">
        <div>
          <div className="eyebrow">Replies, questions waiting, and what Claude filed</div>
          <h1>Claude inbox</h1>
        </div>
      </header>
      <section className="inbox-sec">
        <h2 className="sec-h">Replies from Claude</h2>
        {replied.length === 0 && <p className="muted">No new replies.</p>}
        {replied.map(({ key, t }) => (
          <Link key={t.id} className="inbox-card" to={href(key)}>
            <span className="kicker">{title(key)}</span>
            <blockquote>{t.anchor.quote}</blockquote>
            <span className="q">You: {t.comments[0]?.body}</span>
            <span className="a">Claude: {t.comments.at(-1)?.body}</span>
          </Link>
        ))}
      </section>
      {flags.length > 0 && (
        <section className="inbox-sec">
          <h2 className="sec-h">Flags from Grok</h2>
          {flags.map(({ key, t }) => {
            const verdict = t.comments.filter((c) => c.userId === "claude").at(-1)?.body;
            return (
              <Link key={t.id} className={`inbox-card${verdict ? "" : " quiet"}`} to={href(key)}>
                <span className="kicker">
                  ⚑ {grokBot(t.flag?.by ?? "")?.name ?? "Grok"} · {t.flag?.level} · {title(key)}
                </span>
                <blockquote>{t.anchor.quote}</blockquote>
                <span className="q">Grok: {t.comments[0]?.body}</span>
                <span className={verdict ? "a" : "q"}>{verdict ? `Claude: ${verdict}` : "Claude will check this"}</span>
              </Link>
            );
          })}
        </section>
      )}
      <section className="inbox-sec">
        <h2 className="sec-h">Waiting for Claude</h2>
        {waiting.length + openCaptures.length === 0 && <p className="muted">Nothing waiting.</p>}
        {waiting.map(({ key, t }) => (
          <Link key={t.id} className="inbox-card quiet" to={href(key)}>
            <span className="kicker">Ask Claude · {title(key)}</span>
            <span className="q">{t.comments[0]?.body}</span>
          </Link>
        ))}
        {openCaptures.map((c) => (
          <div key={c.id} className="inbox-card quiet">
            <span className="kicker">Scratch pad</span>
            <span className="q">{c.text}</span>
          </div>
        ))}
      </section>
      {filed.length > 0 && (
        <section className="inbox-sec">
          <h2 className="sec-h">Filed from your scratch pad</h2>
          {filed.map((c) => (
            <div key={c.id} className="inbox-card">
              <span className="kicker">{c.note ? `Filed into ${c.note}` : "Done"}</span>
              <span className="q">You: {c.text}</span>
              <span className="a">Claude: {c.reply}</span>
              <span className="row">
                {c.note && (
                  <Link className="pill-btn small" to={`/notes/${c.note}`}>
                    Open {c.note}
                  </Link>
                )}
                <button type="button" className="pill-btn small" onClick={() => void deleteCapture(c.id)}>
                  Clear
                </button>
              </span>
            </div>
          ))}
        </section>
      )}
    </article>
  );
}

function NotFoundInline() {
  useTitle("Not found");
  return (
    <article className="page">
      <h1>Page not found</h1>
      <p>
        This page doesn't exist. <Link to="/">Go to the Atlas home</Link>.
      </p>
    </article>
  );
}
