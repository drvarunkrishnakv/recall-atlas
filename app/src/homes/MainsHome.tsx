// Mains Home at "/" (the chosen design: Mains 1 · Centre stage). "Today's answer" is the big button
// in the centre, as Puzzles is on the Prelims Home; the notes due are on its left and the last
// feedback on its right, under a "From Claude" strip; then the six paper tiles, each with its
// average answer score and how much of its notes are written; then the latest changes in your
// notes, and (from the old home) Continue reading and the scratch pad. The numbers are worked out
// in lib/mains-analytics.ts from your answers, notes and progress.
import { useEffect, useMemo, type CSSProperties } from "react";
import { Link, MorphTitle } from "../components/nav";
import { useContent, type Page } from "../content/store";
import { useStudy } from "../content/study";
import { useMains } from "../content/mains";
import { PAPERS } from "../content/syllabus";
import { ScratchPad } from "../dashboard";
import { useEngineNotes } from "./data";
import { daysUntil, longDate, MAINS_2027 } from "../lib/exam";
import { fmtMarks, minutesFor, PAPER_SHORT, suggestQuestions, type MainsAnswer } from "../lib/mains";
import {
  answerTarget,
  fromClaude,
  lastFeedback,
  noteChanges,
  one,
  paperStats,
  sentOn,
  targetText,
  WRITTEN_MARKS,
  type PaperStat,
} from "../lib/mains-analytics";
import { dueLabel, nextDue, today as todayOf, type NoteProgress } from "../lib/progress";
import "../prelims/prelims.css";
import "./homes.css";
import "./mains-home.css";

