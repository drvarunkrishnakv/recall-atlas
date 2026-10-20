// Tonight's lesson, the morning quiz and the weekly note (M9). Pure, and shared by the app, the
// CLI and Claude's scheduled runs (docs/ARCHITECTURE.md, Practice).
//
//   lessons/{YYYY-MM-DD}    {json: Lesson}       the evening's lesson. Claude's run writes it with
//                                                the CLI; the app adds your "Got it" / "Still shaky"
//   notes-week/{YYYY-Www}   {json: WeeklyNote}   the engine's weekly note; only the CLI writes it
//
// A lesson has one card per concept, not per question. Each card opens with your mistake (read
// from the attempt log), teaches the concept around it, and says whether it was fact-checked.
// A card you call shaky comes back in the next lessons until you call it "got" on two
// different later days. The lesson also names the items for the next morning's quiz.
import { optionVector, statementTruth } from "./statements.ts";
import { isDue, reviewStates } from "./srs.ts";
import { GRADE_LABEL, servable, type Attempt, type Grade, type Item, type McqItem } from "./practice.ts";

export const RATINGS = ["got", "shaky"] as const;
export type Rating = (typeof RATINGS)[number];

/** One press of "Got it" or "Still shaky" on a card. */
export interface CardRating {
  cardId: string;
  rating: Rating;
  /** When you pressed it (ISO time). */
  at: string;
}

export interface LessonSource {
  label: string;
  url: string;
}

/** A statement whose truth you got wrong. */
export interface SlippedStatement {
  /** 1-based, as the question numbers it. */
  n: number;
  text: string;
  /** What you said about it, and what is true. */
  said: boolean;
  truth: boolean;
  /** "marked": your ✓/✕; "answer": what the option you chose says (you left the marks blank). */
  from: "marked" | "answer";
}

/** "Your mistake" on a card: what you answered, against the truth, taken from one attempt. */
export interface YourMistake {
  itemId: string;
  attemptId: string;
  at: string;
  /** The question as asked. */
  stem: string;
  slipped: SlippedStatement[];
  /** The option you chose and the right one (index and text). */
  chosen?: { n: number; text: string };
  answer: { n: number; text: string };
  sure?: boolean;
  /** False for a miss; true for a right answer you weren't sure of (a shaky item). */
  correct: boolean;
  grade?: Grade;
}

export interface LessonTable {
  head: string[];
  rows: string[][];
}

/** One concept: your mistake, the teaching around it, and where it comes from. */
export interface LessonCard {
  /** The concept's id. A concept that comes back keeps it, so its ratings follow it. */
  id: string;
  /** The heading, e.g. "Money Bills and the Rajya Sabha". */
  concept: string;
  /** Subject and topic, e.g. "Polity · Parliament". */
  subject: string;
  /** The items (questions) this concept covers. */
  itemIds: string[];
  mistakes: YourMistake[];
  /** A few clear paragraphs that teach the concept around the mistake. */
  teach: string[];
  /** For facts that are easily confused. */
  table?: LessonTable;
  /** The one line to carry away. */
  remember: string;
  sources: LessonSource[];
  /** True only once the card passed the blind fact-check. */
  checked: boolean;
  /** A shaky card brought back: the day it was last called shaky. */
  returning?: string;
}

export interface Lesson {
  /** The evening it is for (YYYY-MM-DD). */
  day: string;
  /** When Claude's run wrote it (ISO time). */
  written: string;
  cards: LessonCard[];
  /** The next morning's quiz: the missed items plus related checked PYQs. */
  quiz: string[];
  /** Your "Got it" / "Still shaky" presses, in order. */
  ratings: CardRating[];
}

export type LessonOp =
  | { op: "rate"; cardId: string; rating: Rating; at: string }
  /** Undo: takes back the press made at `at`. */
  | { op: "unrate"; cardId: string; at: string };

/** A line of the weekly note, tied to the screen that shows its evidence. */
export interface WeeklyLine {
  text: string;
  evidence: { route: string; label: string };
}

