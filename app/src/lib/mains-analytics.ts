// The numbers behind the Mains Home and Mains Analytics (M11): worked out on the device from your
// answers and Claude's marking (lib/mains.ts), your notes and their proposals, and the exam dates
// (lib/exam.ts). Pure, so the app, the CLI's `week-data` and the tests share them. Nothing is
// predicted until you have sat two full papers (DECISIONS 2026-10-21).
import { CHECKLIST, headline, minutesFor, monthName, monthOf, fmtMarks, clock } from "./mains.ts";
import type { ChecklistKey, MainsAnswer, MainsPaper } from "./mains.ts";
import { daysUntil, MAINS_2027, PRELIMS_2027 } from "./exam.ts";
import { today as dayOf } from "./progress.ts";
import type { Capture } from "./progress.ts";
import type { Proposal } from "./proposals.ts";
import type { StoredThread } from "./threads.ts";

const DAY_MS = 864e5;
const WEEK_MS = 7 * DAY_MS;

// ---------- Papers ----------

export type PaperKey = "gs1" | "gs2" | "gs3" | "gs4" | "essay" | "medical";

export interface PaperGroup {
  key: PaperKey;
  name: string;
  /** Two letters for the tile. */
  code: string;
  /** What the paper covers, in a line. */
  covers: string;
  /** The answer papers it is made of (Medical Science is the optional's two papers). */
  papers: MainsPaper[];
  marks: number;
  /** The paper's colour on the chosen mocks (the same as the Mains Notes tabs). */
  color: string;
}

/**
 * UPSC's scheme for the written Mains that counts for merit (CSE notification): the Essay, GS I–IV
 * and the optional's Paper I and Paper II, 250 marks each, 1,750 in all. The optional here is
 * Medical Science, so its two papers make one 500-mark tile.
 */
export const PAPER_MARKS = 250;
export const PAPER_GROUPS: PaperGroup[] = [
  {
    key: "gs1",
    name: "GS1",
    code: "G1",
    covers: "History, Geography, Society",
    papers: ["GS1"],
    marks: 250,
    color: "#a86fd0",
  },
  {
    key: "gs2",
    name: "GS2",
    code: "G2",
    covers: "Polity, Governance, IR, Social Justice",
    papers: ["GS2"],
    marks: 250,
    color: "#7c7cf0",
  },
  {
    key: "gs3",
    name: "GS3",
    code: "G3",
    covers: "Economy, Environment, S&T, Security",
    papers: ["GS3"],
    marks: 250,
    color: "#e7a52c",
  },
  {
    key: "gs4",
    name: "GS4",
    code: "G4",
    covers: "Ethics and case studies",
    papers: ["GS4"],
    marks: 250,
    color: "#23a597",
  },
  {
    key: "essay",
    name: "Essay",
    code: "Es",
    covers: "Two essays, 125 marks each",
    papers: ["Essay"],
    marks: 250,
    color: "#d9699b",
  },
  {
    key: "medical",
    name: "Medical Science",
    code: "Md",
    covers: "Optional · Paper I and Paper II",
    papers: ["Med1", "Med2"],
    marks: 500,
    color: "#ee7a59",
  },
];
export const WRITTEN_MARKS = PAPER_GROUPS.reduce((n, g) => n + g.marks, 0);
export const groupOf = (paper: MainsPaper) => PAPER_GROUPS.find((g) => g.papers.includes(paper))!;

// ---------- Answers ----------

/** When an answer was written: sent, or (a draft) started. */
export const writtenAt = (a: MainsAnswer) => Date.parse(a.submittedAt ?? a.createdAt);
const isSent = (a: MainsAnswer) => !!a.submittedAt;
const isMarked = (a: MainsAnswer) => !!a.marking;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null);
/** One decimal, always shown: "6.0", "5.4". */
export const one = (n: number) => round1(n).toFixed(1);

