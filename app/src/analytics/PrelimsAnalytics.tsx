// Prelims Analytics (the chosen design: Analytics 3 · The week's story). Claude's weekly note is
// pinned on top; then each line of the week's story is a heading with the chart it rests on:
// readiness and its five parts, the week's misses, speed, calibration with your guessing rule,
// where the marks are, and (folded) effort and mock tests. 8 weeks by default, or 4, or all time.
// Every number comes from the attempt log and the banks; there is no predicted score.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { usePractice } from "../content/practice";
import { daysUntil, PRELIMS_2027 } from "../lib/exam";
import type { Attempt, Item } from "../lib/practice";
import { today as todayOf } from "../lib/progress";
import {
  addDays,
  calibration,
  clock,
  dailyTarget,
  effortByDay,
  guessValue,
  overallScore,
  PART_HINT,
  PART_KEYS,
  PART_LABEL,
  PACE_MS,
  readinessOver,
  speedByWeek,
  weekPoints,
  weeksSince,
  whereTheMarksAre,
  workLeft,
} from "../lib/readiness";
import { subjectSlug } from "../lib/reading";
import { useEngineNotes, type WeekNoteLine } from "../homes/data";
import { dayRange, deltaClass, pct, shortDay, signed, subjectsOf, weekDelta } from "../homes/model";
import { Bars, Calendar, LineChart, Sparkline } from "./charts";
import "../prelims/prelims.css";
import "./analytics.css";

type Range = "4w" | "8w" | "all";
const RANGES: [Range, string][] = [
  ["4w", "4 weeks"],
  ["8w", "8 weeks"],
  ["all", "All time"],
];
const RANGE_LABEL: Record<Range, string> = { "4w": "last 4 weeks", "8w": "last 8 weeks", all: "all time" };
const SECTIONS = ["readiness", "misses", "speed", "calibration", "marks", "effort", "mocks"];
const FOLDED = ["effort", "mocks"];
const WEEK = 7 * 864e5;

