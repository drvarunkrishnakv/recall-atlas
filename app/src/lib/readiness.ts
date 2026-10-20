// Readiness and the other numbers on the Prelims Home, the subject page and Analytics (M11).
// Pure and deterministic: everything is worked out from the banks and the attempt log at a given
// moment, and nothing is stored. The weights and why: DECISIONS (2026-10-21, "Readiness").
//
// Readiness (0–1000) for any group of items (a subject, a topic's bank, a microtheme):
//   coverage     share of the group's servable MCQs and flashcards you have answered at least once
//   memory       FSRS retrievability now, averaged over the items you have answered
//   new questions share of MCQs you got right the first time you met them
//   speed        share of recent MCQ answers given within Prelims pace (72 s)
//   calibration  share of recent "sure" MCQ answers that were right
//   readiness = 1000 × coverage × (weighted mean of the other four)
// Coverage multiplies rather than adds: you can't be ready on questions you haven't met, so a
// handful of perfect answers can't make a subject look ready. A part with no evidence yet (no
// "sure" answers, say) is left out and the others share its weight.
import {
  GRADE_LABEL,
  servable,
  WRONG_GRADES,
  type Attempt,
  type Bank,
  type Grade,
  type Item,
  type ItemKind,
} from "./practice.ts";
import { isDue, nextReviewState, retrievability, type ReviewState } from "./srs.ts";

/** UPSC's GS paper is 100 questions in 120 minutes: 72 seconds a question. */
export const PACE_MS = 72_000;

/**
 * Speed, calibration, recall and average time read your last four weeks of answers: habits
 * change, and four weeks is the shortest range Analytics offers, so a habit you've dropped stops
 * counting within a month.
 */
export const RECENT_DAYS = 28;

/** The fewest answers before a microtheme can be called weak: one slip is chance, three show a pattern. */
export const MIN_WEAK_ATTEMPTS = 3;

/** The chosen subject-page design shows the last 14 days in the analytics drawer. */
export const STRIP_DAYS = 14;

/**
 * How the four quality parts are weighed (DECISIONS 2026-10-21). Knowledge carries 70%, split
 * evenly between memory (what you learnt stays) and new questions (it transfers to questions you
 * haven't seen, which is what the paper asks). Pace and calibration carry 15% each: they decide
 * whether knowledge turns into marks (finishing 100 questions in 120 minutes; not losing a third
 * of a question's marks on confident misses).
 */
export const WEIGHTS = { memory: 0.35, firstTry: 0.35, speed: 0.15, calibration: 0.15 } as const;

export type PartKey = "coverage" | "memory" | "firstTry" | "speed" | "calibration";
export const PART_KEYS: readonly PartKey[] = ["coverage", "memory", "firstTry", "speed", "calibration"];
export const PART_LABEL: Record<PartKey, string> = {
  coverage: "Coverage",
  memory: "Memory",
  firstTry: "New questions",
  speed: "Speed",
  calibration: "Calibration",
};
export const PART_HINT: Record<PartKey, string> = {
  coverage: "questions answered at least once",
  memory: "predicted recall today of what you've answered",
  firstTry: "right the first time you met them",
  speed: "answered within 72 seconds, last 4 weeks",
  calibration: '"sure" answers right, last 4 weeks',
};

/** Each part as a share (0–1), or null when there is no evidence for it yet. */
export type Parts = Record<PartKey, number | null>;

export interface Readiness {
  /** 0–1000. */
  score: number;
  parts: Parts;
  /** Servable MCQs and flashcards answered at least once, and in all. */
  seen: number;
  total: number;
}

const DAY_MS = 864e5;
const REVIEWED: readonly ItemKind[] = ["mcq", "flashcard"];

/** The items readiness counts: servable MCQs and flashcards (puzzles are an endless stream outside FSRS). */
export const counted = (item: Item) => REVIEWED.includes(item.kind) && servable(item);