/** Answers sent on a local day ("YYYY-MM-DD"). */
export const sentOn = (all: MainsAnswer[], day: string) =>
  all.filter((a) => isSent(a) && dayOf(new Date(writtenAt(a))) === day).length;

/** The latest marked answer, and any answer sent after it that waits for the run. */
export function lastFeedback(all: MainsAnswer[]) {
  const sent = all.filter(isSent).sort((a, b) => writtenAt(b) - writtenAt(a));
  const latest = sent.filter(isMarked).sort((a, b) => markedTime(b) - markedTime(a))[0] ?? null;
  const waiting = sent.filter((a) => !a.marking);
  return { latest, waiting };
}
const markedTime = (a: MainsAnswer) => Date.parse(a.marking?.markedAt ?? "") || writtenAt(a);

// ---------- Paper averages and the marks still open ----------

export interface PaperStat {
  group: PaperGroup;
  /** Marked answers on the paper. */
  marked: number;
  /** Sent and waiting for marking. */
  waiting: number;
  /** Average score out of 10, or null before the first marked answer. */
  avg: number | null;
  /** Roughly how many of its marks are still open: marks × (1 − average ÷ 10), all of them before a marked answer. */
  open: number;
}

/** Each paper's average answer score and its marks still open, in paper order. */
export function paperStats(all: MainsAnswer[]): PaperStat[] {
  return PAPER_GROUPS.map((group) => {
    const mine = all.filter((a) => isSent(a) && group.papers.includes(a.question.paper));
    const scores = mine.filter(isMarked).map((a) => a.marking!.score);
    const m = mean(scores);
    const avg = m === null ? null : round2(m);
    return {
      group,
      marked: scores.length,
      waiting: mine.length - scores.length,
      avg,
      open: avg === null ? group.marks : Math.round(group.marks * (1 - avg / 10)),
    };
  });
}

/** Marks still open per paper, most first; unstarted papers count in full, so a 500-mark optional leads. */
export function marksOpen(all: MainsAnswer[]): PaperStat[] {
  return paperStats(all).sort((a, b) => b.open - a.open || b.group.marks - a.group.marks);
}

// ---------- Weeks ----------

/** The ends of the last `weeks` weeks, oldest first (each week is the 7 days before its end). */
export const weekEnds = (now: Date, weeks: number) =>
  Array.from({ length: weeks }, (_, i) => new Date(now.getTime() - (weeks - 1 - i) * WEEK_MS));

/** Whole weeks since your first sent answer (at least 1), for "All time". */
export function weeksOfAnswers(all: MainsAnswer[], now: Date): number {
  const first = Math.min(...all.filter(isSent).map(writtenAt));
  return Number.isFinite(first) ? Math.max(1, Math.ceil((now.getTime() - first) / WEEK_MS)) : 1;
}

export interface WeekRow {
  /** The week's first day, "YYYY-MM-DD". */
  from: string;
  /** Answers sent that week. */
  sent: number;
  /** Of those, marked so far. */
  marked: number;
  /** Their average score, or null. */
  avg: number | null;
}

/** Answers sent and their average score in each week ending at `ends`. */
export function byWeek(all: MainsAnswer[], ends: Date[]): WeekRow[] {
  return ends.map((end) => {
    const to = end.getTime();
    const list = all.filter((a) => isSent(a) && writtenAt(a) > to - WEEK_MS && writtenAt(a) <= to);
    const m = mean(list.filter(isMarked).map((a) => a.marking!.score));
    return {
      from: dayOf(new Date(to - 6 * DAY_MS)),
      sent: list.length,
      marked: list.filter(isMarked).length,
      avg: m === null ? null : round2(m),
    };
  });
}

// ---------- The checklist ----------

export interface ItemKept {
  key: ChecklistKey;
  label: string;
  max: number;
  /** Share of the item's marks you kept (0–1), or null before a marked answer. */
  kept: number | null;
  /** Marks it cost in all. */
  lost: number;
  /** Answers that lost marks on it. */
  short: number;
}