export default function PrelimsAnalytics() {
  const practice = usePractice();
  const engine = useEngineNotes();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const range = (RANGES.find(([r]) => r === params.get("range"))?.[0] ?? "8w") as Range;
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    document.title = "Analytics · Prelims · Mains Atlas";
  }, []);
  // A note line that points at a folded section opens it.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (FOLDED.includes(id)) setOpen((s) => new Set(s).add(id));
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, [location.hash]);

  const m = useMemo(() => {
    const now = new Date();
    const today = todayOf(now);
    const banks = practice.banks;
    const attempts = Object.values(practice.days).flat();
    const subjects = subjectsOf(banks);
    const weeks = range === "4w" ? 4 : range === "8w" ? 8 : weeksSince(attempts, now);
    const points = weekPoints(now, weeks);
    const snaps = readinessOver(banks, attempts, points, (_, b) => ["all", subjectSlug(b.subject)]);
    const shares = new Map(subjects.map((s) => [s.slug, s.share]));
    const scoresAt = (k: number) => new Map(subjects.map((s) => [s.slug, snaps[k].get(s.slug)?.score ?? 0]));
    const L = points.length - 1;
    const overall = points.map((_, k) => overallScore(scoresAt(k), shares));
    const parts = PART_KEYS.map((k) => ({
      key: k,
      series: snaps.map((s) => s.get("all")?.parts[k] ?? null),
    }));
    const subjectRows = subjects
      .map((s) => {
        const series = snaps.map((x) => x.get(s.slug)?.score ?? 0);
        return { ...s, series, score: series[L], delta: series[L] - series[L - 1] };
      })
      .sort((a, b) => b.share - a.share);
    const mover = [...subjectRows].filter((s) => s.delta).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];

    const items = new Map(banks.flatMap((b) => b.items.map((i) => [i.id, i] as const)));
    const subjectOfBank = new Map(banks.map((b) => [b.id, subjectSlug(b.subject)]));
    const weekAgo = now.getTime() - WEEK;
    const inWeek = (a: Attempt, from: number, to: number) => Date.parse(a.at) > from && Date.parse(a.at) <= to;
    const misses = attempts
      .filter((a) => !a.correct && a.kind !== "puzzle" && inWeek(a, weekAgo, now.getTime()))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const missCount = new Map<string, number>();
    for (const a of misses) {
      const s = subjectOfBank.get(a.bank);
      if (s) missCount.set(s, (missCount.get(s) ?? 0) + 1);
    }
    const missTop = [...missCount].sort((a, b) => b[1] - a[1])[0];
    const missSubject = missTop && subjects.find((s) => s.slug === missTop[0]);

    const speed = speedByWeek(attempts, points.slice(1));
    const speedLabels = points.slice(1).map((p) => shortDay(addDays(todayOf(p), -6)));
    const calRange = calibration(attempts, points[0].getTime(), now.getTime() + 1);
    const calNow = calibration(attempts, weekAgo + 1, now.getTime() + 1);
    const calPrev = calibration(attempts, weekAgo - WEEK + 1, weekAgo + 1);
    const marks = whereTheMarksAre(shares, scoresAt(L)).map((r) => ({
      ...r,
      subject: subjects.find((s) => s.slug === r.group)!,
    }));

    const fromDay = addDays(today, 1 - 7 * weeks);
    const effort = effortByDay(practice.days, fromDay, today);
    const left = workLeft(banks, practice.states, now);
    const daysLeft = Math.max(1, daysUntil(PRELIMS_2027, today));
    const target = dailyTarget(left.unseen, left.due, daysLeft);
    const answered = effort.reduce((s, d) => s + d.n, 0);

    return {
      today,
      points,
      labels: points.map((p) => shortDay(todayOf(p))),
      overall,
      parts,
      subjectRows,
      mover,
      misses: missSubject ? misses.filter((a) => subjectOfBank.get(a.bank) === missSubject.slug) : [],
      missSubject,
      items,
      speed,
      speedLabels,
      calRange,
      calNow,
      calPrev,
      marks,
      effort,
      target,
      left,
      daysLeft,
      // One decimal below ten a day, so light weeks don't read as zero.
      perDay: effort.length ? Number((answered / effort.length).toFixed(answered / effort.length < 10 ? 1 : 0)) : 0,
      any: attempts.length > 0,
    };
  }, [practice.banks, practice.days, practice.states, range]);

  if (practice.status !== "ready")
    return (
      <article className="an">
        <p className="loading">
          {practice.status === "error" ? `Couldn't load practice: ${practice.error}` : "Loading your practice…"}
        </p>
      </article>
    );

  const L = m.overall.length - 1;
  const overallDelta = m.overall[L] - m.overall[L - 1];
  const setRange = (r: Range) => {
    const next = new URLSearchParams(params);
    if (r === "8w") next.delete("range");
    else next.set("range", r);
    setParams(next, { replace: true });
  };
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const subjectLink = (evidence: string) =>
    m.subjectRows.find((s) => s.slug === subjectSlug(evidence) || s.name.toLowerCase() === evidence.toLowerCase());

  // The story's headings, each worked out from the log.
  const mv = m.mover;
  const readinessLine = mv
    ? mv.delta > 0
      ? { arrow: "up", text: `${mv.name} rose ${mv.delta} points this week.` }
      : { arrow: "down", text: `${mv.name} slipped ${-mv.delta} points this week.` }
    : m.any
      ? { arrow: "flat", text: "Readiness held steady this week." }
      : { arrow: "flat", text: "Readiness starts with your first answers." };
  const [sNow, sPrev] = [m.speed[m.speed.length - 1], m.speed[m.speed.length - 2]];
  const speedLine =
    sNow == null
      ? { arrow: "flat", text: "No timed answers this week." }
      : sPrev == null || Math.round(sNow) === Math.round(sPrev)
        ? { arrow: "flat", text: `${clock(sNow * 1000)} a question this week.` }
        : sNow < sPrev
          ? { arrow: "up", text: `You're faster: ${clock(sNow * 1000)} a question, from ${clock(sPrev * 1000)}.` }
          : { arrow: "down", text: `You're slower: ${clock(sNow * 1000)} a question, from ${clock(sPrev * 1000)}.` };
  const [cNow, cPrev] = [m.calNow.confidentMisses, m.calPrev.confidentMisses];
  const calLine =
    m.calNow.sure.n + m.calPrev.sure.n === 0
      ? { arrow: "flat", text: "Lock in “sure” or “unsure” and your calibration shows here." }
      : cNow < cPrev
        ? { arrow: "up", text: `Confident misses fell to ${cNow}, from ${cPrev}.` }
        : cNow > cPrev
          ? { arrow: "down", text: `Confident misses rose to ${cNow}, from ${cPrev}.` }
          : { arrow: "flat", text: `Confident misses this week: ${cNow}, the same as last week.` };
  const top = m.marks.slice(0, 2).map((r) => r.subject.name);
  const marksLine = top.length
    ? { arrow: "next", text: `Next week: more ${top.join(" and ")}.` }
    : { arrow: "next", text: "Where the marks are shows once questions are loaded." };
  const maxOpen = Math.max(1, ...m.marks.map((r) => r.open));
  const c = m.calRange;
  const level = (n: number) => {
    const t = Math.max(1, m.target);
    return !n ? 0 : n < t / 2 ? 1 : n < t ? 2 : n < 1.5 * t ? 3 : 4;
  };

  return (
    <article className="an">
      <section className="an-top" aria-label="Readiness">
        <div className="an-bar">
          <span className="an-eyebrow gold">Your week · {dayRange(addDays(m.today, -6), m.today)}</span>
          <span className="seg" role="group" aria-label="Time range">
            {RANGES.map(([r, label]) => (
              <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
                {label}
              </button>
            ))}
          </span>
        </div>

        <section className="an-note" aria-label="Claude's note on your week">
          <span className="an-eyebrow">Claude's note on your week</span>
          {engine.week ? (
            <ul>
              {engine.week.lines.map((l, i) => (
                <li key={i}>
                  <NoteLine line={l} subject={l.evidence ? subjectLink(l.evidence) : undefined} />
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No weekly note yet. Claude writes one each week from your answers, and each line will link to the chart it
              rests on.
            </p>
          )}
        </section>

        <h1 id="readiness">
          Readiness <span className="gold">{m.overall[L]}</span>
          <span className="of"> / 1000</span> <em className={deltaClass(overallDelta)}>{signed(overallDelta)}</em>
        </h1>
        <div className="an-parts">
          {m.parts.map((p) => {
            const now = p.series[L];
            const prev = p.series[L - 1];
            const d = now !== null && prev !== null ? Math.round((now - prev) * 100) : null;
            return (
              <div key={p.key} className="an-part" title={PART_HINT[p.key]}>
                <span className="an-part-name">{PART_LABEL[p.key]}</span>
                <b>
                  {pct(now)} {d !== null && d !== 0 && <em className={deltaClass(d)}>{signed(d)}</em>}
                </b>
                <span className="ph-bar" aria-hidden="true">
                  <i style={{ width: `${(now ?? 0) * 100}%` }} />
                </span>
                <span className="an-part-hint">{PART_HINT[p.key]}</span>
                <Sparkline
                  values={p.series.map((v) => Math.round((v ?? 0) * 100))}
                  max={100}
                  label={`${PART_LABEL[p.key]} by week, ${RANGE_LABEL[range]}`}
                />
              </div>
            );
          })}
        </div>
      </section>

      <Story id="readiness-story" arrow={readinessLine.arrow} heading={readinessLine.text}>
        <span className="an-cap">Prelims readiness · {RANGE_LABEL[range]}</span>
        <LineChart
          values={m.overall}
          labels={m.labels}
          label={`Prelims readiness, ${RANGE_LABEL[range]}: from ${m.overall[0]} to ${m.overall[L]}`}
        />
        <div className="an-subjects">
          {m.subjectRows.map((s) => (
            <Link
              key={s.slug}
              className="an-subject"
              to={`/prelims/subject/${s.slug}`}
              style={{ "--subj": s.color, "--line-c": s.color } as React.CSSProperties}
            >
              <span className="ph-swatch" aria-hidden="true" />
              <span className="an-subject-name">{s.name}</span>
              <Sparkline values={s.series} label={`${s.name} readiness, ${RANGE_LABEL[range]}`} />
              <b>{s.score}</b>
              <em className={deltaClass(s.delta)}>{weekDelta(s.delta)}</em>
            </Link>
          ))}
        </div>
        <span className="an-foot">
          Readiness weighs each subject by its share of Prelims PYQs. Each subject's score is coverage × how well you
          know what you've covered (memory, new questions, speed and calibration).
        </span>
      </Story>

      {m.missSubject && m.misses.length > 0 && (
        <Story
          id="misses"
          arrow="down"
          heading={`${m.missSubject.name}: ${m.misses.length} ${m.misses.length === 1 ? "miss" : "misses"} this week.`}
        >
          {m.misses.slice(0, 3).map((a) => (
            <Miss key={a.id} a={a} item={m.items.get(a.itemId)} />
          ))}
          <Link className="an-more-link" to="/prelims/notebook">
            Open in the Mistake notebook →
          </Link>
        </Story>
      )}

      <Story id="speed" arrow={speedLine.arrow} heading={speedLine.text}>
        <Bars
          values={m.speed}
          labels={m.speedLabels}
          label={`Average time per question by week, ${RANGE_LABEL[range]}`}
          format={(v) => clock(v * 1000)}
          max={Math.max(PACE_MS / 1000, ...m.speed.map((v) => v ?? 0))}
        />
        <span className="an-foot">
          Average time per question, by week (the week starting on each date). Prelims pace is 72 seconds.
        </span>
      </Story>

      <Story id="calibration" arrow={calLine.arrow} heading={calLine.text}>
        <div className="an-cal">
          <div className="an-cal-bars">
            <Meter label="“Sure”" side={c.sure} />
            <Meter label="“Unsure”" side={c.unsure} />
            <span className="an-foot">MCQs locked in as sure or unsure, {RANGE_LABEL[range]}.</span>
          </div>
          <div className="an-rule">
            <span className="an-eyebrow">Your guessing rule</span>
            {c.unsureP === null ? (
              <b>Your rule appears after a few “unsure” answers.</b>
            ) : c.guessWorth! > 0 ? (
              <b>Answer your unsure ones.</b>
            ) : (
              <b>Leave unsure ones blank unless you can rule options out.</b>
            )}
            <span className="muted">
              {c.unsureP === null
                ? "A guess is worth 2.667p − 0.667 marks, where p is how often your unsure answers are right. It breaks even at p = 25%, a blind pick among four."
                : `Your “unsure” answers are right ${pct(c.unsureP)} of the time (p = ${c.unsureP.toFixed(2)}), so each is worth ${
                    c.guessWorth! >= 0 ? "+" : "−"
                  }${Math.abs(c.guessWorth!).toFixed(2)} marks on average after the −⅔ penalty. A guess breaks even at p = 25%, a blind pick among four; ruling out one option makes it ${guessValue(1 / 3) > 0 ? "+" : ""}${guessValue(1 / 3).toFixed(2)}.`}
            </span>
          </div>
        </div>
      </Story>

      <Story id="marks" arrow={marksLine.arrow} heading={marksLine.text}>
        <span className="an-cap">Where the marks are · questions per 100-question paper you're not ready for yet</span>
        <div className="an-marks">
          {m.marks.map((r) => (
            <Link
              key={r.group}
              className="an-mark"
              to={`/prelims/subject/${r.group}`}
              title={`${r.subject.name}: ${Math.round(r.share * 100)}% of Prelims PYQs, readiness ${r.score}; about ${r.open.toFixed(1)} questions a paper still open`}
              style={{ "--subj": r.subject.color } as React.CSSProperties}
            >
              <span className="an-mark-name">
                <span className="ph-swatch" aria-hidden="true" />
                {r.subject.name}
              </span>
              <span className="an-mark-bar" aria-hidden="true">
                <i style={{ width: `${(r.open / maxOpen) * 100}%` }} />
              </span>
              <b>{r.open.toFixed(1)}</b>
            </Link>
          ))}
        </div>
        <span className="an-foot">
          Each subject's share of Prelims PYQs × (1 − its readiness ÷ 1000), out of 100 questions.
        </span>
      </Story>

      <section className="an-folds" aria-label="More">
        <span className="an-eyebrow">More</span>
        <Fold
          id="effort"
          label="Effort"
          hint={`${m.perDay} a day · target ${m.target}`}
          open={open.has("effort")}
          onToggle={toggle}
        >
          <div className="an-effort">
            <Calendar
              days={m.effort}
              level={level}
              tip={(d) => `${shortDay(d.day)}: ${d.n} answered`}
              label={`Questions answered each day, ${RANGE_LABEL[range]}`}
            />
            <p>
              <b>{m.perDay}</b> questions a day on average · target <b>{m.target}</b> a day
            </p>
            <p className="an-foot">
              The target spreads the {m.left.unseen} questions you haven't answered yet and the {m.left.due} due now
              over the {m.daysLeft} days left to Prelims. Darker squares are days nearer or above it.
            </p>
          </div>
        </Fold>
        <Fold id="mocks" label="Mock tests" hint="from January" open={open.has("mocks")} onToggle={toggle}>
          <p className="an-mocks">
            Full mocks start in January. After three, this shows your score trend and a score range; until then there is
            no predicted score.
          </p>
        </Fold>
      </section>
    </article>
  );
}

function Story({ id, arrow, heading, children }: { id: string; arrow: string; heading: string; children: ReactNode }) {
  const mark = arrow === "up" ? "↑" : arrow === "down" ? "↓" : "→";
  return (
    <section className="an-story" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>
        <span className={`an-arrow ${arrow}`} aria-hidden="true">
          {mark}
        </span>{" "}
        {heading}
      </h2>
      <div className="an-panel">{children}</div>
    </section>
  );
}

function Fold(p: {
  id: string;
  label: string;
  hint: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="an-fold" id={p.id}>
      <button type="button" aria-expanded={p.open} onClick={() => p.onToggle(p.id)}>
        <span>{p.label}</span>
        <span className="muted">{p.hint}</span>
      </button>
      {p.open && <div className="an-fold-body">{p.children}</div>}
    </div>
  );
}

function Meter({ label, side }: { label: string; side: { n: number; right: number } }) {
  const p = side.n ? side.right / side.n : null;
  return (
    <div className="an-meter">
      <div>
        <span>{label}</span>
        <span>{p === null ? "no answers" : `${pct(p)} right · ${side.right} of ${side.n}`}</span>
      </div>
      <span className="an-meter-bar" aria-hidden="true">
        <i style={{ width: `${(p ?? 0) * 100}%` }} />
      </span>
    </div>
  );
}

const cut = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function Miss({ a, item }: { a: Attempt; item?: Item }) {
  const src =
    item?.source.type === "pyq"
      ? `Prelims ${item.source.year} PYQ`
      : item?.kind === "flashcard"
        ? "Flashcard"
        : "Practice question";
  let yours = "—",
    right = "";
  if (item?.kind === "mcq") {
    yours = a.chosen !== undefined && item.options[a.chosen] ? cut(item.options[a.chosen]) : "No answer";
    right = cut(item.options[item.answer]);
  } else if (item?.kind === "flashcard") {
    yours = a.typed ? cut(a.typed) : "Forgot";
    right = cut(item.back);
  }
  return (
    <div className="an-miss">
      <span className="muted">{shortDay(new Date(a.at).toLocaleDateString("en-CA"))}</span>
      <b>{src}</b>
      <span>
        <span className="an-bad">{yours}</span> → <span className="an-good">{right}</span>
      </span>
    </div>
  );
}

function NoteLine({ line, subject }: { line: WeekNoteLine; subject?: { slug: string } }) {
  const ev = line.evidence?.toLowerCase();
  if (ev && SECTIONS.includes(ev)) return <a href={`#${ev === "readiness" ? "readiness-story" : ev}`}>{line.text}</a>;
  if (subject) return <Link to={`/prelims/subject/${subject.slug}`}>{line.text}</Link>;
  return <>{line.text}</>;
}
