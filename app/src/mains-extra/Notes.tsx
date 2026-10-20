// Mains Notes in the Board look (the chosen design: Mains Notes 1 · Table + Claude drawer). A paper
// switch, subject tabs, then every planned note grouped under its syllabus topic, with its Mains
// PYQs, your answers, whether it is written, and what Claude has on it: open checks, sources
// waiting, or "Draft next" for the unwritten notes with the most PYQs. Everything here is read
// from data the app already has (the syllabus, the notes, proposals, the Write flow's answers);
// the note pages and the subject tables are unchanged.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { COMING_SUBJECTS, PAPERS, type PlannedNote, type Subject, type Topic } from "../content/syllabus";
import { STATUS_LABEL, useContent, type Page } from "../content/store";
import { addCapture, useStudy } from "../content/study";
import { useMainsExtra } from "../content/mains-extra";
import { answerStats, heatLevel, noteFacts, type MainsExtra, type QuestionSummary } from "../lib/mains-extra";
import type { Proposal } from "../lib/proposals";
import { dayLabel, Drawer, Stat, useSelection, useTitle } from "./parts";
import "../prelims/prelims.css";
import "./mains-extra.css";

const PAPER_TABS = [
  { id: "gs1", label: "GS1", colour: "#a86fd0", code: "GS1" },
  { id: "gs2", label: "GS2", colour: "#7c7cf0", code: "GS2" },
  { id: "gs3", label: "GS3", colour: "#e7a52c", code: "GS3" },
  { id: "gs4", label: "GS4", colour: "#23a597", code: "GS4" },
  { id: "essay", label: "Essay", colour: "#d9699b", code: "Essay" },
  { id: "medical", label: "Medical Science", colour: "#ee7a59", code: "Medical" },
] as const;

interface Row {
  note: PlannedNote;
  topic: Topic;
  page?: Page;
  facts?: ReturnType<typeof noteFacts>;
  pending: Proposal[];
  questions: QuestionSummary[];
  answers: ReturnType<typeof answerStats>;
  draftRank?: number;
}

function useRows(subject: Subject | undefined, extra: MainsExtra): Row[] {
  const { pages } = useContent();
  const { proposals } = useStudy();
  return useMemo(() => {
    if (!subject) return [];
    const rows: Row[] = subject.topics.flatMap((topic) =>
      topic.notes.map((note) => {
        const page = pages.get(`notes:${note.id}`);
        return {
          note,
          topic,
          page,
          facts: page && Array.isArray(page.blocks) ? noteFacts(page.blocks) : undefined,
          pending: (proposals[`notes:${note.id}`] ?? []).filter((p) => p.status === "pending"),
          questions: extra.questions.filter((q) => q.note === note.id).sort((a, b) => b.year - a.year),
          answers: answerStats(extra.answers, (a) => a.note === note.id),
        };
      }),
    );
    // "Draft next": the unwritten notes with the most Mains PYQs.
    rows
      .filter((r) => !r.page && r.note.pyqs > 0)
      .sort((a, b) => b.note.pyqs - a.note.pyqs || a.note.id.localeCompare(b.note.id))
      .slice(0, 3)
      .forEach((r, i) => (r.draftRank = i + 1));
    return rows;
  }, [subject, pages, proposals, extra]);
}

function claudeOf(r: Row): { t: string; tone: string } | null {
  if (r.page) {
    if (r.pending.length)
      return { t: `${r.pending.length} source${r.pending.length === 1 ? "" : "s"} waiting`, tone: "down" };
    if (r.facts?.open.length)
      return { t: `${r.facts.open.length} open check${r.facts.open.length === 1 ? "" : "s"}`, tone: "gold" };
    return null;
  }
  return r.draftRank ? { t: `Draft next · #${r.draftRank}`, tone: "up" } : null;
}

