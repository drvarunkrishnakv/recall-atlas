// Mains Analytics (the chosen design: MAna-1 · The week's story), at /mains/analytics. Claude's
// weekly note is pinned on top, each line linked to its evidence; then each line of the week's
// story is a heading over the chart it rests on: scores by week, marks kept per checklist item,
// self-scores and time by month, answers a week against the target, and the marks still open per
// paper. 8 weeks by default, or 4, or all time (?range=4w|all). Every number comes from your
// answers and Claude's marking (lib/mains-analytics.ts); no predicted score until two full papers.
import { useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { useMains } from "../content/mains";
import { useEngineNotes, type WeekNoteLine } from "../homes/data";
import { clock, tagStats } from "../lib/mains";
import {
  gapText,
  isMainsRoute,
  mainsStory,
  one,
  TEN_MARKER_MS,
  targetText,
  weeksOfAnswers,
  type StoryLine,
} from "../lib/mains-analytics";
import { Columns } from "./charts";
import "../prelims/prelims.css";
import "./analytics.css";
import "./mains-analytics.css";

type Range = "4w" | "8w" | "all";
const RANGES: [Range, string][] = [
  ["4w", "4 weeks"],
  ["8w", "8 weeks"],
  ["all", "All time"],
];
const RANGE_LABEL: Record<Range, string> = { "4w": "last 4 weeks", "8w": "last 8 weeks", all: "all time" };
/** The story's sections, which a weekly-note line may name as its evidence. */
const SECTIONS: StoryLine["id"][] = ["scores", "checklist", "self-score", "time", "volume", "open"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (day: string) => `${+day.slice(8, 10)} ${MONTHS[+day.slice(5, 7) - 1]}`;

/** Monday of an ISO week ("2026-W43" → "2026-10-19"). */
function weekMonday(week: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return null;
  const jan4 = Date.UTC(+m[1], 0, 4);
  const monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * 864e5 + (+m[2] - 1) * 7 * 864e5;
  return new Date(monday).toISOString().slice(0, 10);
}

/** A weekly-note line is about Mains when its evidence isn't a Prelims screen or section. */
const isMainsLine = (l: WeekNoteLine) =>
  l.route ? isMainsRoute(l.route) : SECTIONS.includes(l.evidence as StoryLine["id"]);

/** Score colours: green from 7, gold from 6, coral below (as on the Feedback screens). */
const scoreTone = (v: number) => (v >= 7 ? "up" : v >= 6 ? "mid" : "down");
/** Share kept: green from 70%, gold from 50%, coral below. */
const keptTone = (v: number) => (v >= 0.7 ? "up" : v >= 0.5 ? "mid" : "down");

export default function MainsAnalytics() {
  const mains = useMains();
  const engine = useEngineNotes();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const range = (RANGES.find(([r]) => r === params.get("range"))?.[0] ?? "8w") as Range;
  useEffect(() => {
    document.title = "Analytics · Mains Atlas";
  }, []);
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, [location.hash, mains.status]);

  const answers = useMemo(() => [...mains.answers.values()], [mains.answers]);
  const m = useMemo(() => {
    const now = new Date();
    const weeks = range === "4w" ? 4 : range === "8w" ? 8 : weeksOfAnswers(answers, now);
    const story = mainsStory(answers, now, weeks);
    const tag = story.costliest && tagStats(answers, now).find((t) => t.item === story.costliest!.key);
    return { ...story, weeksN: weeks, tag };
  }, [answers, range]);

  if (mains.status !== "ready")
    return (
      <article className="an ma">
        <p className="loading">
          {mains.status === "error" ? `Couldn't load your answers: ${mains.error}` : "Loading your answers…"}
        </p>
      </article>
    );

  const setRange = (r: Range) => {
    const next = new URLSearchParams(params);
    if (r === "8w") next.delete("range");
    else next.set("range", r);
    setParams(next, { replace: true });
  };
  const line = (id: StoryLine["id"]) => m.lines.find((l) => l.id === id)!;
  const number = (id: StoryLine["id"]) => SECTIONS.indexOf(id) + 1;
  const claudeLines = engine.week?.lines.filter(isMainsLine) ?? [];
  const monday = engine.week ? weekMonday(engine.week.week) : null;
  const rl = RANGE_LABEL[range];
  const weekLabels = m.weeks.map((w) => shortDay(w.from));
  const maxOpen = Math.max(1, ...m.open.map((p) => p.open));
  const maxGap = Math.max(1, ...m.months.map((x) => Math.abs(x.selfGap ?? 0)));
  const timeScale = Math.max(TEN_MARKER_MS * (9 / 7), ...m.months.map((x) => x.tenMs ?? 0));
  const top = m.open[0];
  const p = m.prediction;

  return (
    <article className="an ma">
      <div className="ma-head">
        <div>
          <h1>Mains analytics</h1>
          <span className="ma-sub">
            {m.since
              ? `${answers.filter((a) => a.submittedAt).length} answers since ${shortDay(m.since)}`
              : "No answers yet"}{" "}
            ·{" "}
            {p.total === null
              ? `no predicted Mains score until you sit two full papers (${p.sat} so far)`
              : `about ${p.total.toLocaleString("en-IN")} of 1,750 predicted, from ${p.sat} full papers`}
          </span>
        </div>
        <span className="seg" role="group" aria-label="Time range">
          {RANGES.map(([r, label]) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
              {label}
            </button>
          ))}
        </span>
      </div>

      <section className="ma-note" aria-label="This week, from Claude">
        {claudeLines.length ? (
          <>
            <span className="an-eyebrow gold">
              This week, from Claude{monday ? ` · week of ${shortDay(monday)}` : ""}
            </span>
            <ol>
              {claudeLines.map((l, i) => (
                <li key={i}>
                  <NoteLine line={l} />
                </li>
              ))}
            </ol>
          </>
        ) : (
          <>
            <span className="an-eyebrow gold">Your answers' story · {rl}</span>
            <ol>
              {m.lines.map((l) => (
                <li key={l.id}>
                  <a className="ma-ln" href={`#${l.id}`}>
                    <b className={l.tone}>{number(l.id)}</b>
                    <span>{l.text}</span>
                    <em>evidence ↓</em>
                  </a>
                </li>
              ))}
            </ol>
            <p className="ma-quiet">
              No weekly note from Claude on your answers yet. Its weekly run adds its lines here, each linked to its
              evidence.
            </p>
          </>
        )}
      </section>

      <Story line={line("scores")} n={number("scores")}>
        <span className="an-cap">Average score by week · {rl}</span>
        <Columns
          values={m.weeks.map((w) => w.avg)}
          labels={weekLabels}
          sublabels={m.weeks.map((w) => (w.marked ? `${w.marked} marked` : w.sent ? `${w.sent} waiting` : "none"))}
          label={`Average score out of 10 by week, ${rl}`}
          format={one}
          max={10}
          tone={scoreTone}
        />
        <span className="an-foot">
          Out of 10, by the week each answer was written (each week starts on its date). Green from 7, gold from 6.
        </span>
        <Link className="an-more-link" to="/mains/feedback">
          Every answer in Feedback →
        </Link>
      </Story>

      <Story line={line("checklist")} n={number("checklist")}>
        <span className="an-cap">
          Share of each checklist item's marks you kept · {m.marked} marked {m.marked === 1 ? "answer" : "answers"},{" "}
          {rl}
        </span>
        <div className="ma-rows">
          {m.items.map((it) => (
            <div key={it.key} className={`ma-row ${it.kept === null ? "" : keptTone(it.kept)}`}>
              <span className="ma-row-name">
                {it.label} <small>/ {it.max}</small>
              </span>
              <span className="ma-track" aria-hidden="true">
                <i style={{ width: `${(it.kept ?? 0) * 100}%` }} />
              </span>
              <b>{it.kept === null ? "—" : `${Math.round(it.kept * 100)}%`}</b>
            </div>
          ))}
        </div>
        {m.tag ? (
          <Link className="an-more-link" to={`/mains/feedback?tag=${m.tag.tag}`}>
            See the {m.tag.count} {m.tag.count === 1 ? "answer" : "answers"} tagged {m.tag.label} →
          </Link>
        ) : null}
      </Story>

      <div className="ma-pair">
        <Story line={line("self-score")} n={number("self-score")} small>
          {m.months.some((x) => x.selfGap !== null) ? (
            <div className="ma-rows">
              {m.months
                .filter((x) => x.selfGap !== null)
                .map((x) => (
                  <div key={x.month} className={`ma-row month ${Math.abs(x.selfGap!) < 0.5 ? "up" : "mid"}`}>
                    <span className="ma-row-name">{x.short}</span>
                    <span className="ma-track tall" aria-hidden="true">
                      <i style={{ width: `${(Math.abs(x.selfGap!) / maxGap) * 100}%` }} />
                    </span>
                    <b>{gapText(x.selfGap!)}</b>
                  </div>
                ))}
            </div>
          ) : (
            <p className="ma-quiet">No marked answers with your own score in the {rl}.</p>
          )}
          <span className="an-foot">The average gap between your self-score and Claude's mark, per answer.</span>
        </Story>

        <Story line={line("time")} n={number("time")} small>
          {m.months.some((x) => x.tenMs !== null) ? (
            <div className="ma-rows">
              {m.months
                .filter((x) => x.tenMs !== null)
                .map((x) => (
                  <div key={x.month} className={`ma-row month ${x.tenMs! > TEN_MARKER_MS ? "mid" : "up"}`}>
                    <span className="ma-row-name">{x.short}</span>
                    <span className="ma-track tall" aria-hidden="true">
                      <i style={{ width: `${(x.tenMs! / timeScale) * 100}%` }} />
                      <span className="ma-target" style={{ left: `${(TEN_MARKER_MS / timeScale) * 100}%` }} />
                    </span>
                    <b>{clock(x.tenMs!)}</b>
                  </div>
                ))}
            </div>
          ) : (
            <p className="ma-quiet">No timed 10-markers in the {rl}.</p>
          )}
          <span className="an-foot">Average time for a 10-marker. The dashed line is the 7-minute limit.</span>
        </Story>
      </div>

      <Story line={line("volume")} n={number("volume")}>
        <Columns
          values={m.weeks.map((w) => w.sent)}
          labels={weekLabels}
          label={`Answers written each week, ${rl}, against a target of ${7 * m.target.low} to ${7 * m.target.high}`}
          format={(v) => String(v)}
          max={Math.max(7 * m.target.high * 1.3, ...m.weeks.map((w) => w.sent), 1)}
          band={m.target.phase === "exam" ? undefined : [7 * m.target.low, 7 * m.target.high]}
          bandLabel={`target ${7 * m.target.low}–${7 * m.target.high} a week`}
          tone={(v) => (v >= 7 * m.target.low ? "up" : "down")}
        />
        <span className="an-foot">
          Answers written each week. The target is {targetText(m.target)} until Prelims (23 May 2027), then it rises a
          step a week to 5–6 a day for the Mains season. Each marked answer is a lesson, so writing more beats polishing
          fewer.
        </span>
      </Story>

      <Story line={line("open")} n={number("open")}>
        <span className="an-cap">Marks still open, roughly · all time</span>
        <div className="ma-rows">
          {m.open.map((x) => (
            <div key={x.group.key} className="ma-row paper" style={{ "--c": x.group.color } as CSSProperties}>
              <span className="ma-row-name">
                <span className="ph-swatch" style={{ "--subj": x.group.color } as CSSProperties} aria-hidden="true" />
                {x.group.name}
              </span>
              <span className="ma-track tall" aria-hidden="true">
                <i style={{ width: `${(x.open / maxOpen) * 100}%` }} />
              </span>
              <span className="ma-open">
                <b>{x.open}</b>{" "}
                <span>
                  ·{" "}
                  {x.avg !== null
                    ? `avg ${one(x.avg)}`
                    : x.waiting
                      ? "waiting for marking"
                      : x.group.key === "gs4"
                        ? "no answers yet"
                        : "not started"}
                </span>
              </span>
            </div>
          ))}
        </div>
        <span className="an-foot">
          Paper marks × (1 − your average score ÷ 10). Papers with no marked answer count in full, so a 500-mark
          optional you haven't started leads.
        </span>
        {top &&
          (top.group.key === "medical" ? (
            <Link className="an-more-link" to="/mains/medical">
              Open Medical Science →
            </Link>
          ) : top.group.key === "essay" ? (
            <Link className="an-more-link" to="/mains/essay">
              Open the Essay topics →
            </Link>
          ) : (
            <Link className="an-more-link" to={`/mains/write?paper=${top.group.papers[0]}`}>
              Write a {top.group.name} answer →
            </Link>
          ))}
      </Story>

      <section className="ma-predict" aria-label="Predicted score">
        <span className="an-eyebrow">Predicted Mains score</span>
        {p.total === null ? (
          <p>
            None yet. After two full papers (a whole paper's 250 marks of questions in one sitting), marked, a rough
            total out of 1,750 shows here. Full papers so far: {p.sat}.
          </p>
        ) : (
          <p>
            About <b>{p.total.toLocaleString("en-IN")}</b> of 1,750, from {p.sat} full papers: the share you scored on
            them, applied to every written paper. A rough guide, not a forecast.
          </p>
        )}
      </section>
    </article>
  );
}

function Story({
  line,
  n,
  small = false,
  children,
}: {
  line: StoryLine;
  n: number;
  small?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`an-story${small ? " small" : ""}`} id={line.id} aria-labelledby={`${line.id}-h`}>
      <h2 id={`${line.id}-h`}>
        <span className={`ma-n ${line.tone}`}>{n} ·</span> {line.text}
      </h2>
      <div className="an-panel">{children}</div>
    </section>
  );
}

function NoteLine({ line }: { line: WeekNoteLine }) {
  const r = line.route ?? (line.evidence ? `#${line.evidence}` : "");
  const hash = r.startsWith("/mains/analytics#") ? r.slice("/mains/analytics".length) : r.startsWith("#") ? r : null;
  if (hash)
    return (
      <a className="ma-ln" href={hash}>
        <span>{line.text}</span>
        <em>evidence ↓</em>
      </a>
    );
  if (r)
    return (
      <Link className="ma-ln" to={r}>
        <span>{line.text}</span>
        <em>{line.label ?? "evidence"} →</em>
      </Link>
    );
  return (
    <span className="ma-ln">
      <span>{line.text}</span>
    </span>
  );
}