export interface WeeklyNote {
  /** ISO week, e.g. "2026-W43". */
  week: string;
  written: string;
  lines: WeeklyLine[];
}

export class LessonError extends Error {}

function fail(what: string): never {
  throw new LessonError(what);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const CARD_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
/** An app route: starts with one "/", no spaces, no scheme. */
const ROUTE = /^\/(?!\/)[^\s<>"]*$/;

const isText = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
const isTime = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v));
const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(v));
const isRating = (v: unknown): v is Rating => (RATINGS as readonly string[]).includes(v as string);
const isList = (v: unknown, min: number, max: number): v is unknown[] =>
  Array.isArray(v) && v.length >= min && v.length <= max;

/** The `lessons/{id}` document for a day. */
export function lessonDocId(day: string): string {
  if (!isDay(day)) fail("Bad day");
  return day;
}

/** The `notes-week/{id}` document for an ISO week. */
export function weekDocId(week: string): string {
  if (!WEEK.test(week)) fail("Bad week; use YYYY-Www, e.g. 2026-W43");
  return week;
}

function checkMistake(x: unknown, card: string): YourMistake {
  const m = x as Partial<Record<string, unknown>> | null;
  if (!m || typeof m !== "object") fail(`Bad mistake on ${card}`);
  if (typeof m.itemId !== "string" || !ITEM_ID.test(m.itemId)) fail(`Bad item id in a mistake on ${card}`);
  if (typeof m.attemptId !== "string" || !ITEM_ID.test(m.attemptId)) fail(`Bad attempt id in a mistake on ${card}`);
  if (!isTime(m.at)) fail(`Bad time in a mistake on ${card}`);
  if (!isText(m.stem, 5000)) fail(`A mistake on ${card} needs its question`);
  if (typeof m.correct !== "boolean") fail(`A mistake on ${card} must say whether it was right`);
  if (m.sure !== undefined && typeof m.sure !== "boolean") fail(`Bad confidence in a mistake on ${card}`);
  const opt = (o: unknown) => {
    const v = o as { n?: unknown; text?: unknown } | null;
    return !!v && Number.isInteger(v.n) && (v.n as number) >= 0 && (v.n as number) < 5 && isText(v.text, 1000);
  };
  if (!opt(m.answer)) fail(`A mistake on ${card} needs the right option`);
  if (m.chosen !== undefined && !opt(m.chosen)) fail(`Bad chosen option in a mistake on ${card}`);
  if (m.grade !== undefined && !Object.hasOwn(GRADE_LABEL, String(m.grade))) fail(`Bad grade in a mistake on ${card}`);
  if (!isList(m.slipped, 0, 12)) fail(`Bad slipped statements on ${card}`);
  for (const s of m.slipped as Partial<Record<string, unknown>>[])
    if (
      !s ||
      !Number.isInteger(s.n) ||
      (s.n as number) < 1 ||
      !isText(s.text, 1000) ||
      typeof s.said !== "boolean" ||
      typeof s.truth !== "boolean" ||
      (s.from !== "marked" && s.from !== "answer")
    )
      fail(`Bad slipped statement on ${card}`);
  return m as unknown as YourMistake;
}