export default function NotesPage() {
  useTitle("Mains notes");
  const [params, setParams] = useSearchParams();
  const extra = useMainsExtra();
  const paperId = PAPER_TABS.some((p) => p.id === params.get("paper")) ? params.get("paper")! : "gs2";
  const tab = PAPER_TABS.find((p) => p.id === paperId)!;
  const paper = PAPERS.find((p) => p.id === paperId);
  const coming = paper?.comingSubjects ?? COMING_SUBJECTS.filter((s) => s.paper === tab.code).map((s) => s.title);
  const subjectId = params.get("subject");
  const subject = paper?.subjects.find((s) => s.id === subjectId) ?? paper?.subjects[0];
  const rows = useRows(subject, extra.data);
  const [sel, select] = useSelection("note");
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k === "paper") next.delete("subject");
    next.delete("note");
    setParams(next, { replace: true });
  };
  const current = rows.find((r) => r.note.id === sel);
  const written = rows.filter((r) => r.page);
  const pyqs = rows.reduce((n, r) => n + r.note.pyqs, 0);
  const covered = written.reduce((n, r) => n + r.note.pyqs, 0);
  const checks = written.reduce((n, r) => n + (r.facts?.open.length ?? 0), 0);
  const waiting = written.reduce((n, r) => n + r.pending.length, 0);
  const next = rows.find((r) => r.draftRank === 1);

  return (
    <article className="dash wide mx-page mx-notes">
      <div className="mx-head">
        <div className="seg mx-paper-switch" role="tablist" aria-label="Paper">
          {PAPER_TABS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === paperId}
              aria-pressed={p.id === paperId}
              onClick={() => set("paper", p.id)}
            >
              <span className="mx-swatch round" style={{ background: p.colour }} />
              {p.label}
            </button>
          ))}
        </div>
        <span className="mx-gap" />
        <span className="mx-actions-row">
          {next && <DraftButton row={next} label="Draft the next note" />}
          <Link className="board-btn quiet small" to="/mains/write">
            Write an answer
          </Link>
        </span>
      </div>

      {paperId === "essay" || paperId === "medical" ? (
        <div className="mx-panel mx-empty-panel">
          {paperId === "essay" ? (
            <>
              <p>The Essay paper has no notes of its own: your GS notes are its evidence.</p>
              <Link className="board-btn" to="/mains/essay">
                Open Essay
              </Link>
            </>
          ) : (
            <>
              <p>
                Medical Science notes aren&apos;t planned yet. Its syllabus table has your ratings, PYQs and diagrams.
              </p>
              <Link className="board-btn" to="/mains/medical">
                Open Medical Science
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mx-head">
            <div className="mx-tabs" role="tablist" aria-label="Subject">
              {paper?.subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.id === subject?.id}
                  className={s.id === subject?.id ? "on" : ""}
                  onClick={() => set("subject", s.id)}
                >
                  {s.title} <span className="mx-muted">{s.topics.reduce((n, t) => n + t.notes.length, 0)}</span>
                </button>
              ))}
              {coming.map((c) => (
                <span
                  key={c}
                  role="tab"
                  aria-selected={false}
                  aria-disabled="true"
                  className="off"
                  title="Not planned yet"
                >
                  {c}
                </span>
              ))}
            </div>
            {subject && (
              <div className="mx-stats">
                <Stat n={written.length} tone="up">
                  of {rows.length} notes written
                </Stat>
                <Stat n={covered} tone="mode">
                  of {pyqs} Mains PYQs covered
                </Stat>
                <Stat n={checks} tone="gold">
                  {checks === 1 ? "open check" : "open checks"}
                </Stat>
                <Stat n={waiting} tone="down">
                  {waiting === 1 ? "source waiting" : "sources waiting"}
                </Stat>
              </div>
            )}
          </div>

          {!subject ? (
            <div className="mx-panel mx-empty-panel">
              <p>
                No notes are planned for {tab.label} yet.
                {coming.length ? ` Coming: ${coming.join(", ")}.` : ""}
              </p>
            </div>
          ) : (
            <div className={`mx-split${current ? " has-drawer" : ""}`}>
              <section className="mx-table cols-notes" aria-label={`${subject.title} notes`} data-paper={paperId}>
                <div className="mx-thead" aria-hidden="true">
                  <span>Note</span>
                  <span>Mains PYQs</span>
                  <span className="mx-c-opt">Answers</span>
                  <span className="mx-c-wide">Note</span>
                  <span>Claude</span>
                </div>
                {subject.topics.map((t) => {
                  const list = rows.filter((r) => r.topic.id === t.id);
                  return (
                    <div key={t.id} role="rowgroup">
                      <div className="mx-group split">
                        <span className="t-mode">
                          {tab.code} · {t.n}
                        </span>
                        <span className="mx-group-title">{t.title}</span>
                        <span className="mx-muted">{list.reduce((n, r) => n + r.note.pyqs, 0)} PYQs</span>
                      </div>
                      {list.map((r) => (
                        <NoteRow key={r.note.id} r={r} on={r.note.id === sel} onPick={() => select(r.note.id)} />
                      ))}
                    </div>
                  );
                })}
              </section>
              {current && <NoteDrawer r={current} subject={subject} paperId={paperId} onClose={() => select(null)} />}
            </div>
          )}
        </>
      )}
    </article>
  );
}

