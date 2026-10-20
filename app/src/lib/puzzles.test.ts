import { describe, expect, it } from "vitest";
import {
  eloDelta,
  expectedScore,
  pickPuzzle,
  puzzleKind,
  puzzlePool,
  recentPuzzles,
  rightAnswer,
  rushBest,
  rushQueue,
  rushRuns,
  solves,
} from "./puzzles";
import { ratingAfter, type Attempt, type Bank, type PuzzleItem } from "./practice";

// Synthetic puzzles: the shapes only, no real content.
const src = { type: "claude" as const, checked: true, sources: [{ label: "Sample", url: "https://example.org" }] };
const base = { bank: "sample-puzzles", topic: "Sample topic", kind: "puzzle", source: src } as const;
const tf = (id: string, difficulty = 500, truth = true): PuzzleItem => ({
  ...base,
  id,
  style: "tf",
  prompt: "True or false?",
  statement: `Sample statement ${id}.`,
  truth,
  difficulty,
});
const match: PuzzleItem = {
  ...base,
  id: "m1",
  style: "match",
  prompt: "Match each sample to its partner.",
  pairs: [
    { left: "A", right: "Alpha" },
    { left: "B", right: "Beta" },
  ],
  difficulty: 600,
};
const order: PuzzleItem = {
  ...base,
  id: "o1",
  style: "order",
  prompt: "Oldest first.",
  order: ["First", "Second", "Third"],
  difficulty: 550,
};
const map: PuzzleItem = {
  ...base,
  id: "p1",
  style: "map",
  prompt: "Tap the sample bay.",
  map: "svg:sample-coast",
  alt: "A sample coast",
  regions: [
    { id: "A", x: 20, y: 20 },
    { id: "B", x: 60, y: 60, label: "Sample bay" },
  ],
  region: "B",
  difficulty: 450,
};
const pick: PuzzleItem = { ...base, id: "k1", prompt: "Pick one.", options: ["x", "y"], answer: 1, difficulty: 500 };

const attempt = (over: Partial<Attempt>): Attempt => ({
  id: "a",
  itemId: "t1",
  bank: "sample-puzzles",
  kind: "puzzle",
  at: "2026-10-21T08:00:00.000Z",
  ms: 3000,
  mode: "practice",
  correct: true,
  ...over,
});

describe("Elo", () => {
  it("expects an even chance at equal ratings and moves by K/2", () => {
    expect(expectedScore(500, 500)).toBe(0.5);
    expect(eloDelta(500, 500, 1)).toBe(16);
    expect(eloDelta(500, 500, 0)).toBe(-16);
  });
  it("gives more for beating a harder puzzle and costs more to miss an easy one", () => {
    // d − R = 400: expected 1/11, so a solve earns round(32 × 10/11) = 29.
    expect(expectedScore(500, 900)).toBeCloseTo(1 / 11);
    expect(eloDelta(500, 900, 1)).toBe(29);
    expect(eloDelta(500, 100, 0)).toBe(-29);
    expect(eloDelta(612, 520, 0)).toBe(Math.round(32 * (0 - 1 / (1 + 10 ** ((520 - 612) / 400)))));
  });
  it("moves the same 0–1000 rating as MCQs", () => {
    const log = [attempt({ id: "a1", delta: eloDelta(500, 500, 1) }), attempt({ id: "a2", kind: "mcq", delta: 8 })];
    expect(ratingAfter(log)).toBe(524);
  });
});

describe("answers", () => {
  it("check each style", () => {
    expect(solves(tf("t1"), { kind: "tf", value: true })).toBe(true);
    expect(solves(tf("t1", 500, false), { kind: "tf", value: true })).toBe(false);
    expect(solves(match, { kind: "match", pairs: { A: "Alpha", B: "Beta" } })).toBe(true);
    expect(solves(match, { kind: "match", pairs: { A: "Beta", B: "Alpha" } })).toBe(false);
    expect(solves(match, { kind: "match", pairs: { A: "Alpha" } })).toBe(false);
    expect(solves(order, { kind: "order", order: ["First", "Second", "Third"] })).toBe(true);
    expect(solves(order, { kind: "order", order: ["Second", "First", "Third"] })).toBe(false);
    expect(solves(map, { kind: "map", region: "B" })).toBe(true);
    expect(solves(map, { kind: "map", region: "A" })).toBe(false);
    expect(solves(pick, { kind: "pick", option: 1 })).toBe(true);
    expect(solves(map, { kind: "tf", value: true })).toBe(false);
  });
  it("say the right answer after a miss", () => {
    expect(rightAnswer(tf("t1", 500, false))).toBe("The statement is false.");
    expect(rightAnswer(match)).toBe("A → Alpha · B → Beta");
    expect(rightAnswer(order)).toBe("1. First  2. Second  3. Third");
    expect(rightAnswer(map)).toBe("The right place is B (Sample bay).");
    expect(puzzleKind(pick)).toBe("pick");
  });
});

