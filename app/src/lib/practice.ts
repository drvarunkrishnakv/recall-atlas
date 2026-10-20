// Practice: the questions you answer ("items") and the record of every answer ("attempts").
// Pure, and shared by the app, the CLI and Claude's scheduled runs (docs/ARCHITECTURE.md, Practice).
//
//   items/{bank}            {json: {items: Item[]}}        one bank of items; the CLI writes it
//   attempts/{YYYY-MM-DD}   {json: {attempts: Attempt[]}}  that day's answers, in order
//   srs/{bank}              {json: {cards}}                each item's review state (from M7)
//
// An attempt is added once and never changed afterwards, except for its grade (the miss reason
// or how well you knew it). Everything the engine works out is read from this log.

export type ItemKind = "mcq" | "flashcard" | "puzzle";
export const ITEM_KINDS: readonly ItemKind[] = ["mcq", "flashcard", "puzzle"];

/**
 * Where an item came from. A PYQ is served only once its key matches UPSC's official answer key;
 * an item Claude wrote is served only after its blind fact-check.
 */
export type ItemSource =
  | { type: "pyq"; year: number; paper: "GS1" | "CSAT"; keyVerified: boolean; ref?: string }
  | { type: "claude"; checked: boolean; sources: { label: string; url: string }[] };

interface ItemBase {
  id: string;
  /** The bank it lives in: one per Prelims chapter topic, e.g. "polity-parliament". */
  bank: string;
  /** The syllabus topic it practises, and its microtheme when known. */
  topic: string;
  microtheme?: string;
  source: ItemSource;
}

export interface McqItem extends ItemBase {
  kind: "mcq";
  stem: string;
  /** The numbered statements of a "Consider the following…" question. */
  statements?: string[];
  /** Whether each statement is true, so the session can mark your ✓/✕ on each one. */
  truth?: boolean[];
  options: string[];
  /** Index of the right option. */
  answer: number;
  /** One line per option: why it is right or wrong. */
  why?: string[];
  trap?: string;
}

export interface FlashcardItem extends ItemBase {
  kind: "flashcard";
  style: "qa" | "cloze" | "list" | "image";
  front: string;
  back: string;
  /** A list card's items, ticked off one by one. */
  list?: string[];
}

export interface PuzzleItem extends ItemBase {
  kind: "puzzle";
  prompt: string;
  options: string[];
  answer: number;
  /** 0–1000, on the same scale as your rating. */
  difficulty: number;
  why?: string;
}

export type Item = McqItem | FlashcardItem | PuzzleItem;

/** The grade buttons after an answer, as in the chosen session design. */
export const WRONG_GRADES = ["unknown", "forgot", "mixed", "misread", "guess"] as const;
export const RIGHT_GRADES = ["hard", "good", "easy"] as const;
export type WrongGrade = (typeof WRONG_GRADES)[number];
export type RightGrade = (typeof RIGHT_GRADES)[number];
export type Grade = WrongGrade | RightGrade;

export const GRADE_LABEL: Record<Grade, string> = {
  unknown: "Didn't know",
  forgot: "Forgot",
  mixed: "Mixed up",
  misread: "Misread",
  guess: "Risky guess",
  hard: "Guessed",
  good: "Knew it",
  easy: "Instant",
};

/** FSRS ratings: 1 Again, 2 Hard, 3 Good, 4 Easy. Every wrong answer is Again. */
export type FsrsRating = 1 | 2 | 3 | 4;
export function fsrsRating(grade: Grade): FsrsRating {
  switch (grade) {
    case "hard":
      return 2;
    case "good":
      return 3;
    case "easy":
      return 4;
    default:
      return 1;
  }
}

export type AttemptMode = "practice" | "exam" | "quiz" | "rush";
export const ATTEMPT_MODES: readonly AttemptMode[] = ["practice", "exam", "quiz", "rush"];

export interface Attempt {
  id: string;
  itemId: string;
  bank: string;
  kind: ItemKind;
  /** When you answered (ISO time). */
  at: string;
  /** Time spent on it, in milliseconds. */
  ms: number;
  mode: AttemptMode;
  correct: boolean;
  /** Set when you press a grade button. Puzzles have none. */
  grade?: Grade;
  /** MCQ: your lock-in confidence, the option you chose, and your ✓/✕ (or blank) per statement. */
  sure?: boolean;
  chosen?: number;
  marks?: (boolean | null)[];
  /** Flashcard: what you typed before flipping. */
  typed?: string;
  /** Puzzle: how much your rating moved. */
  delta?: number;
}

