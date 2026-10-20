import { describe, expect, it } from "vitest";
import {
  applyLessonOp,
  dueLoad,
  isoWeek,
  lessonDocId,
  lessonIndex,
  LessonError,
  mergeLesson,
  missesFor,
  mistakeLabel,
  shakyQueue,
  shiftWeek,
  validateLesson,
  validateWeeklyNote,
  weekDocId,
  weekFacts,
  weekRange,
  withReturning,
  yourMistake,
  type Lesson,
  type LessonCard,
} from "./lessons";
import type { Attempt, Item, McqItem } from "./practice";

// Synthetic items and lessons: the shapes only, no real questions or teaching.
const statementsItem: McqItem = {
  id: "s-1",
  bank: "sample-bank",
  topic: "Sample topic",
  microtheme: "sample-theme",
  kind: "mcq",
  stem: "Consider the following statements about a sample body:",
  statements: ["It meets twice.", "It has a chair.", "It keeps minutes."],
  options: ["1 and 2 only", "2 and 3 only", "1 and 3 only", "1, 2 and 3"],
  answer: 0,
  source: { type: "pyq", year: 2020, paper: "GS1", keyVerified: true },
};
const plainItem: McqItem = {
  id: "p-1",
  bank: "sample-bank",
  topic: "Sample topic",
  microtheme: "sample-theme",
  kind: "mcq",
  stem: "Which sample city is the sample capital?",
  options: ["Alpha", "Beta", "Gamma", "Delta"],
  answer: 2,
  source: { type: "pyq", year: 2019, paper: "GS1", keyVerified: true },
};
const relatedItem: McqItem = { ...plainItem, id: "p-2", stem: "Another sample question?" };
const unverified: McqItem = {
  ...plainItem,
  id: "p-3",
  source: { type: "pyq", year: 2011, paper: "GS1", keyVerified: false },
};
const items = new Map<string, Item>([statementsItem, plainItem, relatedItem, unverified].map((i) => [i.id, i]));

const attempt = (over: Partial<Attempt>): Attempt => ({
  id: "a-" + Math.random().toString(36).slice(2, 8),
  itemId: "s-1",
  bank: "sample-bank",
  kind: "mcq",
  at: "2026-10-20T12:00:00Z",
  ms: 30_000,
  mode: "practice",
  correct: false,
  ...over,
});

const card = (id: string, over: Partial<LessonCard> = {}): LessonCard => ({
  id,
  concept: `Sample concept ${id}`,
  subject: "Sample subject · Sample topic",
  itemIds: ["s-1"],
  mistakes: [yourMistake(attempt({ chosen: 3, marks: [true, true, true] }), statementsItem)],
  teach: ["A sample paragraph that teaches the concept."],
  remember: "A sample hook.",
  sources: [{ label: "Sample source", url: "https://example.org/sample" }],
  checked: true,
  ...over,
});

const lesson = (day: string, cards: LessonCard[], over: Partial<Lesson> = {}): Lesson => ({
  day,
  written: `${day}T13:30:00Z`,
  cards,
  quiz: ["s-1", "p-1"],
  ratings: [],
  ...over,
});

const rate = (l: Lesson, cardId: string, rating: "got" | "shaky", at: string) =>
  applyLessonOp(l, { op: "rate", cardId, rating, at });