describe("the next puzzle", () => {
  const pool = [tf("t1", 300), tf("t2", 480), tf("t3", 520), tf("t4", 900), match, order, map];
  it("comes from near your rating", () => {
    const got = new Set(Array.from({ length: 40 }, (_, i) => pickPuzzle(pool, 500, [], () => (i % 10) / 10)!.id));
    // Five nearest within ±100 of 500: t2, t3, o1 (550), p1 (450), m1 (600).
    expect([...got].sort()).toEqual(["m1", "o1", "p1", "t2", "t3"]);
  });
  it("avoids recent ones, and brings back the one met longest ago when all are recent", () => {
    const recent = ["t2", "t3", "o1", "p1", "m1"];
    const got = pickPuzzle(pool, 500, recent, () => 0)!;
    expect(["t1", "t4"]).toContain(got.id);
    const all = ["t1", "t2", "t3", "t4", "m1", "o1", "p1"];
    expect(pickPuzzle(pool, 500, all)!.id).toBe("p1");
    expect(pickPuzzle([], 500, [])).toBeNull();
  });
  it("draws only from the chosen subjects and servable puzzles", () => {
    const banks: Bank[] = [
      { id: "a-tf", subject: "Polity", topic: "True or false", items: [tf("t1")] },
      {
        id: "b-tf",
        subject: "Economy",
        topic: "True or false",
        items: [tf("t2"), { ...tf("t9"), source: { ...src, checked: false } }],
      },
    ];
    expect(puzzlePool(banks).map((p) => p.id)).toEqual(["t1", "t2"]);
    expect(puzzlePool(banks, ["Economy"]).map((p) => p.id)).toEqual(["t2"]);
    expect(puzzlePool([{ ...banks[0], items: [tf("t1"), match] }], null, ["tf"]).map((p) => p.id)).toEqual(["t1"]);
  });
  it("knows what you met recently, newest first", () => {
    const log = [
      attempt({ id: "1", itemId: "t1", at: "2026-10-21T08:00:00Z" }),
      attempt({ id: "2", itemId: "t2", at: "2026-10-21T09:00:00Z" }),
      attempt({ id: "3", itemId: "t1", at: "2026-10-21T10:00:00Z" }),
      attempt({ id: "4", itemId: "c1", kind: "flashcard", at: "2026-10-21T11:00:00Z" }),
    ];
    expect(recentPuzzles(log)).toEqual(["t1", "t2"]);
  });
});

describe("Rush", () => {
  it("scores each run by its right answers and keeps the best", () => {
    const log = [
      attempt({ id: "1", mode: "rush", session: "r1" }),
      attempt({ id: "2", mode: "rush", session: "r1" }),
      attempt({ id: "3", mode: "rush", session: "r1", correct: false }),
      attempt({ id: "4", mode: "rush", session: "r2", at: "2026-10-22T08:00:00.000Z" }),
      attempt({ id: "5", mode: "practice" }),
    ];
    expect(rushRuns(log).map((r) => [r.session, r.score, r.misses])).toEqual([
      ["r1", 2, 1],
      ["r2", 1, 0],
    ]);
    expect(rushBest(log)).toBe(2);
    expect(rushBest([])).toBe(0);
  });
  it("queues easier puzzles first", () => {
    const q = rushQueue([tf("h", 900), tf("e", 200), tf("m", 520)], () => 0.5);
    expect(q.map((p) => p.id)).toEqual(["e", "m", "h"]);
  });
});