/** Combines the parts into 0–1000 (see the top of this file). */
export function combine(p: Parts): number {
  if (!p.coverage) return 0;
  let sum = 0,
    weight = 0;
  for (const k of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const v = p[k];
    if (v === null) continue;
    sum += WEIGHTS[k] * v;
    weight += WEIGHTS[k];
  }
  return weight ? Math.round(1000 * p.coverage * (sum / weight)) : 0;
}

interface Tally {
  seen: number;
  recall: number;
  first: number;
  firstRight: number;
  timed: number;
  inPace: number;
  sure: number;
  sureRight: number;
}
const emptyTally = (): Tally => ({
  seen: 0,
  recall: 0,
  first: 0,
  firstRight: 0,
  timed: 0,
  inPace: 0,
  sure: 0,
  sureRight: 0,
});

function toReadiness(total: number, t: Tally | undefined): Readiness {
  const x = t ?? emptyTally();
  const parts: Parts = {
    coverage: total ? x.seen / total : null,
    memory: x.seen ? x.recall / x.seen : null,
    firstTry: x.first ? x.firstRight / x.first : null,
    speed: x.timed ? x.inPace / x.timed : null,
    calibration: x.sure ? x.sureRight / x.sure : null,
  };
  return { score: combine(parts), parts, seen: x.seen, total };
}

/**
 * Readiness of every group at each of `times`, in one pass over the log. `groupsOf` names the
 * groups an item belongs to (its subject, its bank, its microtheme…). Groups with no counted items
 * are absent. Only answers made at or before each time count.
 */
