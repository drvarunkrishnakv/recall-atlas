// The Feedback tab (the chosen design: Feedback tab 1 · Table + pattern drawer). Every answer with
// its date, paper, question, score beside your own score, and fix tags; a row opens its marked
// page. Filter by paper or fix tag, or show only the answers due a retry. Choosing a tag opens its
// pattern: how often, the marks it cost, the change against last month, what it means and a drill.
//
//   /mains/feedback?paper=GS2&tag=thin-dimensions&retry=1
import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { useMains } from "../content/mains";
import {
  fmtMarks,
  FIX_TAGS,
  headline,
  isPaper,
  MAINS_PAPERS,
  PAPER_SHORT,
  retryDue,
  tagStats,
  type FixTagId,
  type MainsAnswer,
  type MainsPaper,
  type TagStat,
} from "../lib/mains";
import { fmtDate, tone } from "./parts";
import "../prelims/prelims.css";
import "./mains.css";

const when = (a: MainsAnswer) => Date.parse(a.submittedAt ?? a.createdAt);

export default function FeedbackTab() {
  const mains = useMains();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    document.title = "Feedback · Mains Atlas";
  }, []);
  const paper = isPaper(params.get("paper")) ? (params.get("paper") as MainsPaper) : null;
  const tagParam = params.get("tag");
  const tag = tagParam && Object.hasOwn(FIX_TAGS, tagParam) ? (tagParam as FixTagId) : null;
  const retryOnly = params.get("retry") === "1";

  const answers = useMemo(
    () => [...mains.answers.values()].filter((a) => a.status !== "draft").sort((a, b) => when(b) - when(a)),
    [mains.answers],
  );
  const now = useMemo(() => new Date(), []);
  const stats = useMemo(() => tagStats(answers, now), [answers, now]);
  const head = useMemo(() => headline(answers, now), [answers, now]);
  const due = useMemo(() => new Set(answers.filter((a) => retryDue(a, answers, now)).map((a) => a.id)), [answers, now]);

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  if (mains.status !== "ready")
    return (
      <article className="dash mw-page">
        <p className="loading">{mains.status === "error" ? `Couldn't load: ${mains.error}` : "Loading…"}</p>
      </article>
    );

  const rows = answers.filter(
    (a) =>
      (!paper || a.question.paper === paper) &&
      (!tag || a.marking?.tags.some((t) => t.tag === tag)) &&
      (!retryOnly || due.has(a.id)),
  );
  const pattern = tag ? stats.find((s) => s.tag === tag) : undefined;
  const oldest = answers[answers.length - 1];
  const first = oldest ? fmtDate(oldest.submittedAt ?? oldest.createdAt) : "";
  const off = head.selfOff.thisMonth ?? head.selfOff.all;
  const offLine = (v: number | null) =>
    v === null ? "–" : Math.abs(v) < 0.05 ? "spot on" : `${fmtMarks(Math.abs(v))} too ${v > 0 ? "high" : "low"}`;
  const avgSub = () => {
    const a = head.thisMonth.avg;
    const b = head.lastMonth.avg;
    if (a === null) return "No marked answers yet this month";
    if (b === null) return `No marked answers in ${head.lastMonth.name}`;
    return `${a > b ? "up from" : a < b ? "down from" : "same as"} ${fmtMarks(b)} in ${head.lastMonth.name}`;
  };
  const d = head.disputes;

  return (
    <article className="dash mw-page mw-fbtab">
      <header className="mw-fbtab-head">
        <h1>Feedback</h1>
        {answers.length > 0 && (
          <span className="muted">
            {answers.length} {answers.length === 1 ? "answer" : "answers"} since {first}
          </span>
        )}
      </header>

      {answers.length === 0 ? (
        <section className="board-card mw-waiting">
          <h2>No answers yet</h2>
          <p>Write one on paper and send its photos. Its marks show here after Claude's next run.</p>
          <Link className="board-btn" to="/mains/write">
            Write an answer
          </Link>
        </section>
      ) : (
        <>
          <div className="mw-stats">
            <div>
              <span className="k">Average in {head.thisMonth.name}</span>
              <b className="mode">{head.thisMonth.avg === null ? "–" : `${fmtMarks(head.thisMonth.avg)} / 10`}</b>
              <span className="sub">{avgSub()}</span>
            </div>
            <div>
              <span className="k">Your self-scores</span>
              <b className={off !== null && Math.abs(off) < 0.5 ? "up" : "down"}>{offLine(off)}</b>
              <span className="sub">
                {head.selfOff.thisMonth !== null && head.selfOff.lastMonth !== null
                  ? `was ${offLine(head.selfOff.lastMonth)} in ${head.lastMonth.name}`
                  : head.selfOff.thisMonth !== null
                    ? `this month`
                    : "across all your answers"}
              </span>
            </div>
            <div>
              <span className="k">Costliest fix</span>
              <b className="down">{head.costliest?.label ?? "–"}</b>
              <span className="sub">
                {head.costliest
                  ? `${head.costliest.count} ${head.costliest.count === 1 ? "answer" : "answers"} · ${fmtMarks(head.costliest.lost)} marks lost`
                  : "No fix tags yet"}
              </span>
            </div>
            <div>
              <span className="k">Disputes</span>
              <b>{d.changed + d.kept + d.open}</b>
              <span className="sub">
                {d.changed} {d.changed === 1 ? "mark" : "marks"} changed, {d.kept} kept
                {d.open ? `, ${d.open} waiting` : ""}
              </span>
            </div>
          </div>

          <div className="mw-filters">
            <div className="mw-filter-row" role="group" aria-label="Paper">
              {([null, ...MAINS_PAPERS] as (MainsPaper | null)[]).map((p) => {
                const n = p ? answers.filter((a) => a.question.paper === p).length : answers.length;
                return (
                  <button
                    key={p ?? "all"}
                    type="button"
                    className={`chip-btn${paper === p ? " on" : ""}`}
                    aria-pressed={paper === p}
                    disabled={n === 0}
                    onClick={() => set({ paper: p })}
                  >
                    {p && <i className={`mw-dot ${p}`} aria-hidden="true" />}
                    {p ? PAPER_SHORT[p] : "All"} <span className="muted">{n}</span>
                  </button>
                );
              })}
              <button
                type="button"
                className={`chip-btn retry${retryOnly ? " on" : ""}`}
                aria-pressed={retryOnly}
                onClick={() => set({ retry: retryOnly ? null : "1", tag: null })}
              >
                Retry due · {due.size}
              </button>
            </div>
            {stats.length > 0 && (
              <div className="mw-filter-row" role="group" aria-label="Fix tags">
                <span className="mw-label">Fix tags</span>
                {stats.map((s) => (
                  <button
                    key={s.tag}
                    type="button"
                    className={`mw-tagchip${tag === s.tag ? " on" : ""}`}
                    aria-pressed={tag === s.tag}
                    onClick={() => set({ tag: tag === s.tag ? null : s.tag, retry: null })}
                  >
                    {s.label} <b>{s.count}</b>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={`mw-table-wrap${pattern ? " with-drawer" : ""}`}>
            {pattern && (
              <Pattern
                stat={pattern}
                all={answers}
                onClose={() => set({ tag: null })}
                lastMonth={head.lastMonth.name}
              />
            )}
            <section className="mw-table" aria-label="All answers">
              <div className="mw-tr head" aria-hidden="true">
                <span>Date</span>
                <span>Paper</span>
                <span>Question</span>
                <span className="r">Score</span>
                <span>Fix tags</span>
              </div>
              {rows.map((a) => {
                const prev = answers.find((x) => x.question.id === a.question.id && when(x) < when(a) && x.marking);
                return (
                  <Link key={a.id} className="mw-tr" to={`/mains/answers/${a.id}`}>
                    <span className="date">{fmtDate(a.submittedAt ?? a.createdAt)}</span>
                    <span className="paper">
                      <i className={`mw-dot ${a.question.paper}`} aria-hidden="true" />
                      {PAPER_SHORT[a.question.paper]}
                    </span>
                    <span className="q">
                      <span className="t">{a.question.text}</span>
                      <span className="sub">
                        {a.question.topic}
                        {a.question.year ? ` · ${a.question.year} PYQ` : ""}
                        {due.has(a.id) && <b className="retry"> · retry due</b>}
                        {prev?.marking && <b className="up"> · retried, was {fmtMarks(prev.marking.score)}</b>}
                      </span>
                    </span>
                    <span className="score">
                      {a.marking ? (
                        <b className={tone(a.marking.score)}>{fmtMarks(a.marking.score)}</b>
                      ) : (
                        <b className="wait">Waiting</b>
                      )}
                      {a.selfScore !== undefined && <span>you said {fmtMarks(a.selfScore)}</span>}
                    </span>
                    <span className="tags">
                      {a.marking?.tags.map((t) => (
                        <span key={t.tag} className={`mw-tag${t.tag === tag ? " on" : ""}`}>
                          {FIX_TAGS[t.tag].label}
                        </span>
                      ))}
                      {a.status === "disputed" && <span className="mw-tag open">Dispute waiting</span>}
                    </span>
                  </Link>
                );
              })}
              {rows.length === 0 && <p className="mw-none">No answers match these filters.</p>}
            </section>
          </div>
        </>
      )}
    </article>
  );
}

const TREND_CLASS: Record<TagStat["trend"], string> = {
  Same: "",
  Better: "up",
  Fixed: "up",
  New: "down",
  Worse: "down",
};

function Pattern({
  stat,
  all,
  onClose,
  lastMonth,
}: {
  stat: TagStat;
  all: MainsAnswer[];
  onClose: () => void;
  lastMonth: string;
}) {
  const chron = [...all].filter((a) => a.marking).reverse();
  const lastHit = stat.hits[0]?.answer;
  return (
    <aside className="board-card mw-pattern" aria-label="Pattern">
      <div className="top">
        <div>
          <span className="mw-label">Pattern</span>
          <h2>{stat.label}</h2>
        </div>
        <button type="button" className="board-btn quiet small" aria-label="Close the pattern" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="tiles">
        <div>
          <b>{stat.count}</b>
          <span>{stat.count === 1 ? "answer" : "answers"}</span>
        </div>
        <div>
          <b className="down">−{fmtMarks(stat.lost)}</b>
          <span>marks lost</span>
        </div>
        <div>
          <b className={TREND_CLASS[stat.trend]}>{stat.trend}</b>
          <span>vs {lastMonth}</span>
        </div>
      </div>
      <p>{stat.what}</p>
      <div className="strip" aria-label={`${stat.count} of your last ${chron.length} marked answers`}>
        {chron.map((a) => (
          <span
            key={a.id}
            className={a.marking!.tags.some((t) => t.tag === stat.tag) ? "hit" : ""}
            title={`${fmtDate(a.submittedAt ?? a.createdAt)} · ${a.question.topic}`}
          />
        ))}
      </div>
      {chron.length > 1 && (
        <div className="ends">
          <span>{fmtDate(chron[0].submittedAt ?? chron[0].createdAt)}</span>
          <span>{fmtDate(chron[chron.length - 1].submittedAt ?? chron[chron.length - 1].createdAt)}</span>
        </div>
      )}
      <span className="mw-label">What it was each time</span>
      <div className="hits">
        {stat.hits.map((h) => (
          <Link key={h.answer.id} to={`/mains/answers/${h.answer.id}`} className={`hit ${h.answer.question.paper}`}>
            <span className="d">{fmtDate(h.answer.submittedAt ?? h.answer.createdAt)}</span>
            <span>
              <b>{h.answer.question.topic}</b> · {h.note}
            </span>
          </Link>
        ))}
      </div>
      <div className="drill">
        <span className="mw-label mode">Practise this fix</span>
        {stat.trend === "Fixed" ? (
          <span>
            Not seen since {lastHit ? fmtDate(lastHit.submittedAt ?? lastHit.createdAt) : "last month"}. Nothing to
            practise.
          </span>
        ) : (
          <>
            <span>{stat.drill}</span>
            <Link className="board-btn" to={`/mains/write?drill=${stat.tag}`}>
              Start the drill
            </Link>
          </>
        )}
      </div>
    </aside>
  );
}