/** Checks one lesson card and returns it typed. */
export function validateCard(x: unknown): LessonCard {
  const c = x as Partial<Record<string, unknown>> | null;
  if (!c || typeof c !== "object") fail("Not a lesson card");
  if (typeof c.id !== "string" || !CARD_ID.test(c.id)) fail("Bad card id (lowercase letters, digits and dashes)");
  const id = c.id;
  if (!isText(c.concept, 160)) fail(`Card ${id} needs a concept heading`);
  if (!isText(c.subject, 120)) fail(`Card ${id} needs a subject`);
  if (!isList(c.itemIds, 1, 20) || !(c.itemIds as unknown[]).every((i) => typeof i === "string" && ITEM_ID.test(i)))
    fail(`Card ${id} must name the items it covers`);
  if (!isList(c.mistakes, 1, 8)) fail(`Card ${id} must open with your mistake`);
  for (const m of c.mistakes as unknown[]) checkMistake(m, id);
  if (!isList(c.teach, 1, 8) || !(c.teach as unknown[]).every((p) => isText(p, 2500)))
    fail(`Card ${id} needs one to eight teaching paragraphs`);
  if (c.table !== undefined) {
    const t = c.table as Partial<Record<string, unknown>> | null;
    const head = t?.head as unknown;
    if (!isList(head, 2, 6) || !(head as unknown[]).every((h) => typeof h === "string" && h.length <= 120))
      fail(`Card ${id}'s table needs two to six column heads`);
    const rows = t?.rows as unknown;
    if (
      !isList(rows, 1, 12) ||
      !(rows as unknown[]).every(
        (r) =>
          Array.isArray(r) &&
          r.length === (head as unknown[]).length &&
          r.every((cell) => typeof cell === "string" && cell.length <= 400),
      )
    )
      fail(`Card ${id}'s table rows must match its heads`);
  }
  if (!isText(c.remember, 300)) fail(`Card ${id} needs a "Remember" line`);
  if (!isList(c.sources, 1, 8)) fail(`Card ${id} needs its sources`);
  for (const s of c.sources as { label?: unknown; url?: unknown }[])
    if (!isText(s?.label, 200) || typeof s?.url !== "string" || !/^https?:\/\/\S+$/.test(s.url))
      fail(`Bad source on card ${id}`);
  if (typeof c.checked !== "boolean") fail(`Card ${id} must say whether it was fact-checked`);
  if (c.returning !== undefined && !isDay(c.returning)) fail(`Bad returning day on card ${id}`);
  return c as unknown as LessonCard;
}

function checkRating(x: unknown): CardRating {
  const r = x as Partial<Record<string, unknown>> | null;
  if (!r || typeof r.cardId !== "string" || !CARD_ID.test(r.cardId)) fail("Bad card in a rating");
  if (!isRating(r.rating)) fail('A rating is "got" or "shaky"');
  if (!isTime(r.at)) fail("Bad rating time");
  return r as unknown as CardRating;
}

/** Checks a lesson (as written by the run, or as stored) and returns it typed. */
export function validateLesson(x: unknown): Lesson {
  const l = x as Partial<Record<string, unknown>> | null;
  if (!l || typeof l !== "object") fail("Not a lesson");
  if (!isDay(l.day)) fail("A lesson needs its day (YYYY-MM-DD)");
  if (!isTime(l.written)) fail("A lesson needs the time it was written");
  if (!isList(l.cards, 0, 30)) fail("A lesson has at most 30 cards");
  const seen = new Set<string>();
  for (const c of l.cards as unknown[]) {
    const card = validateCard(c);
    if (seen.has(card.id)) fail(`Card ${card.id} appears twice`);
    seen.add(card.id);
  }
  if (!isList(l.quiz, 0, 20) || !(l.quiz as unknown[]).every((i) => typeof i === "string" && ITEM_ID.test(i)))
    fail("The quiz is a list of at most 20 item ids");
  if (new Set(l.quiz as string[]).size !== (l.quiz as string[]).length) fail("An item appears twice in the quiz");
  if (!isList(l.ratings, 0, 2000)) fail("Bad ratings");
  for (const r of l.ratings as unknown[]) checkRating(r);
  return l as unknown as Lesson;
}

/** Applies one press (or its undo) to a lesson. A retried press or undo changes nothing. */
export function applyLessonOp(lesson: Lesson | null, op: LessonOp): Lesson {
  if (!lesson) fail("No lesson for that day");
  const card = lesson.cards.find((c) => c.id === op?.cardId);
  if (!card) fail(`No card ${String(op?.cardId)} in this lesson`);
  switch (op.op) {
    case "rate": {
      const r = checkRating({ cardId: op.cardId, rating: op.rating, at: op.at });
      if (lesson.ratings.some((x) => x.cardId === r.cardId && x.at === r.at)) return lesson;
      return { ...lesson, ratings: [...lesson.ratings, r] };
    }
    case "unrate":
      if (!isTime(op.at)) fail("Bad rating time");
      return { ...lesson, ratings: lesson.ratings.filter((x) => !(x.cardId === op.cardId && x.at === op.at)) };
    default:
      fail("Unknown lesson operation");
  }
}