export function readinessOver(
  banks: Bank[],
  attempts: Attempt[],
  times: Date[],
  groupsOf: (item: Item, bank: Bank) => string[],
): Map<string, Readiness>[] {
  const groups = new Map<string, string[]>();
  const totals = new Map<string, number>();
  for (const b of banks)
    for (const it of b.items) {
      if (!counted(it)) continue;
      const gs = groupsOf(it, b);
      groups.set(it.id, gs);
      for (const g of gs) totals.set(g, (totals.get(g) ?? 0) + 1);
    }
  const log = attempts.filter((a) => groups.has(a.itemId)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const order = times.map((t, i) => [t.getTime(), i] as const).sort((a, b) => a[0] - b[0]);
  const out: Map<string, Readiness>[] = new Array(times.length);
  const states = new Map<string, ReviewState>();
  const first = new Map<string, boolean>();
  let next = 0,
    from = 0;
  for (const [t, idx] of order) {
    for (; next < log.length && Date.parse(log[next].at) <= t; next++) {
      const a = log[next];
      states.set(a.itemId, nextReviewState(states.get(a.itemId), a));
      if (a.kind === "mcq" && !first.has(a.itemId)) first.set(a.itemId, a.correct);
    }
    while (from < next && Date.parse(log[from].at) <= t - RECENT_DAYS * DAY_MS) from++;
    const tallies = new Map<string, Tally>();
    const tally = (g: string) => {
      let x = tallies.get(g);
      if (!x) tallies.set(g, (x = emptyTally()));
      return x;
    };
    const at = new Date(t);
    for (const [id, s] of states) {
      const r = retrievability(s, at);
      for (const g of groups.get(id)!) {
        const x = tally(g);
        x.seen++;
        x.recall += r;
      }
    }
    for (const [id, right] of first)
      for (const g of groups.get(id)!) {
        const x = tally(g);
        x.first++;
        if (right) x.firstRight++;
      }
    for (let k = from; k < next; k++) {
      const a = log[k];
      if (a.kind !== "mcq") continue;
      for (const g of groups.get(a.itemId)!) {
        const x = tally(g);
        x.timed++;
        if (a.ms <= PACE_MS) x.inPace++;
        if (a.sure === true) {
          x.sure++;
          if (a.correct) x.sureRight++;
        }
      }
    }
    const snap = new Map<string, Readiness>();
    for (const [g, total] of totals) snap.set(g, toReadiness(total, tallies.get(g)));
    out[idx] = snap;
  }
  return out;
}

/** `now` and the same moment 1, 2, … `weeks` weeks earlier, oldest first. */
export function weekPoints(now: Date, weeks: number): Date[] {
  return Array.from({ length: weeks + 1 }, (_, i) => new Date(now.getTime() - (weeks - i) * 7 * DAY_MS));
}

/** Whole weeks between the first answer and `now` (at least 1), for the "All time" range. */
export function weeksSince(attempts: Attempt[], now: Date): number {
  const first = Math.min(...attempts.map((a) => Date.parse(a.at)));
  return Number.isFinite(first) ? Math.max(1, Math.ceil((now.getTime() - first) / (7 * DAY_MS))) : 1;
}

// ---------- Prelims PYQs and where the marks are ----------

// Only the questions themselves: M10's true-or-false puzzles are cut from PYQ statements and
// carry a PYQ source, but they aren't extra questions Prelims asked.
const isPyq = (i: Item) => i.kind === "mcq" && i.source.type === "pyq" && i.source.paper === "GS1";

/** How often Prelims asked a set of items: GS paper PYQs (checked key or not) and the last year asked. */
export function pyqStats(items: Item[]): { count: number; lastYear?: number } {
  let count = 0,
    lastYear: number | undefined;
  for (const i of items)
    if (isPyq(i) && i.source.type === "pyq") {
      count++;
      lastYear = Math.max(lastYear ?? 0, i.source.year);
    }
  return { count, lastYear };
}

/**
 * Each group's share of all Prelims PYQs in the banks (its PYQ count over all PYQs). With no PYQs
 * at all, groups share by their number of counted items instead, so the overall score still means
 * something on made-up content.
 */
export function pyqShares(banks: Bank[], groupOf: (bank: Bank) => string): Map<string, number> {
  const pyqs = new Map<string, number>();
  const items = new Map<string, number>();
  for (const b of banks) {
    const g = groupOf(b);
    pyqs.set(g, (pyqs.get(g) ?? 0) + b.items.filter(isPyq).length);
    items.set(g, (items.get(g) ?? 0) + b.items.filter(counted).length);
  }
  const base = [...pyqs.values()].some((n) => n > 0) ? pyqs : items;
  const all = [...base.values()].reduce((s, n) => s + n, 0);
  return new Map([...base].map(([g, n]) => [g, all ? n / all : 0]));
}

/** Prelims readiness: each subject's readiness weighted by its share of the paper. */
export function overallScore(scores: Map<string, number>, shares: Map<string, number>): number {
  let sum = 0;
  for (const [g, share] of shares) sum += share * (scores.get(g) ?? 0);
  return Math.round(sum);
}

export interface MarksRow {
  group: string;
  share: number;
  score: number;
  /** Questions in a 100-question paper from this subject that you aren't ready for yet. */
  open: number;
}

/** "Where the marks are": share of Prelims PYQs × (1 − readiness / 1000), per 100-question paper, most first. */
export function whereTheMarksAre(shares: Map<string, number>, scores: Map<string, number>): MarksRow[] {
  return [...shares]
    .filter(([, share]) => share > 0)
    .map(([group, share]) => {
      const score = scores.get(group) ?? 0;
      return { group, share, score, open: 100 * share * (1 - score / 1000) };
    })
    .sort((a, b) => b.open - a.open || a.group.localeCompare(b.group));
}

// ---------- Calibration and the guessing rule ----------

/**
 * Marks a guess is worth on average when it's right with chance p: +2 if right, −⅔ if wrong
 * (UPSC takes a third of the question's two marks), so 2p − ⅔(1 − p) = 2.667p − 0.667.
 */
export const guessValue = (p: number) => (8 / 3) * p - 2 / 3;
/** Where a guess stops costing marks: 2.667p − 0.667 = 0 at p = 0.25, a blind pick among four options. */
export const BREAK_EVEN = 0.25;

export interface Calibration {
  sure: { n: number; right: number };
  unsure: { n: number; right: number };
  /** Accuracy of your "unsure" answers: your own p for a guess. */
  unsureP: number | null;
  sureP: number | null;
  /** Marks per "unsure" answer on average, after the penalty. */
  guessWorth: number | null;
  /** "Sure" answers that were wrong. */
  confidentMisses: number;
}

/** Sure vs unsure accuracy on MCQs answered in [from, to). */
export function calibration(attempts: Attempt[], from: number, to: number): Calibration {
  const c = { sure: { n: 0, right: 0 }, unsure: { n: 0, right: 0 } };
  for (const a of attempts) {
    if (a.kind !== "mcq" || a.sure === undefined) continue;
    const t = Date.parse(a.at);
    if (t < from || t >= to) continue;
    const side = a.sure ? c.sure : c.unsure;
    side.n++;
    if (a.correct) side.right++;
  }
  const unsureP = c.unsure.n ? c.unsure.right / c.unsure.n : null;
  return {
    ...c,
    unsureP,
    sureP: c.sure.n ? c.sure.right / c.sure.n : null,
    guessWorth: unsureP === null ? null : guessValue(unsureP),
    confidentMisses: c.sure.n - c.sure.right,
  };
}

// ---------- Effort and the daily target ----------

const dayNum = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / DAY_MS;
const fromNum = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
/** The calendar day `n` days after `day` (both "YYYY-MM-DD"). */
export const addDays = (day: string, n: number) => fromNum(dayNum(day) + n);

/**
 * Questions a day to be through everything by Prelims. Every servable MCQ and flashcard you
 * haven't answered yet, plus the reviews due now, spread evenly over the days left until
 * 23 May 2027 (today counts; the exam day doesn't). Reviews that fall due later aren't counted:
 * FSRS only knows them once you answer, so the target is recomputed every day from the log.
 */
export function dailyTarget(unseen: number, due: number, daysLeft: number): number {
  return Math.ceil((unseen + due) / Math.max(1, daysLeft));
}

/** The servable MCQs and flashcards not answered yet, and those due for review now. */
export function workLeft(banks: Bank[], states: Map<string, ReviewState>, now = new Date()) {
  let unseen = 0,
    due = 0;
  for (const b of banks)
    for (const i of b.items) {
      if (!counted(i)) continue;
      const s = states.get(i.id);
      if (!s) unseen++;
      else if (isDue(s, now)) due++;
    }
  return { unseen, due };
}

/** MCQs and flashcards answered on each day from `from` to `to` (inclusive), from the day files. */
export function effortByDay(
  days: Record<string, Attempt[]>,
  from: string,
  to: string,
  keep: (a: Attempt) => boolean = (a) => REVIEWED.includes(a.kind),
): { day: string; n: number; right: number }[] {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const list = (days[d] ?? []).filter(keep);
    out.push({ day: d, n: list.length, right: list.filter((a) => a.correct).length });
  }
  return out;
}

