// Medical Science (the chosen design: Medical Science 1 · Syllabus table + drawer). The official
// syllabus condensed into lines, grouped by subject under Paper I and Paper II, each with your own
// rating (Rusty / OK / Strong), its PYQs, key diagrams, your answers and Claude's note. "Draw"
// opens the diagram drill: draw it from memory in 3 minutes, then photograph it.
import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { changeWork, useMainsExtra, workOf } from "../content/mains-extra";
import {
  answerStats,
  DRILL_MS,
  drillsOf,
  medicalFlag,
  RATING_LABEL,
  RATINGS,
  writeLink,
  type MainsExtra,
  type MedicalLine,
  type Rating,
} from "../lib/mains-extra";
import {
  dayLabel,
  Drawer,
  fmtClock,
  fmtDuration,
  newId,
  Ring,
  Stat,
  useClock,
  useSelection,
  useTitle,
  Waiting,
  plural,
} from "./parts";
import "../prelims/prelims.css";
import "./mains-extra.css";

/** A colour per subject, in syllabus order. */
const SUBJECT_COLOURS = [
  "#e88a6a",
  "#e7a52c",
  "#a86fd0",
  "#d9699b",
  "#23a597",
  "#3d9bd6",
  "#8f8a80",
  "#7c7cf0",
  "#4fb873",
  "#c88a4a",
  "#ee7a59",
  "#e8634f",
  "#76b041",
];

interface Subject {
  name: string;
  paper: "I" | "II";
  colour: string;
  lines: MedicalLine[];
}

function subjectsOf(lines: MedicalLine[]): Subject[] {
  const out: Subject[] = [];
  for (const l of lines) {
    let s = out.find((x) => x.name === l.subject && x.paper === l.paper);
    if (!s) {
      s = { name: l.subject, paper: l.paper, colour: SUBJECT_COLOURS[out.length % SUBJECT_COLOURS.length], lines: [] };
      out.push(s);
    }
    s.lines.push(l);
  }
  return out;
}

