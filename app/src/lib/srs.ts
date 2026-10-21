// Spaced review for MCQs and flashcards with FSRS (ts-fsrs). The attempt log is the only record:
// each item's review state is rebuilt by replaying its graded attempts in time order, so there is
// no second copy that can drift. Puzzles stay outside FSRS.
import { createEmptyCard, fsrs, State, type Card, type Grade } from "ts-fsrs";
import { fsrsRating, servable, type Attempt, type Bank, type Item } from "./practice.ts";

// Default FSRS weights until a month of your own reviews lets us fit them (DECISIONS 2026-10-20).
// No fuzz, so the same log always gives the same due dates.
const scheduler = fsrs({ enable_fuzz: false, request_retention: 0.9 });

export interface ReviewState {
  card: Card;
  /** How many times you answered it, and how many of those were wrong. */
  seen: number;
  wrong: number;
  last?: Attempt;
}

/** Every MCQ and flashcard's FSRS state, from the attempts (any order). */
export function reviewStates(attempts: Attempt[]): Map<string, ReviewState> {
  const out = new Map<string, ReviewState>();
  const sorted = attempts.filter((a) => a.kind !== "puzzle").sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const a of sorted) {
    const at = new Date(a.at);
    const cur = out.get(a.itemId) ?? { card: createEmptyCard(at), seen: 0, wrong: 0 };
    const grade = (a.grade ? fsrsRating(a.grade) : a.correct ? 3 : 1) as Grade;
    const next = scheduler.next(cur.card, at, grade).card;
    out.set(a.itemId, { card: next, seen: cur.seen + 1, wrong: cur.wrong + (a.correct ? 0 : 1), last: a });
  }
  return out;
}

export const isDue = (s: ReviewState | undefined, now = new Date()) => !!s && s.card.due.getTime() <= now.getTime();

/** "today", "in 3 days", "in 2 months", for a due date. */
export function dueIn(due: Date, now = new Date()): string {
  const days = Math.round((due.getTime() - now.getTime()) / 864e5);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 45) return `in ${days} days`;
  return `in ${Math.round(days / 30)} months`;
}

export interface SessionPlan {
  items: Item[];
  due: number;
  fresh: number;
}

/**
 * The items for a session from the chosen banks: questions due for review first (most overdue
 * first), then ones you haven't seen, in bank order. Only items a session may use are included.
 */
export function planSession(
  banks: Bank[],
  states: Map<string, ReviewState>,
  size: number,
  kind: "mcq" | "flashcard" = "mcq",
  now = new Date(),
): SessionPlan {
  const pool = banks.flatMap((b) => b.items).filter((i) => i.kind === kind && servable(i));
  const due = pool
    .filter((i) => isDue(states.get(i.id), now))
    .sort((a, b) => states.get(a.id)!.card.due.getTime() - states.get(b.id)!.card.due.getTime());
  const fresh = pool.filter((i) => !states.has(i.id));
  const items = [...due, ...fresh].slice(0, Math.max(1, size));
  return { items, due: Math.min(due.length, items.length), fresh: Math.max(0, items.length - due.length) };
}

/** Counts for a set of items: how many are new, due now, learning and settled into review. */
export function bankCounts(items: Item[], states: Map<string, ReviewState>, now = new Date()) {
  let fresh = 0,
    due = 0,
    learning = 0,
    review = 0;
  for (const i of items) {
    const s = states.get(i.id);
    if (!s) fresh++;
    else if (isDue(s, now)) due++;
    else if (s.card.state === State.Review) review++;
    else learning++;
  }
  return { fresh, due, learning, review };
}

/** One answer applied to an item's review state: the step `reviewStates` repeats (M11 replays it for trends). */
export function nextReviewState(cur: ReviewState | undefined, a: Attempt): ReviewState {
  const at = new Date(a.at);
  const base = cur ?? { card: createEmptyCard(at), seen: 0, wrong: 0 };
  const grade = (a.grade ? fsrsRating(a.grade) : a.correct ? 3 : 1) as Grade;
  const card = scheduler.next(base.card, at, grade).card;
  return { card, seen: base.seen + 1, wrong: base.wrong + (a.correct ? 0 : 1), last: a };
}

/** How likely you are to recall an item at `now` (0–1), from its FSRS state (M11 readiness). */
export const retrievability = (s: ReviewState, now = new Date()) => scheduler.get_retrievability(s.card, now, false);