// ---------- Speed ----------

/** Average seconds per MCQ in each week ending at `points[i]` (the 7 days before it), or null. */
export function speedByWeek(attempts: Attempt[], points: Date[]): (number | null)[] {
  return points.map((p) => {
    const to = p.getTime(),
      from = to - 7 * DAY_MS;
    const ms = attempts
      .filter((a) => a.kind === "mcq" && Date.parse(a.at) > from && Date.parse(a.at) <= to)
      .map((a) => a.ms);
    return ms.length ? ms.reduce((s, x) => s + x, 0) / ms.length / 1000 : null;
  });
}

// ---------- Weak spots, traps and the drawer ----------

export interface WeakSpot {
  microtheme: string;
  /** All answers on its items, and its items answered at least once. */
  attempts: number;
  answered: number;
  /** Items whose latest answer was right. */
  rightLast: number;
}

/**
 * Microthemes you're weak on: at least MIN_WEAK_ATTEMPTS answers and at least one item whose
 * latest answer was wrong, weakest first (fewest items right last time, then most answers). Judged
 * on each item's latest answer, so a miss you've since fixed no longer counts.
 */
export function weakSpots(items: Item[], attempts: Attempt[]): WeakSpot[] {
  const theme = new Map(items.filter((i) => i.microtheme).map((i) => [i.id, i.microtheme!]));
  const latest = new Map<string, Attempt>();
  const count = new Map<string, number>();
  for (const a of attempts) {
    const m = theme.get(a.itemId);
    if (!m) continue;
    count.set(m, (count.get(m) ?? 0) + 1);
    const cur = latest.get(a.itemId);
    if (!cur || Date.parse(a.at) >= Date.parse(cur.at)) latest.set(a.itemId, a);
  }
  const by = new Map<string, WeakSpot>();
  for (const [id, a] of latest) {
    const m = theme.get(id)!;
    const w = by.get(m) ?? { microtheme: m, attempts: count.get(m) ?? 0, answered: 0, rightLast: 0 };
    w.answered++;
    if (a.correct) w.rightLast++;
    by.set(m, w);
  }
  return [...by.values()]
    .filter((w) => w.attempts >= MIN_WEAK_ATTEMPTS && w.rightLast < w.answered)
    .sort(
      (a, b) =>
        a.rightLast / a.answered - b.rightLast / b.answered ||
        b.attempts - a.attempts ||
        a.microtheme.localeCompare(b.microtheme),
    );
}