/** Your latest press on a card in this lesson, if any. */
export function latestRating(lesson: Lesson, cardId: string): CardRating | undefined {
  let out: CardRating | undefined;
  for (const r of lesson.ratings) if (r.cardId === cardId && (!out || Date.parse(r.at) >= Date.parse(out.at))) out = r;
  return out;
}

/** What the lesson list shows for a day: each card's concept, items and latest rating. */
export interface LessonDay {
  day: string;
  written: string;
  cards: { id: string; concept: string; subject: string; itemIds: string[]; checked: boolean; rating?: Rating }[];
  quiz: number;
}

export function lessonSummary(lesson: Lesson): LessonDay {
  return {
    day: lesson.day,
    written: lesson.written,
    cards: lesson.cards.map((c) => ({
      id: c.id,
      concept: c.concept,
      subject: c.subject,
      itemIds: c.itemIds,
      checked: c.checked,
      ...(latestRating(lesson, c.id) ? { rating: latestRating(lesson, c.id)!.rating } : {}),
    })),
    quiz: lesson.quiz.length,
  };
}

/** `GET /api/lessons`: every day (newest first) and the latest lesson in full. */
export function lessonIndex(lessons: Lesson[]): { days: LessonDay[]; latest: Lesson | null } {
  const sorted = [...lessons].sort((a, b) => b.day.localeCompare(a.day));
  return { days: sorted.map(lessonSummary), latest: sorted[0] ?? null };
}

/** The local calendar day of an ISO time. */
export const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

/** A shaky concept due to come back, with the latest version of its card. */
export interface ShakyCard {
  card: LessonCard;
  /** The day it was last called shaky, and the lesson that card came from. */
  since: string;
  lessonDay: string;
  /** Later days you called it "got" so far (it leaves the queue at 2). */
  gotDays: number;
}

/**
 * The "shaky concepts come back sooner" queue. A card called shaky comes back in the next
 * lessons until you call it "got" on two different days after the last "shaky" (the day of
 * that "shaky" doesn't count). `except` leaves out one lesson day, the one being written.
 */
