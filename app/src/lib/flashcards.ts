// Flashcards (Flashcards 1 · Classic stack): you type an answer, flip, and say how well you knew it.
// This file checks the typed answer against the card to suggest a grade, maps the four buttons
// to the log's grades, and says when a card comes back. Pure; FSRS lives in lib/srs.ts.
//
// Card styles: "qa" (a question and its answer), "cloze" (the front marks the blank with ___ and
// the back holds the missing words), "list" (the back sums up, `list` holds the items) and
// "image" (a picture with its alt text, and a question about it).
import { createEmptyCard, fsrs, type Card, type Grade as FsrsGrade } from "ts-fsrs";
import { fsrsRating, type FlashcardItem, type Grade } from "./practice.ts";

/** The four buttons under a flipped card, and the grade each one logs. */
export type CardGrade = "forgot" | "hard" | "knew" | "easy";
export const CARD_GRADES: readonly CardGrade[] = ["forgot", "hard", "knew", "easy"];
export const CARD_GRADE: Record<CardGrade, Grade> = { forgot: "forgot", hard: "hard", knew: "good", easy: "easy" };
export const CARD_GRADE_LABEL: Record<CardGrade, string> = {
  forgot: "Forgot",
  hard: "Hard",
  knew: "Knew it",
  easy: "Easy",
};

export const CARD_STYLE_LABEL: Record<FlashcardItem["style"], string> = {
  cloze: "Fill the blank",
  qa: "Question",
  list: "List",
  image: "Picture",
};

const STOP = new Set(
  "a an the of and or in on at to for by with is are was were be it its as from that this which what who".split(" "),
);
const NUMBERS: Record<string, string> = {};
[
  ["one", "first"],
  ["two", "second"],
  ["three", "third"],
  ["four", "fourth"],
  ["five", "fifth"],
  ["six", "sixth"],
  ["seven", "seventh"],
  ["eight", "eighth"],
  ["nine", "ninth"],
  ["ten", "tenth"],
  ["eleven", "eleventh"],
  ["twelve", "twelfth"],
].forEach((words, i) => words.forEach((w) => (NUMBERS[w] = String(i + 1))));

/** Lower case, no accents or punctuation, number words and ordinals as digits, no filler words. */
export function answerTokens(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((t) => NUMBERS[t] ?? t.replace(/^(\d+)(st|nd|rd|th)$/, "$1"))
    .filter((t) => !STOP.has(t));
}

/** One edit apart (a typo), for words of five letters or more. */
function near(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1 || /\d/.test(a + b)) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}

/**
 * The words an answer must contain: its own, less any the question already gives away. When it
 * holds numbers (an Article, a year), the numbers are what you have to know.
 */
function keyTokens(answer: string, front: string): string[] {
  const given = new Set(answerTokens(front));
  const own = [...new Set(answerTokens(answer))];
  const numbers = own.filter((t) => /^\d+$/.test(t));
  if (numbers.length) return numbers;
  const key = own.filter((t) => !given.has(t));
  return key.length ? key : own;
}

const covered = (key: string[], typed: string[]) => key.filter((k) => typed.some((t) => near(k, t))).length;

/** A list item's head: the part before " · ", " — " or ": ", which is what you name. */
const head = (item: string) => item.split(/\s+[·—–]\s+|:\s+/)[0];

export interface TypedCheck {
  /** Nothing was typed: no suggestion. */
  empty: boolean;
  verdict?: "match" | "partial" | "miss";
  /** A list card: which items you named. */
  hits?: boolean[];
  suggest?: CardGrade;
}

/** How the typed answer compares with the card, and the grade it suggests. */
export function checkTyped(card: FlashcardItem, typed: string): TypedCheck {
  const words = answerTokens(typed);
  if (!typed.trim()) return { empty: true };
  let verdict: "match" | "partial" | "miss";
  let hits: boolean[] | undefined;
  if (card.style === "list" && card.list?.length) {
    hits = card.list.map((item) => {
      const key = keyTokens(head(item), card.front);
      return covered(key, words) === key.length;
    });
    const n = hits.filter(Boolean).length;
    verdict = n === hits.length ? "match" : n >= Math.ceil(hits.length / 2) ? "partial" : "miss";
  } else {
    const key = keyTokens(card.back, card.front);
    const n = covered(key, words);
    verdict = n === key.length ? "match" : n * 2 >= key.length ? "partial" : "miss";
  }
  return {
    empty: false,
    verdict,
    hits,
    suggest: verdict === "match" ? "knew" : verdict === "partial" ? "hard" : "forgot",
  };
}

/** A cloze card's front around its blank(s) (___); one part means there is no blank. */
export const clozeParts = (front: string) => front.split(/_{3,}/);

const scheduler = fsrs({ enable_fuzz: false, request_retention: 0.9 });

/** "back in 10 min", "back in 6 days": when a grade would bring the card back (FSRS, as srs.ts). */
export function backIn(grade: CardGrade, card: Card | undefined, now = new Date()): string {
  const next = scheduler.next(card ?? createEmptyCard(now), now, fsrsRating(CARD_GRADE[grade]) as FsrsGrade).card.due;
  const mins = (next.getTime() - now.getTime()) / 60_000;
  if (mins < 60) return `back in ${Math.max(1, Math.round(mins))} min`;
  if (mins < 60 * 24) return `back in ${Math.round(mins / 60)} h`;
  const days = Math.round(mins / 1440);
  return days === 1 ? "back tomorrow" : `back in ${days} days`;
}