/** The commonest miss reasons you chose on wrong answers, most first. */
export function traps(attempts: Attempt[]): { grade: Grade; label: string; n: number }[] {
  const n = new Map<Grade, number>();
  for (const a of attempts)
    if (!a.correct && a.grade && (WRONG_GRADES as readonly string[]).includes(a.grade))
      n.set(a.grade, (n.get(a.grade) ?? 0) + 1);
  return [...n]
    .map(([grade, k]) => ({ grade, label: GRADE_LABEL[grade], n: k }))
    .sort(
      (a, b) =>
        b.n - a.n ||
        (WRONG_GRADES as readonly string[]).indexOf(a.grade) - (WRONG_GRADES as readonly string[]).indexOf(b.grade),
    );
}

export interface KindStats {
  total: number;
  pyqs: number;
  due: number;
  fresh: number;
  /** Share right over the last RECENT_DAYS, with how many answers that rests on. */
  recall: number | null;
  recent: number;
  /** Average time per answer over the last RECENT_DAYS, in ms. */
  avgMs: number | null;
  /** Answers on each of the last STRIP_DAYS days, oldest first. */
  strip: { day: string; n: number; right: number }[];
  weak: WeakSpot[];
  traps: { grade: Grade; label: string; n: number }[];
}

/** The analytics drawer for one topic's MCQs or flashcards. */
export function kindStats(
  bank: Bank,
  kind: "mcq" | "flashcard",
  days: Record<string, Attempt[]>,
  states: Map<string, ReviewState>,
  now: Date,
  today: string,
): KindStats {
  const items = bank.items.filter((i) => i.kind === kind && servable(i));
  const ids = new Set(items.map((i) => i.id));
  const mine = (a: Attempt) => a.bank === bank.id && a.kind === kind && ids.has(a.itemId);
  const all = Object.values(days).flat().filter(mine);
  const recentFrom = now.getTime() - RECENT_DAYS * DAY_MS;
  const recent = all.filter((a) => Date.parse(a.at) > recentFrom && Date.parse(a.at) <= now.getTime());
  let due = 0,
    fresh = 0;
  for (const i of items) {
    const s = states.get(i.id);
    if (!s) fresh++;
    else if (isDue(s, now)) due++;
  }
  return {
    total: items.length,
    pyqs: pyqStats(items).count,
    due,
    fresh,
    recall: recent.length ? recent.filter((a) => a.correct).length / recent.length : null,
    recent: recent.length,
    avgMs: recent.length ? recent.reduce((s, a) => s + a.ms, 0) / recent.length : null,
    strip: effortByDay(days, addDays(today, 1 - STRIP_DAYS), today, mine),
    weak: weakSpots(items, all),
    traps: traps(all),
  };
}

/** "0:54" for a time in ms. */
export function clock(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