export function shakyQueue(lessons: Lesson[], except?: string): ShakyCard[] {
  const used = lessons.filter((l) => l.day !== except).sort((a, b) => a.day.localeCompare(b.day));
  const latestCard = new Map<string, { card: LessonCard; day: string }>();
  const ratings = new Map<string, CardRating[]>();
  for (const l of used) {
    for (const c of l.cards) latestCard.set(c.id, { card: c, day: l.day });
    for (const r of l.ratings) ratings.set(r.cardId, [...(ratings.get(r.cardId) ?? []), r]);
  }
  const out: ShakyCard[] = [];
  for (const [id, list] of ratings) {
    const found = latestCard.get(id);
    if (!found) continue;
    const sorted = [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const lastShaky = sorted.filter((r) => r.rating === "shaky").pop();
    if (!lastShaky) continue;
    const since = localDay(lastShaky.at);
    const gotDays = new Set(
      sorted
        .filter((r) => r.rating === "got" && Date.parse(r.at) > Date.parse(lastShaky.at))
        .map((r) => localDay(r.at))
        .filter((d) => d !== since),
    );
    if (gotDays.size >= 2) continue;
    out.push({ card: found.card, since, lessonDay: found.day, gotDays: gotDays.size });
  }
  return out.sort((a, b) => a.since.localeCompare(b.since) || a.card.id.localeCompare(b.card.id));
}

/**
 * Brings the due shaky cards into a lesson that doesn't already teach them, at the end, marked
 * as returning. Returns the lesson and the ids it added.
 */
export function withReturning(lesson: Lesson, others: Lesson[]): { lesson: Lesson; added: string[] } {
  const have = new Set(lesson.cards.map((c) => c.id));
  const back = shakyQueue(others, lesson.day).filter((s) => !have.has(s.card.id));
  return {
    lesson: { ...lesson, cards: [...lesson.cards, ...back.map((s) => ({ ...s.card, returning: s.since }))] },
    added: back.map((s) => s.card.id),
  };
}

/**
 * The lesson to store when the run writes a day: the new cards and quiz, your presses on cards
 * that are still in it, and the shaky cards that are due back.
 */
export function mergeLesson(current: Lesson | null, incoming: Lesson, others: Lesson[]): Lesson {
  const merged = withReturning({ ...incoming, ratings: [] }, others).lesson;
  const ids = new Set(merged.cards.map((c) => c.id));
  return validateLesson({ ...merged, ratings: (current?.ratings ?? []).filter((r) => ids.has(r.cardId)) });
}

/**
 * "Your mistake" from an attempt and its item: the statements you got wrong (your ✓/✕ against
 * the truth, or, when you left the marks blank, what your chosen option says), your option
 * against the answer, and whether you were sure.
 */
export function yourMistake(attempt: Attempt, item: McqItem): YourMistake {
  const count = item.statements?.length ?? 0;
  const truth = count ? (item.truth ?? statementTruth(item.options, item.answer, count)) : null;
  const slipped: SlippedStatement[] = [];
  if (count && truth) {
    const marks = attempt.marks?.slice(0, count);
    if (marks?.some((m) => m !== null)) {
      marks.forEach((m, i) => {
        if (m !== null && m !== truth[i])
          slipped.push({ n: i + 1, text: item.statements![i], said: m, truth: truth[i], from: "marked" });
      });
    } else if (attempt.chosen !== undefined && item.options[attempt.chosen] !== undefined) {
      const said = optionVector(item.options[attempt.chosen], count);
      said?.forEach((v, i) => {
        if (v !== truth[i])
          slipped.push({ n: i + 1, text: item.statements![i], said: v, truth: truth[i], from: "answer" });
      });
    }
  }
  return {
    itemId: item.id,
    attemptId: attempt.id,
    at: attempt.at,
    stem: item.stem,
    slipped,
    ...(attempt.chosen !== undefined && item.options[attempt.chosen] !== undefined
      ? { chosen: { n: attempt.chosen, text: item.options[attempt.chosen] } }
      : {}),
    answer: { n: item.answer, text: item.options[item.answer] },
    ...(attempt.sure !== undefined ? { sure: attempt.sure } : {}),
    correct: attempt.correct,
    ...(attempt.grade ? { grade: attempt.grade } : {}),
  };
}

/** The label after "Your mistake": a confident miss, an unsure miss, a lucky guess… */
export function mistakeLabel(m: YourMistake): string {
  if (!m.correct) return m.sure ? "confident miss" : m.sure === false ? "unsure miss" : "miss";
  if (m.grade === "hard") return "right, but a guess";
  return "right, but unsure";
}

/** Whether an attempt counts for tonight's lesson: a miss, or a right answer you weren't sure of. */
export const isShakyAttempt = (a: Attempt) => !a.correct || a.sure === false || a.grade === "hard";

/** Everything the nightly run needs about one missed or shaky item (`atlas misses`). */
export interface MissFact {
  itemId: string;
  bank: string;
  topic: string;
  microtheme?: string;
  source: string;
  stem: string;
  statements?: string[];
  truth?: boolean[] | null;
  ask?: string;
  options: string[];
  answer: number;
  /** The day's attempts on it (a miss or a shaky right answer), oldest first. */
  attempts: {
    id: string;
    at: string;
    ms: number;
    mode: string;
    correct: boolean;
    sure?: boolean;
    chosen?: number;
    marks?: (boolean | null)[];
    grade?: Grade;
  }[];
  /** "Your mistake", from the day's last such attempt, ready to copy into a card. */
  mistake: YourMistake;
  earlier: {
    /** Earlier misses of the same item. */
    item: { day: string; chosen?: number; sure?: boolean; grade?: Grade }[];
    /** Earlier misses of other items in the same microtheme (or topic, when there is none). */
    related: { day: string; itemId: string; stem: string }[];
  };
  /** Lesson cards that already teach this item: reuse the id if it's the same concept. */
  cards: { id: string; day: string; concept: string }[];
  /** Checked PYQs from the same microtheme (or topic) for the morning quiz. */
  quizCandidates: { id: string; year?: number; stem: string }[];
}

const firstLine = (s: string) => s.split("\n")[0].slice(0, 160);

/** The missed and shaky MCQs of a day, with everything the lesson needs about each. */
export function missesFor(day: string, attempts: Attempt[], items: Map<string, Item>, lessons: Lesson[]): MissFact[] {
  const mcq = (id: string) => {
    const it = items.get(id);
    return it && it.kind === "mcq" ? it : undefined;
  };
  const group = (it: McqItem) => it.microtheme ?? `topic:${it.bank}:${it.topic}`;
  const sorted = attempts.filter((a) => a.kind === "mcq").sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const todays = new Map<string, Attempt[]>();
  for (const a of sorted)
    if (localDay(a.at) === day && isShakyAttempt(a) && mcq(a.itemId))
      todays.set(a.itemId, [...(todays.get(a.itemId) ?? []), a]);
  const before = sorted.filter((a) => localDay(a.at) < day && !a.correct);
  const out: MissFact[] = [];
  for (const [id, list] of todays) {
    const it = mcq(id)!;
    const count = it.statements?.length ?? 0;
    const last = list[list.length - 1];
    const g = group(it);
    const pool = [...items.values()].filter(
      (x): x is McqItem => x.kind === "mcq" && x.id !== id && servable(x) && group(x) === g,
    );
    out.push({
      itemId: id,
      bank: it.bank,
      topic: it.topic,
      ...(it.microtheme ? { microtheme: it.microtheme } : {}),
      source: it.source.type === "pyq" ? `PYQ ${it.source.year} ${it.source.paper}` : "Practice (Claude)",
      stem: it.stem,
      ...(it.statements
        ? { statements: it.statements, truth: it.truth ?? statementTruth(it.options, it.answer, count) }
        : {}),
      ...(it.ask ? { ask: it.ask } : {}),
      options: it.options,
      answer: it.answer,
      attempts: list.map((a) => ({
        id: a.id,
        at: a.at,
        ms: a.ms,
        mode: a.mode,
        correct: a.correct,
        ...(a.sure !== undefined ? { sure: a.sure } : {}),
        ...(a.chosen !== undefined ? { chosen: a.chosen } : {}),
        ...(a.marks ? { marks: a.marks } : {}),
        ...(a.grade ? { grade: a.grade } : {}),
      })),
      mistake: yourMistake(last, it),
      earlier: {
        item: before
          .filter((a) => a.itemId === id)
          .map((a) => ({
            day: localDay(a.at),
            ...(a.chosen !== undefined ? { chosen: a.chosen } : {}),
            ...(a.sure !== undefined ? { sure: a.sure } : {}),
            ...(a.grade ? { grade: a.grade } : {}),
          }))
          .slice(-10),
        related: before
          .filter((a) => a.itemId !== id && mcq(a.itemId) && group(mcq(a.itemId)!) === g)
          .map((a) => ({ day: localDay(a.at), itemId: a.itemId, stem: firstLine(mcq(a.itemId)!.stem) }))
          .slice(-10),
      },
      cards: lessons.flatMap((l) =>
        l.cards.filter((c) => c.itemIds.includes(id)).map((c) => ({ id: c.id, day: l.day, concept: c.concept })),
      ),
      quizCandidates: pool
        .sort((a, b) => Number(b.source.type === "pyq") - Number(a.source.type === "pyq"))
        .slice(0, 6)
        .map((x) => ({
          id: x.id,
          ...(x.source.type === "pyq" ? { year: x.source.year } : {}),
          stem: firstLine(x.stem),
        })),
    });
  }
  // Confident misses first: they teach the most.
  return out.sort(
    (a, b) =>
      Number(b.mistake.sure === true && !b.mistake.correct) - Number(a.mistake.sure === true && !a.mistake.correct) ||
      Number(a.mistake.correct) - Number(b.mistake.correct),
  );
}

// ---------- Weekly note ----------

/** Checks a weekly note and returns it typed. */
export function validateWeeklyNote(x: unknown): WeeklyNote {
  const n = x as Partial<Record<string, unknown>> | null;
  if (!n || typeof n !== "object") fail("Not a weekly note");
  if (typeof n.week !== "string" || !WEEK.test(n.week)) fail("Bad week; use YYYY-Www, e.g. 2026-W43");
  if (!isTime(n.written)) fail("A weekly note needs the time it was written");
  if (!isList(n.lines, 1, 12)) fail("A weekly note has one to twelve lines");
  for (const l of n.lines as Partial<Record<string, unknown>>[]) {
    if (!isText(l?.text, 400)) fail("Each line needs its text (at most 400 characters)");
    const e = l.evidence as { route?: unknown; label?: unknown } | undefined;
    if (!e || typeof e.route !== "string" || e.route.length > 300 || !ROUTE.test(e.route))
      fail(`"${String(l.text).slice(0, 40)}…" needs its evidence: an app route such as /prelims/notebook`);
    if (!isText(e.label, 80)) fail(`"${String(l.text).slice(0, 40)}…" needs a short label for its evidence`);
  }
  return n as unknown as WeeklyNote;
}

/** `GET /api/weeks`: every week with a note (newest first) and the latest note in full. */
export function weekIndex(notes: WeeklyNote[]): { weeks: string[]; latest: WeeklyNote | null } {
  const sorted = [...notes].sort((a, b) => b.week.localeCompare(a.week));
  return { weeks: sorted.map((n) => n.week), latest: sorted[0] ?? null };
}

const dayNum = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 864e5;
const fromNum = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);