describe("lessons", () => {
  it("accept a well-formed lesson and refuse broken ones with a reason", () => {
    const ok = lesson("2026-10-20", [
      card("c-one"),
      card("c-two", { table: { head: ["", "A", "B"], rows: [["x", "1", "2"]] } }),
    ]);
    expect(validateLesson(ok)).toBe(ok);
    expect(() => validateLesson({ ...ok, day: "20 Oct" })).toThrow(/day/);
    expect(() => validateLesson({ ...ok, cards: [card("c-one"), card("c-one")] })).toThrow(/twice/);
    expect(() => validateLesson({ ...ok, cards: [card("Bad Id")] })).toThrow(LessonError);
    expect(() => validateLesson({ ...ok, cards: [card("c-x", { mistakes: [] })] })).toThrow(/your mistake/);
    expect(() => validateLesson({ ...ok, cards: [card("c-x", { sources: [] })] })).toThrow(/sources/);
    expect(() =>
      validateLesson({ ...ok, cards: [card("c-x", { sources: [{ label: "x", url: "javascript:alert(1)" }] })] }),
    ).toThrow(/source/);
    expect(() => validateLesson({ ...ok, cards: [card("c-x", { checked: undefined as never })] })).toThrow(
      /fact-checked/,
    );
    expect(() =>
      validateLesson({ ...ok, cards: [card("c-x", { table: { head: ["a", "b"], rows: [["only one"]] } })] }),
    ).toThrow(/table/);
    expect(() => validateLesson({ ...ok, quiz: ["s-1", "s-1"] })).toThrow(/twice/);
    expect(() => validateLesson({ ...ok, quiz: Array.from({ length: 21 }, (_, i) => `q-${i}`) })).toThrow(/quiz/);
    expect(lessonDocId("2026-10-20")).toBe("2026-10-20");
    expect(() => lessonDocId("../x")).toThrow();
  });

  it("record presses, ignore a retried one, and take one back on undo", () => {
    let l = lesson("2026-10-20", [card("c-one")]);
    l = rate(l, "c-one", "shaky", "2026-10-20T15:00:00Z");
    expect(rate(l, "c-one", "shaky", "2026-10-20T15:00:00Z")).toBe(l);
    l = rate(l, "c-one", "got", "2026-10-20T15:05:00Z");
    expect(lessonIndex([l]).days[0].cards[0].rating).toBe("got");
    l = applyLessonOp(l, { op: "unrate", cardId: "c-one", at: "2026-10-20T15:05:00Z" });
    expect(l.ratings.map((r) => r.rating)).toEqual(["shaky"]);
    expect(() => rate(l, "c-nope", "got", "2026-10-20T15:00:00Z")).toThrow(/No card/);
    expect(() =>
      applyLessonOp(l, { op: "rate", cardId: "c-one", rating: "meh" as never, at: "2026-10-20T15:00:00Z" }),
    ).toThrow();
    expect(() =>
      applyLessonOp(null, { op: "rate", cardId: "c-one", rating: "got", at: "2026-10-20T15:00:00Z" }),
    ).toThrow(/No lesson/);
  });

  it("list the days newest first with the latest lesson in full", () => {
    const a = lesson("2026-10-19", [card("c-one")]);
    const b = lesson("2026-10-20", [card("c-two")]);
    const idx = lessonIndex([a, b]);
    expect(idx.days.map((d) => d.day)).toEqual(["2026-10-20", "2026-10-19"]);
    expect(idx.latest).toBe(b);
    expect(idx.days[1].cards[0]).toMatchObject({ id: "c-one", itemIds: ["s-1"], checked: true });
    expect(lessonIndex([])).toEqual({ days: [], latest: null });
  });
});

describe("the shaky queue", () => {
  const day1 = rate(lesson("2026-10-18", [card("c-one"), card("c-two")]), "c-one", "shaky", "2026-10-18T15:00:00Z");
  const day1b = rate(day1, "c-two", "got", "2026-10-18T15:01:00Z");

  it("brings a shaky card back until it is called got on two different later days", () => {
    expect(shakyQueue([day1b]).map((s) => [s.card.id, s.since, s.gotDays])).toEqual([["c-one", "2026-10-18", 0]]);
    // Got on the same evening doesn't count; got the next day counts once.
    const sameDay = rate(day1b, "c-one", "got", "2026-10-18T15:10:00Z");
    expect(shakyQueue([sameDay])[0].gotDays).toBe(0);
    const day2 = rate(
      lesson("2026-10-19", [{ ...card("c-one"), returning: "2026-10-18" }]),
      "c-one",
      "got",
      "2026-10-19T15:00:00Z",
    );
    expect(shakyQueue([sameDay, day2])[0]).toMatchObject({ gotDays: 1, lessonDay: "2026-10-19" });
    // Two got-days in a row on the same day still count once.
    const day2b = rate(day2, "c-one", "got", "2026-10-19T16:00:00Z");
    expect(shakyQueue([sameDay, day2b])[0].gotDays).toBe(1);
    const day3 = rate(lesson("2026-10-20", [card("c-one")]), "c-one", "got", "2026-10-20T15:00:00Z");
    expect(shakyQueue([sameDay, day2b, day3])).toEqual([]);
    // A new shaky starts the count again.
    const day4 = rate(lesson("2026-10-21", [card("c-one")]), "c-one", "shaky", "2026-10-21T15:00:00Z");
    expect(shakyQueue([sameDay, day2b, day3, day4])[0]).toMatchObject({ since: "2026-10-21", gotDays: 0 });
  });

  it("adds due shaky cards to a new lesson, after its own cards and marked as returning", () => {
    const tonight = lesson("2026-10-19", [card("c-three")]);
    const { lesson: withBack, added } = withReturning(tonight, [day1b, tonight]);
    expect(added).toEqual(["c-one"]);
    expect(withBack.cards.map((c) => [c.id, c.returning])).toEqual([
      ["c-three", undefined],
      ["c-one", "2026-10-18"],
    ]);
    // A lesson that already teaches it keeps its own version.
    const teaches = lesson("2026-10-19", [card("c-one", { concept: "Rewritten" })]);
    expect(withReturning(teaches, [day1b]).added).toEqual([]);
  });

  it("keeps your presses when the run writes the same day again", () => {
    const current = rate(
      lesson("2026-10-19", [card("c-three"), card("c-four")]),
      "c-three",
      "got",
      "2026-10-19T15:00:00Z",
    );
    const again = lesson("2026-10-19", [card("c-three", { concept: "Better heading" })], { quiz: ["p-1"] });
    const merged = mergeLesson(current, again, [day1b, current]);
    expect(merged.cards.map((c) => c.id)).toEqual(["c-three", "c-one"]);
    expect(merged.cards[0].concept).toBe("Better heading");
    expect(merged.ratings).toEqual([{ cardId: "c-three", rating: "got", at: "2026-10-19T15:00:00Z" }]);
    expect(merged.quiz).toEqual(["p-1"]);
  });
});

