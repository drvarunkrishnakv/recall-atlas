// The news heat map: which stories were in the news each month, how much (coverage) and how
// much they matter for the exam (weight), each 0–4. Built from the news alone, before any past
// paper is opened, so it can later be compared with what UPSC asked. Stored as one JSON value
// (`content/heatmap.json`, Firestore `heatmap/current`); the app only reads it, and Claude's
// CLI imports it (`atlas heatmap-import`).

export const AREAS = ["polity", "governance", "social", "economy", "ir", "security", "env", "st", "culture"] as const;
export type Area = (typeof AREAS)[number];

export const AREA_LABEL: Record<Area, string> = {
  polity: "Polity",
  governance: "Governance",
  social: "Society and social justice",
  economy: "Economy",
  ir: "International relations",
  security: "Security",
  env: "Environment and disasters",
  st: "Science and tech",
  culture: "History and culture",
};

export interface HeatSource {
  label: string;
  url: string;
}
export interface HeatEvent {
  /** YYYY-MM-DD. */
  date: string;
  text: string;
  sources: HeatSource[];
}
/** One story in one month. */
export interface HeatCell {
  /** How much the news covered it, 0–4, whatever its exam value. */
  coverage: number;
  /** How much it matters for the exam, 0–4, judged without past papers. */
  weight: number;
  summary: string;
  events: HeatEvent[];
}
export interface HeatStory {
  id: string;
  name: string;
  /** A shorter name for chart labels. */
  short?: string;
  area: Area;
  /** Atlas notes on this story (note ids). */
  notes?: string[];
  /** YYYY-MM → that month's cell; months it was quiet are left out. */
  months: Record<string, HeatCell>;
}
export interface PrelimsItem {
  month: string;
  kind: string;
  name: string;
  text: string;
  date: string;
  sources: HeatSource[];
}
export interface ExamMark {
  /** YYYY-MM-DD the exam began. */
  date: string;
  kind: "prelims" | "mains";
}
export interface HeatMap {
  /** First and last month, YYYY-MM. */
  from: string;
  to: string;
  /** When it was built, and when it was frozen (no changes after this, until the comparison). */
  builtAt: string;
  frozenAt?: string;
  /** How it was made, in a sentence or two. */
  method: string;
  /** A note on a month covered only in part, e.g. "October 2026 covers 1–18 October". */
  partial?: string;
  exams: ExamMark[];
  stories: HeatStory[];
  prelims: PrelimsItem[];
}

export type Measure = "coverage" | "weight";
export const LEVEL_LABEL = ["Quiet", "Low", "Medium", "High", "Very high"];

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Every month from `from` to `to`, inclusive, as YYYY-MM. */
export function monthRange(from: string, to: string): string[] {
  const a = MONTH.exec(from),
    b = MONTH.exec(to);
  if (!a || !b) return [];
  const out: string[] = [];
  for (let y = +a[1], m = +a[2]; y < +b[1] || (y === +b[1] && m <= +b[2]); m === 12 ? (y++, (m = 1)) : m++)
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  return out;
}