/** The ISO week of a day: "2026-W43". */
export function isoWeek(day: string): string {
  const n = dayNum(day);
  const dow = new Date(n * 864e5).getUTCDay() || 7;
  const thursday = n + 4 - dow;
  const year = new Date(thursday * 864e5).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1) / 864e5) / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday and Sunday of an ISO week. */
export function weekRange(week: string): { from: string; to: string } {
  weekDocId(week);
  const year = +week.slice(0, 4);
  const w = +week.slice(6);
  const jan4 = Date.UTC(year, 0, 4) / 864e5;
  const monday1 = jan4 - ((new Date(jan4 * 864e5).getUTCDay() || 7) - 1);
  const from = monday1 + (w - 1) * 7;
  return { from: fromNum(from), to: fromNum(from + 6) };
}

/** The week before (n = -1) or after. */
export const shiftWeek = (week: string, n: number) => isoWeek(fromNum(dayNum(weekRange(week).from) + 7 * n));

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

/** The facts a weekly note is written from (`atlas week-data`): one week of the attempt log. */
export interface WeekFacts {
  week: string;
  from: string;
  to: string;
  answered: number;
  right: number;
  accuracy: number | null;
  byMode: Record<string, number>;
  calibration: {
    sure: { answered: number; right: number; accuracy: number | null };
    unsure: { answered: number; right: number; accuracy: number | null };
    confidentMisses: number;
  };
  time: { averageSec: number | null; medianSec: number | null; over72s: number };
  missReasons: Record<string, number>;
  missesByTopic: { bank: string; topic: string; answered: number; misses: number }[];
  missesByMicrotheme: { microtheme: string; misses: number }[];
  lessons: { days: number; cards: number; notChecked: number; got: number; shaky: number };
  quiz: { answered: number; right: number };
  /** Routes the note's lines can point to. */
  evidence: Record<string, string>;
}