function NoteRow({ r, on, onPick }: { r: Row; on: boolean; onPick: () => void }) {
  const cl = claudeOf(r);
  const last = r.questions[0]?.year;
  return (
    <div className={`mx-row${on ? " on" : ""}`} onClick={onPick} data-id={r.note.id}>
      <span className="mx-main mx-note-cell">
        <b className={`mx-id${r.page ? " on" : ""}`}>{r.note.id}</b>
        <span>
          <button type="button" className="mx-row-open" onClick={(e) => (e.stopPropagation(), onPick())}>
            {r.page?.title ?? r.note.title}
          </button>
        </span>
      </span>
      <span className={`mx-heat h${heatLevel(r.note.pyqs)}`}>
        <b>{r.note.pyqs}</b> <span className="mx-muted">· {last ?? "—"}</span>
      </span>
      <span className={`mx-c-opt ${r.answers.count ? "mx-small b" : "mx-muted"}`}>
        {r.answers.count ? `${r.answers.count}${r.answers.avg !== undefined ? ` · avg ${r.answers.avg}` : ""}` : "—"}
      </span>
      <span className="mx-c-wide mx-stack">
        <span className={`mx-small b ${r.page ? "t-up" : "mx-muted"}`}>{r.page ? "Written" : "Not written"}</span>
        {r.page?.updated && <span className="mx-tiny mx-muted">changed {dayLabel(String(r.page.updated))}</span>}
      </span>
      <span>{cl ? <span className={`mx-flag t-${cl.tone}`}>{cl.t}</span> : <span className="mx-muted">—</span>}</span>
    </div>
  );
}

function DraftButton({ row, label, big }: { row: Row; label: string; big?: boolean }) {
  const { captures } = useStudy();
  const text = `Draft ${row.note.id} (${row.note.title}) next: it has ${row.note.pyqs} Mains PYQs.`;
  const [sent, setSent] = useState(false);
  const asked = sent || captures.some((c) => c.status === "open" && c.text === text);
  return (
    <button
      type="button"
      className={`board-btn${big ? "" : " small"}`}
      disabled={asked}
      onClick={() => {
        setSent(true);
        void addCapture(text).catch(() => setSent(false));
      }}
    >
      {asked ? `Asked Claude to draft ${row.note.id}` : label}
    </button>
  );
}