describe("your mistake", () => {
  it("names the statements whose marks slipped, against the truth from the answer", () => {
    const m = yourMistake(attempt({ chosen: 3, marks: [true, true, true], sure: true }), statementsItem);
    expect(m.slipped).toEqual([{ n: 3, text: "It keeps minutes.", said: true, truth: false, from: "marked" }]);
    expect(m.chosen).toEqual({ n: 3, text: "1, 2 and 3" });
    expect(m.answer).toEqual({ n: 0, text: "1 and 2 only" });
    expect(mistakeLabel(m)).toBe("confident miss");
  });

  it("reads what the chosen option says when the marks were left blank", () => {
    const m = yourMistake(attempt({ chosen: 1, sure: false }), statementsItem);
    expect(m.slipped.map((s) => [s.n, s.said, s.truth, s.from])).toEqual([
      [1, false, true, "answer"],
      [3, true, false, "answer"],
    ]);
    expect(mistakeLabel(m)).toBe("unsure miss");
  });

  it("uses the item's own truths when it has them", () => {
    const m = yourMistake(attempt({ chosen: 0, marks: [true, false, null] }), {
      ...statementsItem,
      truth: [true, true, false],
    });
    expect(m.slipped).toEqual([{ n: 2, text: "It has a chair.", said: false, truth: true, from: "marked" }]);
  });

  it("falls back to your option against the answer for a single-fact question", () => {
    const m = yourMistake(attempt({ itemId: "p-1", chosen: 1, sure: false, grade: "mixed" }), plainItem);
    expect(m).toMatchObject({
      slipped: [],
      chosen: { n: 1, text: "Beta" },
      answer: { n: 2, text: "Gamma" },
      grade: "mixed",
    });
    expect(
      mistakeLabel(yourMistake(attempt({ itemId: "p-1", chosen: 2, correct: true, grade: "hard" }), plainItem)),
    ).toBe("right, but a guess");
  });
});

describe("misses for the nightly run", () => {
  it("gathers the day's misses and shaky right answers with their history and quiz candidates", () => {
    const log = [
      attempt({ itemId: "p-2", at: "2026-10-15T12:00:00Z", chosen: 0 }),
      attempt({ itemId: "s-1", at: "2026-10-16T12:00:00Z", chosen: 1, sure: true }),
      attempt({ itemId: "s-1", at: "2026-10-20T11:00:00Z", chosen: 3, sure: true, marks: [true, true, true] }),
      attempt({ itemId: "p-1", at: "2026-10-20T11:05:00Z", chosen: 2, correct: true, sure: false, grade: "hard" }),
      attempt({ itemId: "p-2", at: "2026-10-20T11:06:00Z", chosen: 2, correct: true, sure: true, grade: "good" }),
      attempt({ itemId: "s-1", at: "2026-10-21T11:00:00Z", chosen: 3 }),
    ];
    const known = lesson("2026-10-16", [card("c-body", { itemIds: ["s-1"] })]);
    const out = missesFor("2026-10-20", log, items, [known]);
    expect(out.map((m) => m.itemId)).toEqual(["s-1", "p-1"]);
    const [s1, p1] = out;
    expect(s1.truth).toEqual([true, true, false]);
    expect(s1.mistake.slipped.map((s) => s.n)).toEqual([3]);
    expect(s1.earlier.item).toEqual([{ day: "2026-10-16", chosen: 1, sure: true }]);
    expect(s1.earlier.related.map((r) => r.itemId)).toEqual(["p-2"]);
    expect(s1.cards).toEqual([{ id: "c-body", day: "2026-10-16", concept: "Sample concept c-body" }]);
    // Only checked items go to the quiz.
    expect(s1.quizCandidates.map((q) => q.id)).toEqual(["p-1", "p-2"]);
    expect(p1.mistake.correct).toBe(true);
    expect(p1.attempts[0]).toMatchObject({ grade: "hard", sure: false, ms: 30_000 });
  });
});