const WEEK = 7 * 864e5;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** "today", "yesterday" or "15 Sep". */
function whenWritten(iso: string, today: string) {
  const day = new Date(iso).toLocaleDateString("en-CA");
  if (day === today) return "today";
  if (day === new Date(Date.parse(`${today}T12:00:00`) - 864e5).toLocaleDateString("en-CA")) return "yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "17 Jul 2026" for a source's date, "20 Oct" for a change this year. */
function changeDate(date: string | undefined, at: string) {
  if (date)
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Where a paper tile leads: its notes (Mains Notes, M12), the Essay or Medical Science screens. */
const tileLink = (key: string) =>
  key === "essay" ? "/mains/essay" : key === "medical" ? "/mains/medical" : `/mains/notes?paper=${key}`;

export function MainsHome() {
  const mains = useMains();
  const engine = useEngineNotes();
  const { pages } = useContent();
  const { progress, threads, captures, proposals, recent } = useStudy();
  useEffect(() => {
    document.title = "Mains Atlas";
  }, []);
  const today = todayOf();
  const days = daysUntil(MAINS_2027, today);
  const target = answerTarget(today);

  const notes = useMemo(() => [...pages.values()].filter((p) => p.collection === "notes"), [pages]);
  const written = useMemo(() => new Set(notes.map((p) => p.id)), [notes]);
  const answers = useMemo(() => [...mains.answers.values()], [mains.answers]);
  const questions = useMemo(() => mains.sets.flatMap((s) => s.questions), [mains.sets]);
  // The same first pick the Write screen makes: retries due first, then new questions with a note.
  const suggestion = useMemo(() => suggestQuestions(questions, answers, { written })[0], [questions, answers, written]);
  const doneToday = sentOn(answers, today);
  const stats = useMemo(() => paperStats(answers), [answers]);
  const claude = fromClaude({ threads, captures, proposals, answers, week: engine.week });

  // Notes you have read, soonest due first.
  const due = notes
    .filter((n) => progress.notes[n.id]?.readAt)
    .sort((a, b) => nextDue(progress.notes[a.id])!.localeCompare(nextDue(progress.notes[b.id])!));
  const dueNow = due.filter((n) => nextDue(progress.notes[n.id])! <= today);

  const changes = noteChanges(notes, proposals);
  const thisWeek = changes.filter((c) => Date.now() - Date.parse(c.at) < WEEK);
  const continueList = [...recent.map((id) => pages.get(`notes:${id}`)).filter(Boolean), ...notes]
    .filter((p, i, all) => all.indexOf(p) === i)
    .slice(0, 3) as Page[];

  return (
    <article className="mh">
      <header className="mh-head">
        <h1>{greeting()}</h1>
        <p>
          {target.phase === "exam" ? (
            <>Mains has started</>
          ) : (
            <>
              <b>
                {doneToday} of today's {target.high}
              </b>{" "}
              answers written · {days} days to Mains, {longDate(MAINS_2027)}
            </>
          )}
        </p>
      </header>

      <section className="mh-claude" aria-label="From Claude">
        <span className="mh-claude-label">From Claude</span>
        {claude.length ? (
          claude.map((c) => (
            <Link key={c.key} to={c.to}>
              {c.text}
            </Link>
          ))
        ) : (
          <span className="mh-claude-none">Nothing new: replies, note updates and marked answers show here.</span>
        )}
        <Link className="mh-claude-open" to="/inbox">
          Open inbox →
        </Link>
      </section>

      <div className="mh-stage">
        <section className="mh-card" aria-label="Notes due">
          <span className="mh-eyebrow">
            Notes due{dueNow.length ? <b className="mh-count">{dueNow.length}</b> : null}
          </span>
          {due.length === 0 ? (
            <p className="mh-sub">Nothing due. Opening a note starts its revision cycle: 1, 3, 7, 21, then 60 days.</p>
          ) : (
            <ul className="mh-due">
              {due.slice(0, 3).map((n) => (
                <li key={n.id}>
                  <DueRow page={n} p={progress.notes[n.id]} today={today} />
                </li>
              ))}
            </ul>
          )}
          {due.length > 0 && (
            <div className="mh-actions">
              <Link className="board-btn quiet" to={`/notes/${due[0].id}`}>
                Revise {due[0].id}
              </Link>
              <Link className="mh-more" to="/revise">
                {dueNow.length > 0 ? `All ${dueNow.length} due →` : "Revise today →"}
              </Link>
            </div>
          )}
        </section>

        <div className="mh-centre">
          <TodaysAnswer
            loading={mains.status !== "ready"}
            error={mains.status === "error" ? mains.error : undefined}
            suggestion={suggestion}
            done={doneToday}
            high={target.high}
          />
        </div>

        <LastFeedback answers={answers} today={today} loading={mains.status !== "ready"} />
      </div>

      <section className="mh-papers" aria-labelledby="mh-papers-h">
        <div className="mh-papers-head">
          <h2 id="mh-papers-h">Papers</h2>
          <span className="muted">
            {WRITTEN_MARKS.toLocaleString("en-IN")} written marks · average answer score · target {targetText(target)}
          </span>
          <Link className="chip-btn" to="/mains/analytics">
            Analytics
          </Link>
        </div>
        <div className="mh-tiles">
          {stats.map((s) => (
            <PaperTile key={s.group.key} s={s} written={written} />
          ))}
        </div>
      </section>

      <div className="mh-lower">
        <section className="mh-card" aria-labelledby="mh-changes-h">
          <h2 id="mh-changes-h" className="mh-eyebrow">
            {thisWeek.length ? "This week in your notes" : "Latest changes in your notes"}
          </h2>
          {changes.length === 0 ? (
            <p className="mh-sub">No changes yet. Updates you approve and your own edits show here, newest first.</p>
          ) : (
            <ul className="mh-changes">
              {(thisWeek.length ? thisWeek.slice(0, 5) : changes.slice(0, 3)).map((c) => (
                <li key={`${c.note}-${c.at}-${c.text}`}>
                  <Link to={`/notes/${c.note}`}>
                    <b>{c.note}</b>
                    <span className="mh-change-text">{c.text}</span>
                    <span className="mh-when">{changeDate(c.date, c.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mh-card" aria-labelledby="mh-continue-h">
          <h2 id="mh-continue-h" className="mh-eyebrow">
            Continue reading
          </h2>
          {continueList.length === 0 && <p className="mh-sub">Open a note and it shows up here.</p>}
          <ul className="mh-due">
            {continueList.map((n) => (
              <li key={n.id}>
                <Link className="mh-note" to={`/notes/${n.id}`}>
                  <b>{n.id}</b>
                  <MorphTitle to={`/notes/${n.id}`}>{n.title}</MorphTitle>
                  <span className="mh-when">{readText(progress.notes[n.id], today)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mh-scratch">
        <ScratchPad />
      </div>
    </article>
  );
}

function readText(p: NoteProgress | undefined, today: string) {
  if (!p?.readAt) return "not read yet";
  return `${p.revisions.length ? `revised ${p.revisions.length}×` : "read once"} · due ${dueLabel(nextDue(p)!, today)}`;
}

function DueRow({ page, p, today }: { page: Page; p: NoteProgress; today: string }) {
  const due = nextDue(p)!;
  return (
    <Link className="mh-note" to={`/notes/${page.id}`}>
      <b>{page.id}</b>
      <MorphTitle to={`/notes/${page.id}`}>{page.title}</MorphTitle>
      <span className={`mh-when${due <= today ? " late" : ""}`}>{dueLabel(due, today)}</span>
    </Link>
  );
}

function TodaysAnswer({
  loading,
  error,
  suggestion,
  done,
  high,
}: {
  loading: boolean;
  error?: string;
  suggestion?: ReturnType<typeof suggestQuestions>[number];
  done: number;
  high: number;
}) {
  const q = suggestion?.question;
  const count = high ? (done < high ? `${done + 1} of ${high}` : "one more") : "";
  return (
    <Link className="mh-today" to={q ? `/mains/write?q=${q.id}` : "/mains/write"}>
      <span className="mh-today-top">
        <span>Today's answer</span>
        <span>{count}</span>
      </span>
      {q ? (
        <span className="mh-today-q">{q.text}</span>
      ) : (
        <span className="mh-today-q">
          {loading
            ? error
              ? `Couldn't load your questions: ${error}`
              : "Finding today's question…"
            : "No questions loaded yet. Claude loads past papers with atlas mains-import."}
        </span>
      )}
      <span className="mh-today-foot">
        {q && (
          <span className="mh-today-meta">
            {suggestion!.why === "retry" && suggestion!.last?.marking
              ? `Retry · last time ${fmtMarks(suggestion!.last.marking.score)} · `
              : ""}
            {PAPER_SHORT[q.paper]} · {q.year ? `Mains ${q.year} PYQ` : "Claude's question"} · {q.words} words ·{" "}
            {minutesFor(q.marks, q.paper)} min
          </span>
        )}
        <span className="mh-today-go">Start writing</span>
      </span>
    </Link>
  );
}

function LastFeedback({ answers, today, loading }: { answers: MainsAnswer[]; today: string; loading: boolean }) {
  const { latest, waiting } = lastFeedback(answers);
  const newerWaiting = waiting.filter(
    (a) => !latest || Date.parse(a.submittedAt!) > Date.parse(latest.submittedAt ?? latest.createdAt),
  );
  const wait = newerWaiting[0] ?? waiting[0];
  const waitLine = wait && (
    <Link className="mh-waiting" to={`/mains/answers/${wait.id}`}>
      <span className="mh-dot" aria-hidden="true" />
      {waiting.length === 1 ? "1 answer" : `${waiting.length} answers`} waiting for marking · sent{" "}
      {whenWritten(wait.submittedAt!, today)}
    </Link>
  );
  if (!latest)
    return (
      <section className="mh-card" aria-label="Last feedback">
        <span className="mh-eyebrow">{wait ? "Waiting for marking" : "Feedback"}</span>
        {wait ? (
          <>
            <b className="mh-title clamp">{wait.question.text}</b>
            <span className="mh-sub">Claude marks it on its next scheduled run.</span>
            <Link className="board-btn quiet" to={`/mains/answers/${wait.id}`}>
              Open the answer
            </Link>
          </>
        ) : (
          <span className="mh-sub">
            {loading
              ? "Loading your answers…"
              : "No answers yet. Write today's answer and Claude marks it on its next run."}
          </span>
        )}
      </section>
    );
  const m = latest.marking!;
  const fix = [...m.fix].sort((a, b) => b.gain - a.gain)[0];
  return (
    <section className="mh-card" aria-label="Last feedback">
      <span className="mh-eyebrow">Feedback ready</span>
      <b className="mh-title clamp">{latest.question.text}</b>
      <span className="mh-score">
        <b>{fmtMarks(m.score)}</b>
        <span>/ 10 · written {whenWritten(latest.submittedAt ?? latest.createdAt, today)}</span>
      </span>
      {m.keep[0] && (
        <span className="mh-line">
          <b className="up">Keep:</b> {m.keep[0]}
        </span>
      )}
      {fix && (
        <span className="mh-line">
          <b className="down">Fix:</b> {fix.text}
        </span>
      )}
      <Link className="board-btn quiet" to={`/mains/answers/${latest.id}`}>
        Open feedback
      </Link>
      {waitLine}
    </section>
  );
}

function PaperTile({ s, written }: { s: PaperStat; written: Set<string> }) {
  const g = s.group;
  const paper = PAPERS.find((p) => p.id === g.key);
  const planned = paper?.subjects.flatMap((sub) => sub.topics.flatMap((t) => t.notes)) ?? [];
  const done = planned.filter((n) => written.has(n.id)).length;
  const scoreSub =
    s.avg !== null
      ? `/ 10 · ${s.marked} ${s.marked === 1 ? "answer" : "answers"}${s.waiting ? ` · ${s.waiting} waiting` : ""}`
      : s.waiting
        ? `${s.waiting} waiting for marking`
        : g.key === "essay"
          ? "no essays yet"
          : "no answers yet";
  const notesLine = planned.length ? `${done} of ${planned.length} notes written` : "notes not started";
  return (
    <div className="mh-tile" style={{ "--subj": g.color } as CSSProperties}>
      <span className="mh-tile-top">
        <span className="ph-code" aria-hidden="true">
          {g.code}
        </span>
        <span className="mh-tile-name">
          <Link
            className="mh-tile-link"
            to={tileLink(g.key)}
            aria-label={`${g.name}: ${s.avg !== null ? `average ${one(s.avg)} of 10` : scoreSub}; ${notesLine}`}
          >
            {g.name}
          </Link>
          <span className="mh-covers">{g.covers}</span>
        </span>
        <span className="mh-marks">{g.marks}</span>
      </span>
      <span className="mh-tile-score">
        <b>{s.avg !== null ? one(s.avg) : "—"}</b>
        <span>{scoreSub}</span>
      </span>
      <span className="mh-tile-notes">
        {planned.length ? (
          <>
            Notes: {done} of {planned.length}{" "}
            {paper!.subjects.map((sub, i) => (
              <span key={sub.id}>
                {i > 0 && ", "}
                <Link className="mh-sub-link" to={`/${paper!.id}/${sub.id}`}>
                  {sub.title}
                </Link>
              </span>
            ))}{" "}
            notes written
          </>
        ) : g.key === "essay" ? (
          s.marked + s.waiting ? (
            `Essays written: ${s.marked + s.waiting}`
          ) : (
            "Essay practice not started"
          )
        ) : (
          "Notes: not started"
        )}
      </span>
      <span className="ph-bar" aria-hidden="true">
        <i style={{ width: `${planned.length ? (done / planned.length) * 100 : 0}%` }} />
      </span>
    </div>
  );
}