function NoteDrawer({
  r,
  subject,
  paperId,
  onClose,
}: {
  r: Row;
  subject: Subject;
  paperId: string;
  onClose: () => void;
}) {
  const { captures } = useStudy();
  const [sent, setSent] = useState(false);
  const ask = `Look again for answers to the open checks in ${r.note.id}.`;
  const asked = sent || captures.some((c) => c.status === "open" && c.text === ask);
  const kicker = r.page
    ? `${r.note.id} · Written`
    : r.draftRank
      ? `${r.note.id} · Not written · Draft next #${r.draftRank}`
      : `${r.note.id} · Not written`;
  return (
    <Drawer label="Claude on this note" onClose={onClose} kicker={kicker} title={r.page?.title ?? r.note.title}>
      {r.page && r.facts && (
        <>
          {r.facts.lead && (
            <div className="mx-block">
              <span className="mx-label">At a glance</span>
              <span className="mx-lead">{r.facts.lead}</span>
            </div>
          )}
          {r.pending.length > 0 && (
            <div className="mx-claude-note dated">
              <span className="mx-label">Sources waiting · {r.pending.length}</span>
              {r.pending.map((p) => (
                <span key={p.id} className="mx-small">
                  <b>{p.source.label}</b> · {p.reason}
                </span>
              ))}
              <Link className="mx-link-btn" to="/inbox">
                Decide in the Claude inbox →
              </Link>
            </div>
          )}
          <div className="mx-claude-note watch">
            <span className="mx-label">Open checks · {r.facts.open.length}</span>
            {r.facts.open.length === 0 && <span className="mx-small mx-muted">None open.</span>}
            {r.facts.open.map((t) => (
              <span key={t} className="mx-check-line">
                <span aria-hidden="true">○</span>
                {t}
              </span>
            ))}
            {r.facts.open.length > 0 && (
              <button
                type="button"
                className="board-btn small gold"
                disabled={asked}
                onClick={() => {
                  setSent(true);
                  void addCapture(ask).catch(() => setSent(false));
                }}
              >
                {asked ? "Asked: Claude looks on its next run" : "Ask Claude to look again"}
              </button>
            )}
            <span className="mx-tiny mx-muted">
              Anything Claude finds arrives as a proposal for you to accept or reject.
            </span>
          </div>
          <span className="mx-tiny mx-muted b">
            v{r.page.version} · {STATUS_LABEL[String(r.page.status ?? "draft")] ?? String(r.page.status)} · last change{" "}
            {dayLabel(String(r.page.updated))}
          </span>
        </>
      )}
      {!r.page && r.draftRank && (
        <div className="mx-block">
          <span className="mx-label t-up">Why this note next</span>
          <span className="mx-why">
            {r.note.pyqs} Mains PYQs, {r.draftRank === 1 ? "the most" : "among the most"} of any unwritten note in{" "}
            {subject.title}.
          </span>
          {r.questions[0] && <span className="mx-why">Asked again in {r.questions[0].year}.</span>}
          {r.answers.count > 0 && (
            <span className="mx-why">
              You have answered here {r.answers.count}×
              {r.answers.avg !== undefined ? `, averaging ${r.answers.avg}` : ""}, without a note to revise from.
            </span>
          )}
        </div>
      )}
      <div className="mx-block">
        <span className="mx-label">Mains PYQs · {r.note.pyqs}</span>
        {r.questions.length ? (
          r.questions.slice(0, 4).map((q, i) => (
            <span key={i} className="mx-pyq">
              <b className="t-mode">{q.year}</b>
              <span>{q.text}</span>
            </span>
          ))
        ) : (
          <span className="mx-small mx-muted">
            {r.note.pyqs ? "Their texts arrive with the Write flow's question bank." : "None mapped to this note."}
          </span>
        )}
        {r.questions.length > 4 && <span className="mx-tiny mx-muted b">+ {r.questions.length - 4} more</span>}
      </div>
      {r.page ? (
        <Link className="board-btn" to={`/notes/${r.note.id}`}>
          Open the note
        </Link>
      ) : (
        <div className="mx-block">
          <span className="mx-small mx-muted">
            Drafted from your notes and the web, judgments from full texts and official data, then fact-checked blind
            before you see it.
          </span>
          <DraftButton row={r} label={`Ask Claude to draft ${r.note.id}`} big />
          <Link className="mx-link-btn" to={`/${paperId}/${subject.id}`}>
            Or start it yourself from the subject table →
          </Link>
        </div>
      )}
    </Drawer>
  );
}