function RateButtons({ line, value, big }: { line: string; value?: Rating; big?: boolean }) {
  return (
    <span className={`mx-rate${big ? " big" : ""}`} role="group" aria-label="Your rating">
      {RATINGS.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={value === r}
          className={`r-${r}${value === r ? " on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            changeWork("medical", line, { op: "rate", rating: value === r ? null : r });
          }}
        >
          {RATING_LABEL[r]}
        </button>
      ))}
    </span>
  );
}

export default function MedicalPage() {
  useTitle("Medical Science");
  const { status, error, data, saveError } = useMainsExtra();
  const [params, setParams] = useSearchParams();
  const [sel, select] = useSelection("line");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  if (status !== "ready") return <Waiting status={status} error={error} what="the syllabus" />;
  const lines = data.medical;
  const subjects = subjectsOf(lines);
  const selLine = lines.find((l) => l.id === sel);
  const paper = (params.get("paper") === "II" ? "II" : params.get("paper") === "I" ? "I" : selLine?.paper) ?? "I";
  const setPaper = (p: "I" | "II") => {
    const next = new URLSearchParams(params);
    next.set("paper", p);
    setParams(next, { replace: true });
  };
  const rated = lines.filter((l) => workOf(data, "medical", l.id).rating).length;
  const rusty = lines.filter((l) => workOf(data, "medical", l.id).rating === "rusty").length;
  const diagrams = lines.flatMap((l) => l.diagrams.map((d) => [l.id, d.id] as const));
  const drawn = diagrams.filter(([l, d]) => drillsOf(workOf(data, "medical", l), d).length).length;
  const answers = answerStats(data.answers, (a) => !!a.medical);
  const pyqsLoaded = lines.length > 0 && lines.every((l) => l.pyqs);
  const years = lines.flatMap((l) => l.pyqs?.items.map((q) => q.year) ?? []);

  return (
    <article className="dash wide mx-page mx-medical">
      <header className="mx-head">
        <div>
          <h1>Medical Science</h1>
          <span className="mx-sub">Optional · two papers, 250 marks each</span>
        </div>
        <div className="seg mx-paper-tabs" role="tablist" aria-label="Paper">
          {(["I", "II"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={paper === p}
              aria-pressed={paper === p}
              onClick={() => setPaper(p)}
            >
              Paper {p}{" "}
              <span className="mx-muted">{plural(subjects.filter((s) => s.paper === p).length, "subject")}</span>
            </button>
          ))}
        </div>
        <div className="mx-stats">
          <Stat n={rated}>of {lines.length} lines rated</Stat>
          <Stat n={rusty} tone="down">
            rusty
          </Stat>
          <Stat n={drawn} tone="mode">
            of {diagrams.length} key diagrams drawn
          </Stat>
          <Stat n={answers.count || "No"}>{answers.count === 1 ? "answer" : "answers"} yet</Stat>
        </div>
      </header>
      {saveError && <p className="mx-error">{saveError}</p>}
      {lines.length > 0 &&
        (pyqsLoaded ? (
          <p className="mx-note-line">
            PYQs from UPSC&apos;s papers{years.length ? `, ${Math.min(...years)}–${Math.max(...years)}` : ""}, each
            sub-part mapped to its syllabus line.
          </p>
        ) : (
          <div className="mx-banner">
            <span>
              <b>Medical Science PYQs aren&apos;t loaded for every line yet.</b> Once they are, each question is mapped
              to a syllabus line, so this table shows what UPSC asks most.
            </span>
          </div>
        ))}

      <div className={`mx-split${selLine ? " has-drawer" : ""}`}>
        <section className="mx-table cols-medical" aria-label="Syllabus">
          <div className="mx-thead" aria-hidden="true">
            <span>Syllabus line</span>
            <span>Your rating</span>
            <span>PYQs</span>
            <span className="mx-c-wide">Diagrams</span>
            <span className="mx-c-opt">Answers</span>
            <span className="mx-c-wide">Claude</span>
          </div>
          {lines.length === 0 && (
            <p className="mx-empty">The syllabus isn&apos;t loaded yet. Claude loads it with the CLI.</p>
          )}
          {subjects
            .filter((s) => s.paper === paper)
            .map((s) => {
              const key = `${s.paper}-${s.name}`;
              const open = !closed.has(key);
              const counts = { rusty: 0, ok: 0, strong: 0, none: 0 };
              for (const l of s.lines) counts[workOf(data, "medical", l.id).rating ?? "none"]++;
              const dTot = s.lines.reduce((n, l) => n + l.diagrams.length, 0);
              const dDone = s.lines.reduce(
                (n, l) => n + l.diagrams.filter((d) => drillsOf(workOf(data, "medical", l.id), d.id).length).length,
                0,
              );
              return (
                <div key={key} role="rowgroup">
                  <button
                    type="button"
                    className="mx-subject"
                    aria-expanded={open}
                    onClick={() =>
                      setClosed((c) => {
                        const n = new Set(c);
                        if (n.has(key)) n.delete(key);
                        else n.add(key);
                        return n;
                      })
                    }
                  >
                    <span className="mx-muted b">{open ? "▾" : "▸"}</span>
                    <span className="mx-subject-name">
                      <span className="mx-swatch" style={{ background: s.colour }} />
                      <b>{s.name}</b>
                      <span className="mx-muted mx-small b">
                        {s.lines.length} {s.lines.length === 1 ? "line" : "lines"}
                      </span>
                    </span>
                    <span className="mx-mix mx-c-wide" aria-label="Your ratings">
                      {(["rusty", "ok", "strong", "none"] as const)
                        .filter((k) => counts[k])
                        .map((k) => (
                          <span key={k} className={`m-${k}`} style={{ flexGrow: counts[k] }} />
                        ))}
                    </span>
                    <span className="mx-muted mx-small b mx-c-wide">
                      {dTot ? `${dDone} of ${plural(dTot, "diagram")}` : "no key diagrams"}
                    </span>
                  </button>
                  {open &&
                    s.lines.map((l) => {
                      const w = workOf(data, "medical", l.id);
                      const flag = medicalFlag(l, w);
                      const dd = l.diagrams.filter((d) => drillsOf(w, d.id).length).length;
                      const ans = answerStats(data.answers, (a) => a.medical === l.id);
                      return (
                        <div
                          key={l.id}
                          className={`mx-row sub${l.id === sel ? " on" : ""}`}
                          onClick={() => select(l.id)}
                          data-id={l.id}
                        >
                          <button
                            type="button"
                            className="mx-row-open mx-main"
                            onClick={(e) => (e.stopPropagation(), select(l.id))}
                            title={l.label}
                          >
                            {l.label}
                          </button>
                          <RateButtons line={l.id} value={w.rating} />
                          <span className={l.pyqs?.count ? "mx-small b" : "mx-muted"}>
                            {l.pyqs
                              ? l.pyqs.count
                                ? `${l.pyqs.count}${l.pyqs.last ? ` · ${l.pyqs.last}` : ""}`
                                : "0"
                              : "—"}
                          </span>
                          <span
                            className={`mx-c-wide mx-small b${dd ? " t-mode" : l.diagrams.length ? "" : " mx-muted"}`}
                          >
                            {l.diagrams.length ? `${dd} of ${l.diagrams.length} drawn` : "—"}
                          </span>
                          <span className={`mx-c-opt ${ans.count ? "mx-small b" : "mx-muted"}`}>
                            {ans.count ? `${ans.count}${ans.avg !== undefined ? ` · ${ans.avg}` : ""}` : "—"}
                          </span>
                          <span className="mx-c-wide">
                            {flag && <span className={`mx-flag t-${flag.tone}`}>{flag.t}</span>}
                          </span>
                        </div>
                      );
                    })}
                </div>
              );
            })}
        </section>
        {selLine && <LineDrawer line={selLine} data={data} subjects={subjects} onClose={() => select(null)} />}
      </div>
    </article>
  );
}

function LineDrawer({
  line,
  data,
  subjects,
  onClose,
}: {
  line: MedicalLine;
  data: MainsExtra;
  subjects: Subject[];
  onClose: () => void;
}) {
  const w = workOf(data, "medical", line.id);
  const [all, setAll] = useState(false);
  const s = subjects.find((x) => x.name === line.subject && x.paper === line.paper);
  const ans = answerStats(data.answers, (a) => a.medical === line.id);
  const pyqs = line.pyqs?.items ?? [];
  const shown = all ? pyqs : pyqs.slice(0, 4);
  return (
    <Drawer
      label="Syllabus line"
      onClose={onClose}
      kicker={
        <>
          <span className="mx-swatch small" style={{ background: s?.colour }} />
          {line.subject} · Paper {line.paper}
        </>
      }
      title={line.label}
    >
      <blockquote className="mx-quote">{line.syllabus}</blockquote>
      <div className="mx-rate-row">
        <span className="mx-label">Your rating</span>
        <RateButtons line={line.id} value={w.rating} big />
      </div>
      {line.note && (
        <div className={`mx-claude-note ${line.note.kind}`}>
          <span className="mx-label">
            Claude · {line.note.kind === "dated" ? "the syllabus is dated" : "check before writing"}
          </span>
          <span>{line.note.text}</span>
          {line.note.checked ? (
            <span className="mx-small mx-muted">
              Checked against{" "}
              {line.note.sources.map((src, i) => (
                <span key={src.url}>
                  {i > 0 && ", "}
                  <a href={src.url} target="_blank" rel="noopener noreferrer">
                    {src.label}
                  </a>
                </span>
              ))}
            </span>
          ) : (
            <span className="mx-small t-gold b">Not fact-checked yet</span>
          )}
        </div>
      )}
      {!!line.gs?.length && (
        <div className="mx-chips">
          {line.gs.map((g) => (
            <Link key={g.to} className="mx-chip link" to={g.to}>
              Also feeds {g.label} →
            </Link>
          ))}
        </div>
      )}
      <div className="mx-block">
        <span className="mx-label">Key diagrams</span>
        {line.diagrams.length === 0 && (
          <span className="mx-muted mx-small">
            No key diagram listed for this line yet. A table or flowchart still lifts the answer.
          </span>
        )}
        {line.diagrams.map((d) => {
          const drills = drillsOf(w, d.id);
          return (
            <div key={d.id} className="mx-diagram">
              <span>
                <b>{d.t}</b>
                <span className={`mx-small b ${drills.length ? "t-mode" : "mx-muted"}`}>
                  {drills.length
                    ? `Drawn ${drills.length}× · last ${fmtDuration(drills[0].ms)} on ${dayLabel(drills[0].at)}`
                    : d.asked?.length
                      ? `Asked ${d.asked.join(", ")} · not drawn yet`
                      : "Not drawn yet"}
                </span>
              </span>
              <Link className="board-btn quiet small" to={`/mains/medical/draw/${line.id}/${d.id}`}>
                Draw
              </Link>
            </div>
          );
        })}
      </div>
      <div className="mx-block">
        <span className="mx-label">
          PYQs ·{" "}
          {line.pyqs
            ? `${line.pyqs.count} as its main line, ${line.pyqs.marks} marks${line.pyqs.secondary ? `; ${line.pyqs.secondary} more touch it` : ""}`
            : "not loaded yet"}
        </span>
        {shown.map((q) => (
          <span key={q.id} className="mx-pyq">
            <b className="t-mode">{q.year}</b>
            <span>
              {q.text}
              <span className="mx-muted">
                {" "}
                · Paper {q.paper} · {q.marks} marks{q.primary ? "" : " · touches this line"}
              </span>
            </span>
          </span>
        ))}
        {pyqs.length > shown.length && (
          <button type="button" className="mx-link-btn" onClick={() => setAll(true)}>
            Show all {pyqs.length}
          </button>
        )}
      </div>
      <div className="mx-block">
        <span className="mx-label">Your answers</span>
        <span className="mx-small mx-muted b">
          {ans.count ? `${ans.count} marked${ans.avg !== undefined ? ` · average ${ans.avg} of 10` : ""}` : "None yet"}
        </span>
      </div>
      <Link className="board-btn" to={writeLink("medical", line.id)}>
        Write a 10-mark short note
      </Link>
    </Drawer>
  );
}

// ---------- the diagram drill ----------

export function MedicalDraw() {
  const { line: lineId = "", diagram = "" } = useParams();
  const { status, error, data } = useMainsExtra();
  const line = data.medical.find((l) => l.id === lineId);
  const d = line?.diagrams.find((x) => x.id === diagram);
  useTitle(d ? `Draw: ${d.t}` : "Diagram drill");
  const clock = useClock(`draw-${lineId}-${diagram}`, DRILL_MS);
  const [logged, setLogged] = useState<number | null>(null);
  if (status !== "ready") return <Waiting status={status} error={error} what="the diagram" />;
  const back = (
    <nav className="mx-crumb" aria-label="Medical Science">
      <Link to={`/mains/medical?line=${lineId}`}>← Medical Science</Link>
      <span>/</span>
      <span>Diagram drill</span>
    </nav>
  );
  if (!line || !d)
    return (
      <article className="dash wide mx-page">
        {back}
        <p className="mx-empty">No such diagram.</p>
      </article>
    );
  const drills = drillsOf(workOf(data, "medical", line.id), d.id);
  const finish = () => {
    const ms = Math.round(clock.elapsed);
    changeWork("medical", line.id, {
      op: "drill",
      drill: { id: newId("d"), diagram: d.id, at: new Date().toISOString(), ms },
    });
    clock.reset();
    setLogged(ms);
  };
  return (
    <article className="dash wide mx-page mx-medical mx-focus">
      {back}
      <section className="mx-topic-card" aria-label="Diagram">
        <div>
          <span className="mx-kicker">
            {line.subject} · {line.label}
          </span>
          <p className="mx-topic-text">{d.t}</p>
          <span className="mx-muted b">
            Draw it from memory on paper in 3 minutes, with every label you can. No notes, no book.
          </span>
        </div>
        <div className="mx-clock-col">
          <Ring left={clock.left} limit={DRILL_MS} label="of 3:00" />
          {logged === null && (
            <span className="mx-actions-row">
              <button type="button" className="board-btn small" onClick={clock.running ? clock.pause : clock.start}>
                {clock.running ? "Pause" : clock.started ? "Resume" : "Start"}
              </button>
              {clock.started && (
                <button type="button" className="board-btn quiet small" onClick={finish}>
                  Done
                </button>
              )}
            </span>
          )}
        </div>
      </section>
      {logged !== null && (
        <div className="mx-done" role="status">
          <b>
            Logged: {fmtDuration(logged)}
            {logged > DRILL_MS ? ` (${fmtClock(DRILL_MS - logged)} over)` : ""}.
          </b>
          <span>Now photograph it. The Write flow takes the photo for this line.</span>
          <span className="mx-actions-row">
            <Link className="board-btn" to={writeLink("medical", line.id)}>
              Photograph it
            </Link>
            <button type="button" className="board-btn quiet" onClick={() => setLogged(null)}>
              Draw it again
            </button>
          </span>
        </div>
      )}
      <section className="mx-panel" aria-label="Your drills">
        <h2>Your drills of this diagram</h2>
        {drills.length === 0 && <p className="mx-muted">None yet. Redraw it in a few days, then a week later.</p>}
        {drills.map((x) => (
          <span key={x.id} className="mx-small">
            <b>{dayLabel(x.at)}</b> · {fmtDuration(x.ms)}
            {x.ms > DRILL_MS ? " · over time" : ""}
          </span>
        ))}
      </section>
    </article>
  );
}