export function weekFacts(week: string, attempts: Attempt[], items: Map<string, Item>, lessons: Lesson[]): WeekFacts {
  const { from, to } = weekRange(week);
  const inWeek = (iso: string) => {
    const d = localDay(iso);
    return d >= from && d <= to;
  };
  const list = attempts.filter((a) => a.kind === "mcq" && inWeek(a.at));
  const right = list.filter((a) => a.correct).length;
  const sure = list.filter((a) => a.sure === true);
  const unsure = list.filter((a) => a.sure === false);
  const ms = list.map((a) => a.ms).sort((a, b) => a - b);
  const byMode: Record<string, number> = {};
  for (const a of list) byMode[a.mode] = (byMode[a.mode] ?? 0) + 1;
  const missReasons: Record<string, number> = {};
  for (const a of list)
    if (!a.correct) {
      const k = a.grade ? GRADE_LABEL[a.grade] : "No reason given";
      missReasons[k] = (missReasons[k] ?? 0) + 1;
    }
  const topics = new Map<string, { bank: string; topic: string; answered: number; misses: number }>();
  const micro = new Map<string, number>();
  for (const a of list) {
    const it = items.get(a.itemId);
    const key = a.bank + "|" + (it?.topic ?? "");
    const t = topics.get(key) ?? { bank: a.bank, topic: it?.topic ?? a.bank, answered: 0, misses: 0 };
    t.answered++;
    if (!a.correct) {
      t.misses++;
      if (it?.microtheme) micro.set(it.microtheme, (micro.get(it.microtheme) ?? 0) + 1);
    }
    topics.set(key, t);
  }
  const weekLessons = lessons.filter((l) => l.day >= from && l.day <= to);
  const ratings = weekLessons.flatMap((l) => l.cards.map((c) => latestRating(l, c.id)?.rating));
  const quiz = list.filter((a) => a.mode === "quiz");
  return {
    week,
    from,
    to,
    answered: list.length,
    right,
    accuracy: pct(right, list.length),
    byMode,
    calibration: {
      sure: {
        answered: sure.length,
        right: sure.filter((a) => a.correct).length,
        accuracy: pct(sure.filter((a) => a.correct).length, sure.length),
      },
      unsure: {
        answered: unsure.length,
        right: unsure.filter((a) => a.correct).length,
        accuracy: pct(unsure.filter((a) => a.correct).length, unsure.length),
      },
      confidentMisses: sure.filter((a) => !a.correct).length,
    },
    time: {
      averageSec: ms.length ? Math.round(ms.reduce((n, x) => n + x, 0) / ms.length / 1000) : null,
      medianSec: ms.length ? Math.round(ms[Math.floor(ms.length / 2)] / 1000) : null,
      over72s: ms.filter((x) => x > 72_000).length,
    },
    missReasons,
    missesByTopic: [...topics.values()].filter((t) => t.misses).sort((a, b) => b.misses - a.misses),
    missesByMicrotheme: [...micro]
      .map(([microtheme, misses]) => ({ microtheme, misses }))
      .sort((a, b) => b.misses - a.misses),
    lessons: {
      days: weekLessons.length,
      cards: ratings.length,
      notChecked: weekLessons.flatMap((l) => l.cards).filter((c) => !c.checked).length,
      got: ratings.filter((r) => r === "got").length,
      shaky: ratings.filter((r) => r === "shaky").length,
    },
    quiz: { answered: quiz.length, right: quiz.filter((a) => a.correct).length },
    evidence: {
      "this week's misses": "/prelims/notebook?filter=week",
      "confident misses": "/prelims/notebook?filter=confident",
      "still shaky": "/prelims/notebook?filter=shaky",
      ...Object.fromEntries(weekLessons.map((l) => [`lesson ${l.day}`, `/prelims/lesson?day=${l.day}`])),
    },
  };
}

/** The FSRS due load as of `now`: due today and on each of the next seven days. */
export function dueLoad(attempts: Attempt[], items: Map<string, Item>, now = new Date()) {
  const states = reviewStates(attempts.filter((a) => items.has(a.itemId)));
  const byDay: Record<string, number> = {};
  let dueNow = 0;
  const today = localDay(now.toISOString());
  const end = fromNum(dayNum(today) + 7);
  for (const s of states.values()) {
    if (isDue(s, now)) dueNow++;
    else {
      const d = localDay(s.card.due.toISOString());
      if (d <= end) byDay[d] = (byDay[d] ?? 0) + 1;
    }
  }
  return { dueNow, next7Days: Object.values(byDay).reduce((n, x) => n + x, 0), byDay, tracked: states.size };
}