/** "May 2025". */
export const monthLabel = (m: string) => `${MONTH_NAMES[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
/** "7 May" from YYYY-MM-DD. */
export const dayLabel = (d: string) => `${+d.slice(8, 10)} ${MONTH_NAMES[+d.slice(5, 7) - 1]}`;

/** A story's level in each month, 0 where it was quiet. */
export const seriesOf = (story: HeatStory, months: string[], measure: Measure) =>
  months.map((m) => story.months[m]?.[measure] ?? 0);

/** A month counts as hot at medium heat or above. */
export const HOT = 2;
/** Where the chart splits long from brief (months hot) and loud from quiet (peak). */
export const CUTS = { hot: 6, peak: 3 };

export interface StoryStats {
  /** Months at medium heat or above. */
  hot: number;
  /** Months it was in the news at all. */
  active: number;
  /**
   * How loud at its peak: the mean of its three hottest months among those at medium or above
   * (fewer if it was hot less often), so a quiet tail doesn't drag a spike down. A story that was
   * never hot takes its highest month.
   */
  peak: number;
  /** Index of the first and last hot month, or -1. */
  first: number;
  last: number;
}

export function storyStats(series: number[]): StoryStats {
  const on = series.filter((v) => v > 0).sort((a, b) => b - a);
  const hotTop = on.filter((v) => v >= HOT).slice(0, 3);
  const top = hotTop.length ? hotTop : on.slice(0, 1);
  let first = -1,
    last = -1;
  series.forEach((v, i) => {
    if (v >= HOT) {
      if (first < 0) first = i;
      last = i;
    }
  });
  return {
    hot: series.filter((v) => v >= HOT).length,
    active: on.length,
    peak: top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0,
    first,
    last,
  };
}

export type Quadrant = "long-loud" | "brief-loud" | "slow" | "background";
export const QUADRANT_LABEL: Record<Quadrant, string> = {
  "long-loud": "Long and loud",
  "brief-loud": "Loud but brief",
  slow: "Slow burner",
  background: "Background",
};
export const QUADRANT_BLURB: Record<Quadrant, string> = {
  "long-loud":
    "Stayed hot for many months and got very loud. The comparison will show whether UPSC leans on stories like this.",
  "brief-loud":
    "A short, sharp spike. The comparison will show whether one big month is enough for UPSC to ask about it.",
  slow: "Never the loudest, but it kept coming back. Policy stories often look like this.",
  background: "Covered now and then, never for long.",
};

/** What a corner's stories are like, without the comparison's promise. */
export const QUADRANT_TRAIT: Record<Quadrant, string> = {
  "long-loud": "Stayed hot for many months and got very loud.",
  "brief-loud": "A short, sharp spike.",
  slow: "Never the loudest, but it kept coming back.",
  background: "Covered now and then, never for long.",
};

export function quadrantOf(s: Pick<StoryStats, "hot" | "peak">): Quadrant {
  const long = s.hot >= CUTS.hot,
    loud = s.peak >= CUTS.peak;
  return long ? (loud ? "long-loud" : "slow") : loud ? "brief-loud" : "background";
}

const ID = /^[a-z0-9][a-z0-9-]{0,60}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const level = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 4;
const goodSources = (list: unknown) =>
  Array.isArray(list) &&
  list.every(
    (s) =>
      typeof (s as HeatSource)?.label === "string" &&
      !!(s as HeatSource).label.trim() &&
      /^https?:\/\/\S+$/.test(String((s as HeatSource)?.url)),
  );

/** What's wrong with a heat map before it's imported; empty when it's fine. */
export function heatMapProblems(map: HeatMap): string[] {
  const out: string[] = [];
  const months = monthRange(map.from, map.to);
  if (!months.length) out.push(`Bad range ${map.from} to ${map.to}`);
  const inRange = new Set(months);
  const ids = new Set<string>();
  for (const s of map.stories ?? []) {
    const at = `Story ${s.id}`;
    if (!ID.test(s.id ?? "")) out.push(`${at}: bad id`);
    if (ids.has(s.id)) out.push(`${at}: duplicate id`);
    ids.add(s.id);
    if (!s.name?.trim()) out.push(`${at}: no name`);
    if (!AREAS.includes(s.area)) out.push(`${at}: unknown area ${s.area}`);
    for (const [m, c] of Object.entries(s.months ?? {})) {
      if (!inRange.has(m)) out.push(`${at}: month ${m} is outside the range`);
      if (!level(c.coverage) || !level(c.weight)) out.push(`${at} ${m}: levels must be whole numbers 0–4`);
      for (const e of c.events ?? []) {
        if (!DAY.test(e.date ?? "") || !e.text?.trim()) out.push(`${at} ${m}: an event needs a date and text`);
        if (!goodSources(e.sources) || !e.sources.length) out.push(`${at} ${m}: an event needs http(s) sources`);
      }
    }
  }
  for (const p of map.prelims ?? [])
    if (!inRange.has(p.month) || !p.name?.trim() || !goodSources(p.sources))
      out.push(`Prelims item ${p.name}: needs a month in range, a name and http(s) sources`);
  for (const e of map.exams ?? [])
    if (!DAY.test(e.date ?? "") || (e.kind !== "prelims" && e.kind !== "mains")) out.push(`Bad exam mark ${e.date}`);
  return out;
}

// ---------- The comparison with past papers ----------
// Made after the map was frozen: each question of the 2025 and 2026 papers matched to a story
// (or a Prelims item) in the news before its paper was set. Kept beside the map
// (`content/heatmap-questions.json`, Firestore `heatmap/questions`); the map itself never changes.

export type Strength = "direct" | "related" | "none";
export const STRENGTH_LABEL: Record<Strength, string> = {
  direct: "Asked about it",
  related: "Drew on it",
  none: "No news link",
};

export interface PaperQuestion {
  id: string;
  /** An ExamPaper id, e.g. "prelims-2025". */
  exam: string;
  paper: string;
  n: string;
  text: string;
  /** The subject in a few words. */
  gist: string;
  strength: Strength;
  story: string | null;
  /** A Prelims item, as "P012" (its index in the map's list). */
  prelims: string | null;
  also: string[];
  /** The months of news it drew on. */
  months: string[];
  /** It rests on news the map can't hold (before January 2024, or missed). */
  outsideMap: boolean;
  why: string;
}

export interface ExamPaper {
  id: string;
  label: string;
  date: string;
  /** The last month of news that counts for it, YYYY-MM. */
  cutoff: string;
}

export interface CornerRow {
  measure: Measure;
  corner: Quadrant;
  /** Story–exam pairs in this corner, from the news before each exam. */
  stories: number;
  /** How many of them got at least one question. */
  asked: number;
}

export interface Comparison {
  madeAt: string;
  /** The frozen map it was made against. */
  frozenAt: string;
  exams: ExamPaper[];
  questions: PaperQuestion[];
  findings: {
    byExam: { exam: string; total: number; direct: number; related: number; none: number; outside: number }[];
    corners: CornerRow[];
    /** Questions by how many months before the exam their story peaked, in buckets like "0–2". */
    lag: { label: string; questions: number }[];
    /** Claude's conclusions, a sentence or two each. */
    summary: string[];
  };
}

/** Story id → the questions that asked about it or drew on it (as the main story or another). */
export function questionsByStory(c: Comparison): Map<string, PaperQuestion[]> {
  const out = new Map<string, PaperQuestion[]>();
  for (const q of c.questions) {
    if (q.strength === "none") continue;
    for (const id of new Set([q.story, ...q.also].filter((x): x is string => !!x)))
      out.set(id, [...(out.get(id) ?? []), q]);
  }
  return out;
}

/** What's wrong with a comparison before it's imported against `map`; empty when it's fine. */
export function comparisonProblems(c: Comparison, map: HeatMap): string[] {
  const out: string[] = [];
  if (!map.frozenAt) out.push("Freeze the heat map before importing a comparison");
  else if (c.frozenAt !== map.frozenAt) out.push(`Made against the map frozen ${c.frozenAt}, not ${map.frozenAt}`);
  const stories = new Set(map.stories.map((s) => s.id));
  const exams = new Set(c.exams.map((e) => e.id));
  for (const e of c.exams)
    if (!DAY.test(e.date) || !MONTH.test(e.cutoff) || !e.label?.trim())
      out.push(`Exam ${e.id}: bad date, cutoff or label`);
  const ids = new Set<string>();
  for (const q of c.questions) {
    const at = `Question ${q.id}`;
    if (ids.has(q.id)) out.push(`${at}: duplicate id`);
    ids.add(q.id);
    if (!exams.has(q.exam)) out.push(`${at}: unknown exam ${q.exam}`);
    if (!["direct", "related", "none"].includes(q.strength)) out.push(`${at}: bad strength ${q.strength}`);
    for (const id of [q.story, ...(q.also ?? [])]) if (id && !stories.has(id)) out.push(`${at}: no story ${id}`);
    const p = q.prelims ? /^P(\d{3})$/.exec(q.prelims) : null;
    if (q.prelims && (!p || +p[1] >= map.prelims.length)) out.push(`${at}: no Prelims item ${q.prelims}`);
    if (q.strength !== "none" && !q.story && !q.prelims) out.push(`${at}: linked to nothing`);
    const cutoff = c.exams.find((e) => e.id === q.exam)?.cutoff ?? "";
    if ((q.months ?? []).some((m) => !MONTH.test(m) || m > cutoff)) out.push(`${at}: a month after its exam's cutoff`);
  }
  return out;
}