/** Marks kept per checklist item over marked answers, in checklist order. */
export function checklistKept(all: MainsAnswer[]): ItemKept[] {
  const done = all.filter(isMarked);
  return CHECKLIST.map(({ key, label, max }) => {
    const got = done.map((a) => a.marking!.checklist.find((c) => c.key === key)?.got ?? 0);
    const sum = got.reduce((n, g) => n + g, 0);
    return {
      key,
      label,
      max,
      kept: done.length ? sum / (max * done.length) : null,
      lost: round2(max * done.length - sum),
      short: got.filter((g) => g < max).length,
    };
  });
}

/** The checklist item that cost the most marks, or null when none cost any. */
export function costliestItem(items: ItemKept[]): ItemKept | null {
  const top = [...items].sort((a, b) => b.lost - a.lost)[0];
  return top && top.lost > 0 ? top : null;
}

// ---------- Months: self-scores and time ----------

/** The time allowed for a 10-marker: 7:00 (lib/mains.ts). */
export const TEN_MARKER_MS = minutesFor(10) * 60_000;

export interface MonthRow {
  /** "YYYY-MM". */
  month: string;
  name: string;
  /** "Oct". */
  short: string;
  /** Answers sent that month. */
  sent: number;
  /** Your self-score minus the mark, on average (above 0: too high), and over how many answers. */
  selfGap: number | null;
  selfN: number;
  /** Average writing time of the month's 10-markers, and how many were timed. */
  tenMs: number | null;
  tenN: number;
  /** Timed answers (any length) that ran past their time, of all timed ones. */
  over: number;
  timed: number;
}

/** Sent answers grouped by the month they were written, oldest first. */
export function byMonth(all: MainsAnswer[]): MonthRow[] {
  const groups = new Map<string, MainsAnswer[]>();
  for (const a of all.filter(isSent)) {
    const m = monthOf(new Date(writtenAt(a)));
    groups.set(m, [...(groups.get(m) ?? []), a]);
  }
  return [...groups.keys()].sort().map((month) => {
    const list = groups.get(month)!;
    const self = list.filter((a) => a.marking && a.selfScore !== undefined);
    const gap = mean(self.map((a) => a.selfScore! - a.marking!.score));
    const timed = list.filter((a) => a.times.writeMs > 0);
    const ten = timed.filter((a) => a.question.marks === 10);
    const tenMs = mean(ten.map((a) => a.times.writeMs));
    return {
      month,
      name: monthName(month),
      short: monthName(month).slice(0, 3),
      sent: list.length,
      selfGap: gap === null ? null : round2(gap),
      selfN: self.length,
      tenMs: tenMs === null ? null : Math.round(tenMs),
      tenN: ten.length,
      over: timed.filter((a) => a.times.overtimeMs > 0).length,
      timed: timed.length,
    };
  });
}

/** "0.3 too high", "0.5 too low" or "spot on". */
export function gapText(gap: number): string {
  if (Math.abs(gap) < 0.05) return "spot on";
  return `${one(Math.abs(gap))} too ${gap > 0 ? "high" : "low"}`;
}

// ---------- Full papers and the predicted score ----------

/** A predicted score waits for this many full papers (DECISIONS 2026-10-21, as Prelims waits for three mocks). */
export const PREDICT_AFTER = 2;

export interface Sitting {
  paper: MainsPaper;
  day: string;
  answers: MainsAnswer[];
  /** Marks the questions carry in all. */
  marks: number;
}

/**
 * Full papers you have sat: answers on one paper, sent on one day, whose questions carry a whole
 * paper's 250 marks between them (a GS paper's twenty questions, or the Essay's two).
 */