export interface AttemptDay {
  attempts: Attempt[];
}

export type AttemptOp = { op: "add"; attempt: Attempt } | { op: "grade"; id: string; grade: Grade };

export class PracticeError extends Error {}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const BANK = /^[a-z0-9][a-z0-9-]{0,60}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_MS = 6 * 60 * 60 * 1000;

const isText = (v: unknown, max = 5000): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const isIndex = (v: unknown, length: number): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < length;
const isGrade = (v: unknown): v is Grade =>
  (WRONG_GRADES as readonly string[]).includes(v as string) ||
  (RIGHT_GRADES as readonly string[]).includes(v as string);
const isWrongGrade = (g: Grade) => (WRONG_GRADES as readonly string[]).includes(g);

function fail(what: string): never {
  throw new PracticeError(what);
}

function checkSource(s: unknown): ItemSource {
  const src = s as Partial<Record<string, unknown>> | null;
  if (src?.type === "pyq") {
    if (!Number.isInteger(src.year) || (src.year as number) < 1979 || (src.year as number) > 2100) fail("Bad PYQ year");
    if (src.paper !== "GS1" && src.paper !== "CSAT") fail("Bad PYQ paper");
    if (typeof src.keyVerified !== "boolean") fail("A PYQ must say whether its key is verified");
  } else if (src?.type === "claude") {
    if (typeof src.checked !== "boolean") fail("A generated item must say whether it was fact-checked");
    const sources = src.sources as unknown;
    if (!Array.isArray(sources) || sources.length === 0) fail("A generated item needs its sources");
    for (const x of sources as { label?: unknown; url?: unknown }[])
      if (!isText(x?.label, 200) || typeof x?.url !== "string" || !/^https?:\/\//.test(x.url)) fail("Bad source");
  } else fail("Unknown item source");
  return s as ItemSource;
}

/** Checks an item read from a bank (or about to be imported) and returns it typed. */
export function validateItem(x: unknown): Item {
  const it = x as Partial<Record<string, unknown>> | null;
  if (!it || typeof it !== "object") fail("Not an item");
  if (typeof it.id !== "string" || !ID.test(it.id)) fail("Bad item id");
  if (typeof it.bank !== "string" || !BANK.test(it.bank)) fail(`Bad bank on ${it.id}`);
  if (!isText(it.topic, 120)) fail(`No topic on ${it.id}`);
  checkSource(it.source);
  switch (it.kind) {
    case "mcq": {
      if (!isText(it.stem)) fail(`No question on ${it.id}`);
      const options = it.options as unknown;
      if (!Array.isArray(options) || options.length < 2 || options.length > 5 || !options.every((o) => isText(o, 1000)))
        fail(`Bad options on ${it.id}`);
      if (!isIndex(it.answer, options.length)) fail(`Bad answer on ${it.id}`);
      if (it.statements !== undefined) {
        const st = it.statements as unknown;
        if (!Array.isArray(st) || st.length < 2 || !st.every((s) => isText(s, 1000)))
          fail(`Bad statements on ${it.id}`);
        if (it.truth !== undefined) {
          const t = it.truth as unknown;
          if (!Array.isArray(t) || t.length !== st.length || !t.every((v) => typeof v === "boolean"))
            fail(`Statement truths on ${it.id} don't match its statements`);
        }
      } else if (it.truth !== undefined) fail(`Truths without statements on ${it.id}`);
      if (it.why !== undefined) {
        const why = it.why as unknown;
        if (!Array.isArray(why) || why.length !== options.length || !why.every((w) => typeof w === "string"))
          fail(`Need one "why" line per option on ${it.id}`);
      }
      break;
    }
    case "flashcard":
      if (!["qa", "cloze", "list", "image"].includes(it.style as string)) fail(`Bad card style on ${it.id}`);
      if (!isText(it.front) || !isText(it.back)) fail(`A card needs a front and a back (${it.id})`);
      if (it.list !== undefined && (!Array.isArray(it.list) || !(it.list as unknown[]).every((s) => isText(s, 500))))
        fail(`Bad list on ${it.id}`);
      break;
    case "puzzle": {
      if (!isText(it.prompt)) fail(`No prompt on ${it.id}`);
      const options = it.options as unknown;
      if (!Array.isArray(options) || options.length < 2 || options.length > 5 || !options.every((o) => isText(o, 1000)))
        fail(`Bad options on ${it.id}`);
      if (!isIndex(it.answer, options.length)) fail(`Bad answer on ${it.id}`);
      if (!Number.isInteger(it.difficulty) || (it.difficulty as number) < 0 || (it.difficulty as number) > 1000)
        fail(`Difficulty on ${it.id} must be 0–1000`);
      break;
    }
    default:
      fail(`Unknown item kind on ${it.id}`);
  }
  return it as unknown as Item;
}

/** Whether a session may use the item: a PYQ needs a verified key, a generated item its fact-check. */
export const servable = (item: Item) => (item.source.type === "pyq" ? item.source.keyVerified : item.source.checked);

/** Checks an attempt before it joins the log. */
export function validateAttempt(x: unknown): Attempt {
  const a = x as Partial<Record<string, unknown>> | null;
  if (!a || typeof a !== "object") fail("Not an attempt");
  if (typeof a.id !== "string" || !ID.test(a.id)) fail("Bad attempt id");
  if (typeof a.itemId !== "string" || !ID.test(a.itemId)) fail("Bad item id");
  if (typeof a.bank !== "string" || !BANK.test(a.bank)) fail("Bad bank");
  if (!ITEM_KINDS.includes(a.kind as ItemKind)) fail("Bad kind");
  if (typeof a.at !== "string" || !ISO.test(a.at) || Number.isNaN(Date.parse(a.at))) fail("Bad time");
  if (!Number.isInteger(a.ms) || (a.ms as number) < 0 || (a.ms as number) > MAX_MS) fail("Bad duration");
  if (!ATTEMPT_MODES.includes(a.mode as AttemptMode)) fail("Bad mode");
  if (typeof a.correct !== "boolean") fail("Say whether it was right");
  if (a.grade !== undefined) {
    if (a.kind === "puzzle") fail("Puzzles have no grade");
    if (!isGrade(a.grade)) fail("Bad grade");
    if (isWrongGrade(a.grade) === a.correct)
      fail("That grade doesn't fit a " + (a.correct ? "right" : "wrong") + " answer");
  }
  if (a.sure !== undefined && typeof a.sure !== "boolean") fail("Bad confidence");
  if (a.chosen !== undefined && !(Number.isInteger(a.chosen) && (a.chosen as number) >= 0 && (a.chosen as number) < 5))
    fail("Bad choice");
  if (a.marks !== undefined) {
    const m = a.marks as unknown;
    if (!Array.isArray(m) || m.length > 12 || !m.every((v) => v === null || typeof v === "boolean")) fail("Bad marks");
  }
  if (a.typed !== undefined && (typeof a.typed !== "string" || a.typed.length > 2000)) fail("Typed answer too long");
  if (a.delta !== undefined && (a.kind !== "puzzle" || !Number.isFinite(a.delta))) fail("Only puzzles move the rating");
  return a as unknown as Attempt;
}

/**
 * Applies one change to a day's log. Adding an attempt that is already there does nothing, so a
 * retried save can't count an answer twice. Only the grade of an attempt can change later.
 */
export function applyAttemptOp(day: AttemptDay, op: AttemptOp): AttemptDay {
  switch (op.op) {
    case "add": {
      const a = validateAttempt(op.attempt);
      if (day.attempts.some((x) => x.id === a.id)) return day;
      return { ...day, attempts: [...day.attempts, a] };
    }
    case "grade": {
      if (!isGrade(op.grade)) fail("Bad grade");
      const cur = day.attempts.find((x) => x.id === op.id);
      if (!cur) fail(`No attempt ${op.id}`);
      validateAttempt({ ...cur, grade: op.grade });
      return { ...day, attempts: day.attempts.map((x) => (x.id === op.id ? { ...x, grade: op.grade } : x)) };
    }
  }
}

/** The `attempts/{id}` document for a local calendar day. */
export function attemptsDocId(day: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail("Bad day");
  return day;
}
