import { describe, expect, it } from "vitest";
import {
  applyAttemptOp,
  attemptsDocId,
  fsrsRating,
  GRADE_LABEL,
  PracticeError,
  RIGHT_GRADES,
  servable,
  validateAttempt,
  validateItem,
  WRONG_GRADES,
  type Attempt,
  type AttemptDay,
} from "./practice";

// Synthetic items: the shapes only, no real questions.
const mcq = {
  id: "pyq-2020-01",
  bank: "polity-parliament",
  topic: "Parliament",
  kind: "mcq",
  stem: "Consider the following statements about a sample body.",
  statements: ["Statement one.", "Statement two."],
  truth: [true, false],
  options: ["1 only", "2 only", "Both 1 and 2", "Neither 1 nor 2"],
  answer: 0,
  why: ["Only 1 is true.", "2 is false.", "2 is false.", "1 is true."],
  source: { type: "pyq", year: 2020, paper: "GS1", keyVerified: true },
};
const card = {
  id: "card-1",
  bank: "polity-parliament",
  topic: "Parliament",
  kind: "flashcard",
  style: "qa",
  front: "A sample question?",
  back: "A sample answer.",
  source: { type: "claude", checked: true, sources: [{ label: "Sample source", url: "https://example.org" }] },
};
const puzzle = {
  id: "pz-1",
  bank: "polity-parliament",
  topic: "Parliament",
  kind: "puzzle",
  prompt: "Pick the odd one out.",
  options: ["A", "B", "C", "D"],
  answer: 2,
  difficulty: 640,
  source: { type: "claude", checked: false, sources: [{ label: "Sample source", url: "https://example.org" }] },
};
const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  id: "a1",
  itemId: "pyq-2020-01",
  bank: "polity-parliament",
  kind: "mcq",
  at: "2026-10-20T09:15:00.000Z",
  ms: 41_000,
  mode: "practice",
  correct: false,
  sure: true,
  chosen: 2,
  marks: [true, true],
  ...over,
});

describe("items", () => {
  it("accept an MCQ, a flashcard and a puzzle", () => {
    expect(validateItem(mcq).kind).toBe("mcq");
    expect(validateItem(card).kind).toBe("flashcard");
    expect(validateItem(puzzle).kind).toBe("puzzle");
  });
  it("reject an answer outside the options, and truths that don't match the statements", () => {
    expect(() => validateItem({ ...mcq, answer: 4 })).toThrow(PracticeError);
    expect(() => validateItem({ ...mcq, truth: [true] })).toThrow(/don't match/);
    expect(() => validateItem({ ...mcq, why: ["one line"] })).toThrow(/per option/);
    expect(() => validateItem({ ...puzzle, difficulty: 1200 })).toThrow(/0–1000/);
  });
  it("need a PYQ to say whether its key is verified, and a generated item its sources", () => {
    expect(() => validateItem({ ...mcq, source: { type: "pyq", year: 2020, paper: "GS1" } })).toThrow(/verified/);
    expect(() => validateItem({ ...card, source: { type: "claude", checked: true, sources: [] } })).toThrow(/sources/);
    expect(() => validateItem({ ...mcq, bank: "Polity Parliament" })).toThrow(/bank/);
  });
  it("only serve PYQs with a verified key and generated items that were fact-checked", () => {
    expect(servable(validateItem(mcq))).toBe(true);
    expect(servable(validateItem({ ...mcq, source: { ...mcq.source, keyVerified: false } }))).toBe(false);
    expect(servable(validateItem(card))).toBe(true);
    expect(servable(validateItem(puzzle))).toBe(false);
  });
});

describe("grades", () => {
  it("label all eight buttons and map them to FSRS", () => {
    expect([...WRONG_GRADES, ...RIGHT_GRADES].map((g) => GRADE_LABEL[g])).toEqual([
      "Didn't know",
      "Forgot",
      "Mixed up",
      "Misread",
      "Risky guess",
      "Guessed",
      "Knew it",
      "Instant",
    ]);
    for (const g of WRONG_GRADES) expect(fsrsRating(g)).toBe(1);
    expect(RIGHT_GRADES.map(fsrsRating)).toEqual([2, 3, 4]);
  });
});

describe("the attempt log", () => {
  const empty: AttemptDay = { attempts: [] };
  it("adds an attempt once, even if the save is retried", () => {
    let day = applyAttemptOp(empty, { op: "add", attempt: attempt() });
    day = applyAttemptOp(day, { op: "add", attempt: attempt() });
    expect(day.attempts).toHaveLength(1);
  });
  it("lets only the grade change later, and only to one that fits the answer", () => {
    let day = applyAttemptOp(empty, { op: "add", attempt: attempt() });
    day = applyAttemptOp(day, { op: "grade", id: "a1", grade: "mixed" });
    expect(day.attempts[0].grade).toBe("mixed");
    expect(() => applyAttemptOp(day, { op: "grade", id: "a1", grade: "good" })).toThrow(/doesn't fit a wrong/);
    expect(() => applyAttemptOp(day, { op: "grade", id: "nope", grade: "forgot" })).toThrow(/No attempt/);
  });
  it("refuses grades on puzzles, rating changes on flashcards, and bad times", () => {
    expect(() => validateAttempt(attempt({ kind: "puzzle", grade: "forgot" }))).toThrow(/Puzzles/);
    expect(() => validateAttempt(attempt({ kind: "flashcard", delta: 8 }))).toThrow(/Only MCQs and puzzles/);
    expect(validateAttempt(attempt({ delta: -7 })).delta).toBe(-7);
    expect(validateAttempt(attempt({ kind: "puzzle", delta: -7, chosen: 1, marks: undefined })).delta).toBe(-7);
    expect(() => validateAttempt(attempt({ at: "yesterday" }))).toThrow(/time/);
    expect(() => validateAttempt(attempt({ ms: -1 }))).toThrow(/duration/);
    expect(() => validateAttempt(attempt({ correct: true, grade: "unknown" }))).toThrow(/right answer/);
  });
  it("files each day under its own document", () => {
    expect(attemptsDocId("2026-10-20")).toBe("2026-10-20");
    expect(() => attemptsDocId("20/10/2026")).toThrow(PracticeError);
  });
});