export function fullPapers(all: MainsAnswer[]): Sitting[] {
  const by = new Map<string, Sitting>();
  for (const a of all.filter(isSent)) {
    const day = dayOf(new Date(writtenAt(a)));
    const k = `${a.question.paper}|${day}`;
    const s = by.get(k) ?? { paper: a.question.paper, day, answers: [], marks: 0 };
    s.answers.push(a);
    s.marks += a.question.marks;
    by.set(k, s);
  }
  return [...by.values()].filter((s) => s.marks >= PAPER_MARKS).sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * The predicted written total, only once two full papers are marked: the share of marks you
 * scored across your marked full papers, applied to all 1,750 written marks and rounded to 10.
 * A rough guide, not a forecast: it assumes the papers you haven't sat go as these did.
 */
export function prediction(all: MainsAnswer[]): { sat: number; needed: number; total: number | null } {
  const sat = fullPapers(all);
  const marked = sat.filter((s) => s.answers.every(isMarked));
  if (marked.length < PREDICT_AFTER) return { sat: sat.length, needed: PREDICT_AFTER, total: null };
  const share = mean(
    marked.map((s) => s.answers.reduce((n, a) => n + (a.marking!.score / 10) * a.question.marks, 0) / s.marks),
  )!;
  return { sat: sat.length, needed: PREDICT_AFTER, total: Math.round((share * WRITTEN_MARKS) / 10) * 10 };
}

// ---------- The daily answer target ----------

export interface AnswerTarget {
  /** Answers a day, as a range. */
  low: number;
  high: number;
  phase: "prelims" | "ramp" | "mains" | "exam";
}

/**
 * Answers to write a day, rising with the calendar (agreed 2026-10-20: "1–2 now, 5–6 in the
 * Mains season"; DECISIONS 2026-10-21):
 * - Until Prelims (23 May 2027): 1–2 a day, 7–14 a week. Prelims comes first; a daily answer or two
 *   keeps the writing habit and gives the marking something to learn from.
 * - After Prelims the Mains season starts and the target rises by one answer a day each week:
 *   2–3 in the first week, 3–4, 4–5, then 5–6 from the fourth week. A step a week rather than a
 *   jump, so the habit grows instead of breaking.
 * - 5–6 a day holds until Mains starts (20 Aug 2027): about a 250-mark paper's worth of questions
 *   every three to four days, which is about 1½ hours of writing a day at 7–11 minutes an answer.
 * - From the first day of Mains there is no target.
 */
export function answerTarget(day = dayOf()): AnswerTarget {
  if (daysUntil(MAINS_2027, day) <= 0) return { low: 0, high: 0, phase: "exam" };
  const sincePrelims = -daysUntil(PRELIMS_2027, day);
  if (sincePrelims <= 0) return { low: 1, high: 2, phase: "prelims" };
  const add = Math.min(4, Math.floor((sincePrelims - 1) / 7) + 1);
  return { low: 1 + add, high: 2 + add, phase: add < 4 ? "ramp" : "mains" };
}

/** "1–2 a day". */
export const targetText = (t: AnswerTarget) =>
  t.phase === "exam" ? "none: Mains has started" : `${t.low}–${t.high} a day`;

// ---------- Notes ----------

export interface NoteChange {
  note: string;
  title: string;
  /** What changed: the approved text, or that the note was edited. */
  text: string;
  /** When it changed in your notes. */
  at: string;
  /** The date of the event or document behind it, when known ("YYYY-MM-DD"). */
  date?: string;
  kind: "added" | "edited";
}

/** The text an applied proposal put into its note. */
function proposalText(p: Proposal): string {
  if (p.kind === "edit") return p.replace ?? "";
  if (p.kind === "row") return (p.cells ?? []).filter(Boolean).join(" · ");
  return p.text ?? "";
}

/**
 * The latest changes in your notes, newest first: proposals you approved (with the date of their
 * source), and other edits (the page's last save) that no approval explains.
 */
export function noteChanges(
  pages: { id: string; title: string; updated?: string }[],
  proposals: Record<string, Proposal[]>,
): NoteChange[] {
  const out: NoteChange[] = [];
  const titles = new Map(pages.map((p) => [p.id, p.title]));
  for (const [key, list] of Object.entries(proposals)) {
    const [collection, id] = key.split(":");
    if (collection !== "notes") continue;
    for (const p of list)
      if (p.status === "applied" && p.decidedAt && proposalText(p).trim())
        out.push({
          note: id,
          title: titles.get(id) ?? id,
          text: proposalText(p).trim(),
          at: p.decidedAt,
          ...(p.source.date ? { date: p.source.date } : {}),
          kind: "added",
        });
  }
  for (const page of pages) {
    const t = Date.parse(page.updated ?? "");
    if (!Number.isFinite(t)) continue;
    // An approval saves the page too; only an edit no approval explains (within 2 minutes) is listed.
    if (out.some((c) => c.note === page.id && Math.abs(Date.parse(c.at) - t) < 2 * 60_000)) continue;
    out.push({ note: page.id, title: page.title, text: `${page.title} was edited`, at: page.updated!, kind: "edited" });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

// ---------- From Claude ----------

export interface ClaudeItem {
  key: string;
  text: string;
  to: string;
}

/**
 * What Claude has for you: note updates to approve, replies, flags, filed captures, answers marked
 * and disputes answered this week, and its weekly note's Mains lines.
 */
export function fromClaude(input: {
  threads: Record<string, StoredThread[]>;
  captures: Capture[];
  proposals: Record<string, Proposal[]>;
  answers: MainsAnswer[];
  /** The latest weekly note, when there is one. */
  week?: { lines: { route?: string }[] } | null;
  now?: Date;
}): ClaudeItem[] {
  const now = (input.now ?? new Date()).getTime();
  const recent = (iso?: string) => !!iso && now - Date.parse(iso) < WEEK_MS;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const items: ClaudeItem[] = [];
  const pending = Object.values(input.proposals)
    .flat()
    .filter((p) => p.status === "pending").length;
  if (pending) items.push({ key: "proposals", text: `${plural(pending, "note update")} to approve`, to: "/inbox" });
  const threads = Object.values(input.threads).flat();
  const replies = threads.filter(
    (t) => t.kind === "claude" && !t.resolved && t.comments.at(-1)?.userId === "claude",
  ).length;
  if (replies)
    items.push({ key: "replies", text: `${plural(replies, "reply", "replies")} to your questions`, to: "/inbox" });
  const flags = threads.filter((t) => t.kind === "flag" && !t.resolved).length;
  if (flags) items.push({ key: "flags", text: `${plural(flags, "flag")} on your notes`, to: "/inbox" });
  const filed = input.captures.filter((c) => c.status === "done").length;
  if (filed) items.push({ key: "filed", text: `${plural(filed, "capture")} filed into your notes`, to: "/inbox" });
  const marked = input.answers.filter((a) => recent(a.marking?.markedAt)).sort((a, b) => markedTime(b) - markedTime(a));
  if (marked.length)
    items.push({
      key: "marked",
      text: `${plural(marked.length, "answer")} marked this week`,
      to: marked.length === 1 ? `/mains/answers/${marked[0].id}` : "/mains/feedback",
    });
  const answered = input.answers
    .flatMap((a) => a.disputes.filter((d) => d.status !== "open" && recent(d.resolvedAt)).map((d) => ({ a, d })))
    .sort((x, y) => Date.parse(y.d.resolvedAt!) - Date.parse(x.d.resolvedAt!));
  if (answered.length)
    items.push({
      key: "disputes",
      text: `${plural(answered.length, "dispute")} answered`,
      to: `/mains/answers/${answered[0].a.id}`,
    });
  // Claude's weekly report: the note's lines on Mains (evidence not on a Prelims screen).
  const weekLines = input.week?.lines.filter((l) => isMainsRoute(l.route)).length ?? 0;
  if (weekLines)
    items.push({
      key: "week",
      text: `Weekly note: ${plural(weekLines, "line")} on your answers`,
      to: "/mains/analytics",
    });
  return items;
}

/** A weekly-note line belongs to Mains unless its evidence is on a Prelims screen. */
export const isMainsRoute = (route: string | undefined) => !!route && !route.startsWith("/prelims");

// ---------- The week's story (Mains Analytics) ----------

export type Tone = "up" | "down" | "flat";
export interface StoryLine {
  /** The section it heads, also its anchor on /mains/analytics. */
  id: "scores" | "checklist" | "self-score" | "time" | "volume" | "open";
  tone: Tone;
  text: string;
}

export interface MainsStory {
  weeks: WeekRow[];
  /** Sent answers in the range, and how many are marked. */
  sent: number;
  marked: number;
  /** The first day you sent an answer, ever. */
  since: string | null;
  items: ItemKept[];
  costliest: ItemKept | null;
  months: MonthRow[];
  /** Marks still open per paper (all time), most first. */
  open: PaperStat[];
  target: AnswerTarget;
  /** Answers sent a week, on average over the range. */
  perWeek: number;
  prediction: ReturnType<typeof prediction>;
  lines: StoryLine[];
}

/** Everything Mains Analytics shows, over the last `weeks` weeks to `now`. */
export function mainsStory(all: MainsAnswer[], now: Date, weeks: number): MainsStory {
  const from = now.getTime() - weeks * WEEK_MS;
  const inRange = all.filter((a) => isSent(a) && writtenAt(a) > from && writtenAt(a) <= now.getTime());
  const firstSent = Math.min(...all.filter(isSent).map(writtenAt));
  const items = checklistKept(inRange);
  const months = byMonth(inRange);
  const open = marksOpen(all);
  const target = answerTarget(dayOf(now));
  const perWeek = inRange.length / weeks;
  const story: Omit<MainsStory, "lines"> = {
    weeks: byWeek(all, weekEnds(now, weeks)),
    sent: inRange.length,
    marked: inRange.filter(isMarked).length,
    since: Number.isFinite(firstSent) ? dayOf(new Date(firstSent)) : null,
    items,
    costliest: costliestItem(items),
    months,
    open,
    target,
    perWeek,
    prediction: prediction(all),
  };
  return { ...story, lines: storyLines(all, story, now, weeks) };
}

/** Each section's heading, worked out from the numbers. */
function storyLines(all: MainsAnswer[], s: Omit<MainsStory, "lines">, now: Date, weeks: number): StoryLine[] {
  const h = headline(all, now);
  const lines: StoryLine[] = [];
  const range = weeks === 1 ? "this week" : `the last ${weeks} weeks`;

  // 1. Scores: this month against last month.
  const [tm, lm] = [h.thisMonth, h.lastMonth];
  if (tm.avg !== null && lm.avg !== null) {
    const d = tm.avg - lm.avg;
    lines.push(
      Math.abs(d) < 0.05
        ? {
            id: "scores",
            tone: "flat",
            text: `Your scores held steady: ${one(tm.avg)} in ${tm.name}, as in ${lm.name}.`,
          }
        : d > 0
          ? {
              id: "scores",
              tone: "up",
              text: `Your scores are rising: ${one(tm.avg)} in ${tm.name}, ${one(lm.avg)} in ${lm.name}.`,
            }
          : {
              id: "scores",
              tone: "down",
              text: `Your scores slipped: ${one(tm.avg)} in ${tm.name}, ${one(lm.avg)} in ${lm.name}.`,
            },
    );
  } else if (tm.avg !== null) {
    lines.push({
      id: "scores",
      tone: "flat",
      text: `Your average in ${tm.name} is ${one(tm.avg)}, over ${tm.n} marked ${tm.n === 1 ? "answer" : "answers"}.`,
    });
  } else if (lm.avg !== null) {
    lines.push({
      id: "scores",
      tone: "flat",
      text: `No marked answers yet in ${tm.name}; ${lm.name}'s average was ${one(lm.avg)}.`,
    });
  } else {
    const m = mean(all.filter(isMarked).map((a) => a.marking!.score));
    lines.push(
      m === null
        ? { id: "scores", tone: "flat", text: "Your scores show here once Claude marks your first answer." }
        : { id: "scores", tone: "flat", text: `Your average so far is ${one(m)}, from earlier months.` },
    );
  }

  // 2. The checklist item that cost the most.
  const c = s.costliest;
  lines.push(
    c
      ? {
          id: "checklist",
          tone: "down",
          text: `${c.label} cost you the most: ${fmtMarks(c.lost)} ${c.lost === 1 ? "mark" : "marks"} across ${c.short} ${
            c.short === 1 ? "answer" : "answers"
          }.`,
        }
      : s.marked
        ? { id: "checklist", tone: "up", text: `You kept every checklist mark in ${range}.` }
        : { id: "checklist", tone: "flat", text: `No marked answers in ${range}, so no checklist yet.` },
  );

  // 3. Self-scores: how far off, this month against last month.
  const [gNow, gPrev] = [h.selfOff.thisMonth, h.selfOff.lastMonth];
  if (gNow !== null && gPrev !== null) {
    const better = Math.abs(gNow) < Math.abs(gPrev) - 0.05;
    const worse = Math.abs(gNow) > Math.abs(gPrev) + 0.05;
    lines.push(
      better
        ? {
            id: "self-score",
            tone: "up",
            text: `Your self-scores are getting honest: ${gapText(gNow)}, from ${gapText(gPrev)}.`,
          }
        : worse
          ? {
              id: "self-score",
              tone: "down",
              text: `Your self-scores drifted: ${gapText(gNow)}, from ${gapText(gPrev)}.`,
            }
          : { id: "self-score", tone: "flat", text: `Your self-scores are ${gapText(gNow)}, as last month.` },
    );
  } else if (gNow !== null || gPrev !== null || h.selfOff.all !== null) {
    const g = gNow ?? gPrev ?? h.selfOff.all!;
    const when = gNow !== null ? `in ${tm.name}` : gPrev !== null ? `in ${lm.name}` : "so far";
    lines.push({ id: "self-score", tone: "flat", text: `Your self-scores are ${gapText(g)} ${when}.` });
  } else {
    lines.push({
      id: "self-score",
      tone: "flat",
      text: "Your own score, given before the marks, is compared with Claude's here.",
    });
  }

  // 4. Time per 10-marker, this month against last month, and how many ran over in the range.
  const thisKey = monthOf(now);
  const lastKey = monthOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const tenOf = (key: string) => byMonth(all).find((m) => m.month === key)?.tenMs ?? null;
  const [tNow, tPrev] = [tenOf(thisKey), tenOf(lastKey)];
  const over = s.months.reduce((n, m) => n + m.over, 0);
  const timed = s.months.reduce((n, m) => n + m.timed, 0);
  let time: StoryLine;
  if (tNow !== null && tPrev !== null && Math.abs(tNow - tPrev) >= 5000)
    time =
      tNow < tPrev
        ? { id: "time", tone: "up", text: `You're faster: ${clock(tNow)} a 10-marker, from ${clock(tPrev)}` }
        : { id: "time", tone: "down", text: `You're slower: ${clock(tNow)} a 10-marker, from ${clock(tPrev)}` };
  else if (tNow !== null || tPrev !== null) {
    const t = (tNow ?? tPrev)!;
    time = {
      id: "time",
      tone: t <= TEN_MARKER_MS ? "up" : "flat",
      text: `${clock(t)} a 10-marker ${tNow !== null ? `in ${tm.name}` : `in ${lm.name}`}, against 7:00`,
    };
  } else time = { id: "time", tone: "flat", text: "Time a 10-marker with the timer and your pace shows here" };
  time.text += timed
    ? over
      ? `${time.tone === "up" ? ", but" : ", and"} ${over} of ${timed} ran over.`
      : `; none of ${timed} ran over.`
    : ".";
  lines.push(time);

  // 5. Answers a week against the target.
  const t = s.target;
  const pw = s.perWeek >= 1.5 ? String(Math.round(s.perWeek)) : one(s.perWeek);
  lines.push(
    t.phase === "exam"
      ? { id: "volume", tone: "flat", text: `You wrote about ${pw} answers a week; Mains has started.` }
      : s.sent === 0
        ? { id: "volume", tone: "down", text: `No answers in ${range}; the target is ${targetText(t)}.` }
        : s.perWeek >= 7 * t.low
          ? { id: "volume", tone: "up", text: `You write about ${pw} answers a week, on target (${targetText(t)}).` }
          : {
              id: "volume",
              tone: "down",
              text: `You write about ${pw} ${pw === "1" ? "answer" : "answers"} a week; the target is ${targetText(t)}.`,
            },
  );

  // 6. Where the marks are still open.
  const top = s.open[0];
  if (top)
    lines.push(
      top.avg === null
        ? {
            id: "open",
            tone: "down",
            text: `${top.group.name} is ${top.group.marks} marks and ${
              top.waiting ? "has no marked answer yet" : "hasn't started"
            }.`,
          }
        : {
            id: "open",
            tone: "down",
            text: `Most marks are still open in ${top.group.name}: about ${top.open} of ${top.group.marks}.`,
          },
    );
  return lines;
}

// ---------- The weekly note's Mains facts (`atlas week-data`) ----------

/** One week of Mains answers, for the weekly note: `from` and `to` are local days, inclusive. */
export function mainsWeekFacts(all: MainsAnswer[], from: string, to: string) {
  const inWeek = (ms: number) => {
    const d = dayOf(new Date(ms));
    return d >= from && d <= to;
  };
  const sent = all.filter((a) => isSent(a) && inWeek(writtenAt(a)));
  const marked = sent.filter(isMarked);
  const avg = mean(marked.map((a) => a.marking!.score));
  const gap = mean(marked.filter((a) => a.selfScore !== undefined).map((a) => a.selfScore! - a.marking!.score));
  const ten = sent.filter((a) => a.question.marks === 10 && a.times.writeMs > 0);
  const tenMs = mean(ten.map((a) => a.times.writeMs));
  const costliest = costliestItem(checklistKept(marked));
  const target = answerTarget(to);
  return {
    sent: sent.length,
    marked: marked.length,
    waitingNow: all.filter((a) => isSent(a) && !a.marking).length,
    averageScore: avg === null ? null : round2(avg),
    selfScoreGap: gap === null ? null : round2(gap),
    tenMarker: { averageTime: tenMs === null ? null : clock(tenMs), answers: ten.length, limit: clock(TEN_MARKER_MS) },
    ranOver: sent.filter((a) => a.times.overtimeMs > 0).length,
    costliest: costliest ? { item: costliest.label, lost: costliest.lost, answers: costliest.short } : null,
    target: { perDay: targetText(target), perWeek: `${7 * target.low}–${7 * target.high}` },
    marksOpen: marksOpen(all).map((p) => ({ paper: p.group.name, open: p.open, of: p.group.marks, average: p.avg })),
    evidence: {
      scores: "/mains/analytics#scores",
      checklist: "/mains/analytics#checklist",
      "self-scores": "/mains/analytics#self-score",
      time: "/mains/analytics#time",
      "answers a week": "/mains/analytics#volume",
      "marks still open": "/mains/analytics#open",
      "every answer": "/mains/feedback",
    },
  };
}