describe("weekly note", () => {
  const note = {
    week: "2026-W43",
    written: "2026-10-25T13:00:00Z",
    lines: [
      { text: "Sample line.", evidence: { route: "/prelims/notebook?filter=week", label: "This week's misses" } },
    ],
  };

  it("needs each line tied to an app route", () => {
    expect(validateWeeklyNote(note)).toBe(note);
    const bad = (route: string) => ({ ...note, lines: [{ ...note.lines[0], evidence: { route, label: "x" } }] });
    for (const route of ["https://example.org", "//evil.example", "prelims", "/a b"])
      expect(() => validateWeeklyNote(bad(route))).toThrow(/evidence/);
    expect(() => validateWeeklyNote({ ...note, week: "2026-43" })).toThrow(/week/);
    expect(() => validateWeeklyNote({ ...note, lines: [] })).toThrow(/lines/);
    expect(weekDocId("2026-W43")).toBe("2026-W43");
  });

  it("works out ISO weeks", () => {
    expect(isoWeek("2026-10-21")).toBe("2026-W43");
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
    expect(isoWeek("2025-12-29")).toBe("2026-W01");
    expect(isoWeek("2027-01-03")).toBe("2026-W53");
    expect(weekRange("2026-W43")).toEqual({ from: "2026-10-19", to: "2026-10-25" });
    expect(weekRange("2026-W01")).toEqual({ from: "2025-12-29", to: "2026-01-04" });
    expect(shiftWeek("2026-W01", -1)).toBe("2025-W52");
  });

  it("sums up a week: accuracy, calibration, time, misses by topic, lessons and the quiz", () => {
    const log = [
      attempt({ itemId: "s-1", at: "2026-10-20T12:00:00Z", sure: true, grade: "mixed", ms: 80_000 }),
      attempt({ itemId: "p-1", at: "2026-10-21T12:00:00Z", correct: true, sure: false, ms: 20_000 }),
      attempt({ itemId: "p-2", at: "2026-10-22T12:00:00Z", correct: true, sure: true, mode: "quiz", ms: 10_000 }),
      attempt({ itemId: "p-1", at: "2026-10-12T12:00:00Z", correct: false }),
    ];
    const l = rate(lesson("2026-10-20", [card("c-one", { checked: false })]), "c-one", "shaky", "2026-10-20T15:00:00Z");
    const f = weekFacts("2026-W43", log, items, [l]);
    expect(f).toMatchObject({
      from: "2026-10-19",
      to: "2026-10-25",
      answered: 3,
      right: 2,
      accuracy: 66.7,
      byMode: { practice: 2, quiz: 1 },
      calibration: { sure: { answered: 2, right: 1 }, unsure: { answered: 1, right: 1 }, confidentMisses: 1 },
      time: { averageSec: 37, medianSec: 20, over72s: 1 },
      missReasons: { "Mixed up": 1 },
      missesByTopic: [{ bank: "sample-bank", topic: "Sample topic", answered: 3, misses: 1 }],
      missesByMicrotheme: [{ microtheme: "sample-theme", misses: 1 }],
      lessons: { days: 1, cards: 1, notChecked: 1, got: 0, shaky: 1 },
      quiz: { answered: 1, right: 1 },
    });
    expect(f.evidence["lesson 2026-10-20"]).toBe("/prelims/lesson?day=2026-10-20");
  });

  it("counts the FSRS due load", () => {
    const log = [attempt({ itemId: "p-1", at: "2026-10-20T12:00:00Z", correct: false })];
    const load = dueLoad(log, items, new Date("2026-10-21T12:00:00Z"));
    expect(load).toMatchObject({ dueNow: 1, tracked: 1 });
  });
});
