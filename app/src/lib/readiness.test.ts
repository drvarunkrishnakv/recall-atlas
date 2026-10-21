import { describe, expect, it } from "vitest";
import {
  addDays,
  BREAK_EVEN,
  calibration,
  clock,
  combine,
  dailyTarget,
  effortByDay,
  guessValue,
  kindStats,
  overallScore,
  PACE_MS,
  pyqShares,
  pyqStats,
  readinessOver,
  speedByWeek,
  traps,
  weakSpots,
  weekPoints,
  weeksSince,
  whereTheMarksAre,
  WEIGHTS,
  workLeft,
  type Parts,
} from "./readiness";
import { reviewStates, retrievability, nextReviewState } from "./srs";
import type { Attempt, Bank, FlashcardItem, Item, McqItem } from "./practice";

const mcq = (id: string, bank: string, extra: Partial<McqItem> = {}): McqItem => ({
  id,
  bank,
  topic: "Sample topic",
  kind: "mcq",
  stem: `Sample question ${id}`,
  options: ["a", "b", "c", "d"],
  answer: 0,
  source: { type: "claude", checked: true, sources: [{ label: "Test", url: "https://example.com" }] },
  ...extra,
});
const pyq = (year: number, verified = true) => ({
  source: { type: "pyq" as const, year, paper: "GS1" as const, keyVerified: verified },
});
const card = (id: string, bank: string, microtheme?: string): FlashcardItem => ({
  id,
  bank,
  topic: "Sample topic",
  kind: "flashcard",
  style: "qa",
  front: "Front",
  back: "Back",
  microtheme,
  source: { type: "claude", checked: true, sources: [{ label: "Test", url: "https://example.com" }] },
});
const bank = (id: string, subject: string, items: Item[]): Bank => ({ id, subject, topic: id, items });

let n = 0;
const ans = (item: Item, iso: string, correct: boolean, extra: Partial<Attempt> = {}): Attempt => ({
  id: `a${++n}`,
  itemId: item.id,
  bank: item.bank,
  kind: item.kind,
  at: iso,
  ms: 40_000,
  mode: "practice",
  correct,
  ...extra,
});
const bySubject = (_: Item, b: Bank) => [b.subject];

describe("readiness", () => {
  const a1 = mcq("a1", "alpha", { microtheme: "Rivers" });
  const a2 = mcq("a2", "alpha", { microtheme: "Rivers" });
  const a3 = mcq("a3", "alpha", { microtheme: "Hills" });
  const a4 = mcq("a4", "alpha", pyq(2011, false)); // unverified key: never counted
  const alpha = bank("alpha", "Geo", [a1, a2, a3, a4, card("c1", "alpha")]);
  const now = new Date("2026-10-21T12:00:00Z");

  it("is zero with nothing answered, and every part but coverage has no evidence yet", () => {
    const [r] = readinessOver([alpha], [], [now], bySubject);
    const geo = r.get("Geo")!;
    expect(geo.score).toBe(0);
    expect(geo.total).toBe(4); // three servable MCQs and a flashcard
    expect(geo.parts).toEqual({ coverage: 0, memory: null, firstTry: null, speed: null, calibration: null });
  });

  it("multiplies quality by coverage, so a few perfect answers can't make a subject ready", () => {
    const log = [ans(a1, "2026-10-21T09:00:00Z", true, { sure: true, grade: "good" })];
    const geo = readinessOver([alpha], log, [now], bySubject)[0].get("Geo")!;
    expect(geo.parts.coverage).toBe(0.25);
    expect(geo.parts.firstTry).toBe(1);
    expect(geo.parts.speed).toBe(1);
    expect(geo.parts.calibration).toBe(1);
    expect(geo.parts.memory).toBeGreaterThan(0.95);
    expect(geo.score).toBeLessThanOrEqual(250);
    expect(geo.score).toBeGreaterThan(240);
  });

  it("computes each part from the log as the design defines it", () => {
    const log = [
      ans(a1, "2026-10-10T09:00:00Z", false, { sure: true, grade: "mixed", ms: 90_000 }),
      ans(a1, "2026-10-20T09:00:00Z", true, { sure: true, grade: "good" }),
      ans(a2, "2026-10-12T09:00:00Z", true, { sure: false, grade: "hard", ms: PACE_MS }),
      ans(alpha.items[4], "2026-10-12T09:00:00Z", true, { grade: "good" }),
    ];
    const geo = readinessOver([alpha], log, [now], bySubject)[0].get("Geo")!;
    expect(geo.seen).toBe(3);
    expect(geo.parts.coverage).toBe(0.75);
    // First tries: a1 wrong, a2 right (flashcards aren't "new questions").
    expect(geo.parts.firstTry).toBe(0.5);
    // Speed: 2 of 3 MCQ answers within 72 s (exactly 72 s counts).
    expect(geo.parts.speed).toBeCloseTo(2 / 3);
    // Calibration: of the two "sure" answers, one was right.
    expect(geo.parts.calibration).toBe(0.5);
    const states = reviewStates(log);
    const memory = [...states.values()].reduce((s, x) => s + retrievability(x, now), 0) / states.size;
    expect(geo.parts.memory).toBeCloseTo(memory, 10);
    expect(geo.score).toBe(combine(geo.parts));
  });

  it("caps memory by recent review accuracy, so a topic you keep missing can't look remembered", () => {
    // Met once, then missed on three later reviews: FSRS alone still predicts some recall.
    const misses = [
      ans(a1, "2026-10-10T09:00:00Z", false, { grade: "mixed" }),
      ans(a1, "2026-10-13T09:00:00Z", false, { grade: "mixed" }),
      ans(a1, "2026-10-16T09:00:00Z", false, { grade: "forgot" }),
      ans(a1, "2026-10-19T09:00:00Z", false, { grade: "mixed" }),
    ];
    const predicted = retrievability(reviewStates(misses).get("a1")!, now);
    expect(predicted).toBeGreaterThan(0.5);
    const geo = readinessOver([alpha], misses, [now], bySubject)[0].get("Geo")!;
    expect(geo.parts.memory).toBe(0);

    // Two reviews aren't a pattern yet: memory stays FSRS's prediction.
    const two = misses.slice(0, 3);
    const early = readinessOver([alpha], two, [now], bySubject)[0].get("Geo")!;
    expect(early.parts.memory).toBeCloseTo(retrievability(reviewStates(two).get("a1")!, now), 10);

    // Reviews that go well never raise memory above the prediction.
    const good = [
      ans(a2, "2026-10-10T09:00:00Z", true, { grade: "good" }),
      ans(a2, "2026-10-13T09:00:00Z", true, { grade: "good" }),
      ans(a2, "2026-10-16T09:00:00Z", true, { grade: "good" }),
      ans(a2, "2026-10-19T09:00:00Z", true, { grade: "good" }),
    ];
    const well = readinessOver([alpha], good, [now], bySubject)[0].get("Geo")!;
    expect(well.parts.memory).toBeCloseTo(retrievability(reviewStates(good).get("a2")!, now), 10);

    // Reviews older than four weeks no longer cap it.
    const later = new Date("2026-11-30T12:00:00Z");
    const old = readinessOver([alpha], misses, [later], bySubject)[0].get("Geo")!;
    expect(old.parts.memory).toBeCloseTo(retrievability(reviewStates(misses).get("a1")!, later), 10);
  });

  it("combines with the documented weights and leaves out parts with no evidence", () => {
    const p: Parts = { coverage: 0.5, memory: 0.8, firstTry: 0.6, speed: 1, calibration: null };
    const w = WEIGHTS.memory + WEIGHTS.firstTry + WEIGHTS.speed;
    const q = (WEIGHTS.memory * 0.8 + WEIGHTS.firstTry * 0.6 + WEIGHTS.speed * 1) / w;
    expect(combine(p)).toBe(Math.round(1000 * 0.5 * q));
    expect(Object.values(WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1);
    expect(combine({ ...p, coverage: 0 })).toBe(0);
    expect(combine({ coverage: 1, memory: 1, firstTry: 1, speed: 1, calibration: 1 })).toBe(1000);
  });

  it("only counts answers made by each moment, so the weekly trend can be replayed", () => {
    const log = [
      ans(a1, "2026-10-01T09:00:00Z", true, { sure: true }),
      ans(a2, "2026-10-15T09:00:00Z", true, { sure: true }),
      ans(a3, "2026-10-20T09:00:00Z", true, { sure: true }),
    ];
    const points = weekPoints(now, 3);
    expect(points.map((p) => p.toISOString().slice(0, 10))).toEqual([
      "2026-09-30",
      "2026-10-07",
      "2026-10-14",
      "2026-10-21",
    ]);
    const series = readinessOver([alpha], log, points, bySubject).map((s) => s.get("Geo")!);
    expect(series.map((r) => r.seen)).toEqual([0, 1, 1, 3]);
    expect(series[0].score).toBe(0);
    expect(series[3].score).toBeGreaterThan(series[1].score);
    // Same answer whatever order the times are asked in.
    const reversed = readinessOver([alpha], log, [...points].reverse(), bySubject).map((s) => s.get("Geo")!.score);
    expect(reversed.reverse()).toEqual(series.map((r) => r.score));
  });

  it("forgets speed and calibration older than four weeks, but keeps first tries", () => {
    const log = [ans(a1, "2026-09-01T09:00:00Z", true, { sure: true, ms: 200_000 })];
    const geo = readinessOver([alpha], log, [now], bySubject)[0].get("Geo")!;
    expect(geo.parts.firstTry).toBe(1);
    expect(geo.parts.speed).toBeNull();
    expect(geo.parts.calibration).toBeNull();
  });

  it("groups items any way asked: by topic and by microtheme in one pass", () => {
    const log = [ans(a1, "2026-10-20T09:00:00Z", true)];
    const [r] = readinessOver([alpha], log, [now], (i, b) => [b.id, `${b.id}/${i.microtheme ?? ""}`]);
    expect(r.get("alpha")!.total).toBe(4);
    expect(r.get("alpha/Rivers")!.total).toBe(2);
    expect(r.get("alpha/Rivers")!.parts.coverage).toBe(0.5);
    expect(r.get("alpha/Hills")!.score).toBe(0);
  });

  it("ignores answers to items that are no longer servable or no longer in a bank", () => {
    const log = [ans(a4, "2026-10-20T09:00:00Z", true), ans(mcq("gone", "alpha"), "2026-10-20T09:00:00Z", true)];
    expect(readinessOver([alpha], log, [now], bySubject)[0].get("Geo")!.seen).toBe(0);
  });

  it("replays FSRS one step at a time exactly as the review states do", () => {
    const log = [ans(a1, "2026-10-10T09:00:00Z", false, { grade: "forgot" }), ans(a1, "2026-10-12T09:00:00Z", true)];
    const stepped = log.reduce<ReturnType<typeof nextReviewState> | undefined>(
      (s, a) => nextReviewState(s, a),
      undefined,
    );
    expect(stepped!.card.due).toEqual(reviewStates(log).get("a1")!.card.due);
  });
});

describe("where the marks are", () => {
  const polity = bank("polity-x", "Polity", [
    mcq("p1", "polity-x", pyq(2020)),
    mcq("p2", "polity-x", pyq(2024)),
    mcq("p3", "polity-x", pyq(2011, false)),
  ]);
  const econ = bank("econ-x", "Economy", [mcq("e1", "econ-x", pyq(2019)), mcq("e2", "econ-x")]);

  it("counts each subject's Prelims PYQs (checked key or not) and the last year asked", () => {
    expect(pyqStats(polity.items)).toEqual({ count: 3, lastYear: 2024 });
    expect(pyqStats(econ.items)).toEqual({ count: 1, lastYear: 2019 });
    expect(pyqStats([mcq("x", "x")])).toEqual({ count: 0, lastYear: undefined });
  });

  it("shares the paper by PYQ count, and falls back to item counts with no PYQs at all", () => {
    const shares = pyqShares([polity, econ], (b) => b.subject);
    expect(shares.get("Polity")).toBe(0.75);
    expect(shares.get("Economy")).toBe(0.25);
    const made = pyqShares(
      [bank("a", "A", [mcq("1", "a"), mcq("2", "a")]), bank("b", "B", [mcq("3", "b")])],
      (b) => b.subject,
    );
    expect(made.get("A")).toBeCloseTo(2 / 3);
  });

  it("ranks subjects by questions per 100-question paper you're not ready for", () => {
    const shares = new Map([
      ["Polity", 0.6],
      ["Economy", 0.4],
    ]);
    const rows = whereTheMarksAre(
      shares,
      new Map([
        ["Polity", 500],
        ["Economy", 0],
      ]),
    );
    expect(rows.map((r) => r.group)).toEqual(["Economy", "Polity"]);
    expect(rows[0].open).toBeCloseTo(40);
    expect(rows[1].open).toBeCloseTo(30);
    expect(overallScore(new Map([["Polity", 500]]), shares)).toBe(300);
    // The open questions add up to the part of the paper you aren't ready for.
    expect(rows.reduce((s, r) => s + r.open, 0)).toBeCloseTo(
      100 - overallScore(new Map([["Polity", 500]]), shares) / 10,
    );
  });
});

describe("calibration", () => {
  const q = mcq("q", "b");
  it("breaks even at a blind guess among four options", () => {
    expect(guessValue(BREAK_EVEN)).toBeCloseTo(0);
    expect(guessValue(1)).toBeCloseTo(2);
    expect(guessValue(0)).toBeCloseTo(-2 / 3);
    expect(guessValue(0.5)).toBeCloseTo(2.667 * 0.5 - 0.667, 2);
  });
  it("splits sure and unsure answers in a time range and works out your own p", () => {
    const log = [
      ans(q, "2026-10-20T09:00:00Z", true, { sure: true }),
      ans(q, "2026-10-20T10:00:00Z", false, { sure: true }),
      ans(q, "2026-10-20T11:00:00Z", true, { sure: false }),
      ans(q, "2026-10-20T12:00:00Z", true, { sure: false }),
      ans(q, "2026-10-20T13:00:00Z", false, { sure: false }),
      ans(q, "2026-10-01T13:00:00Z", false, { sure: false }), // before the range
      ans(card("c", "b"), "2026-10-20T13:00:00Z", false), // flashcards have no lock-in
    ];
    const c = calibration(log, Date.parse("2026-10-14T00:00:00Z"), Date.parse("2026-10-21T00:00:00Z"));
    expect(c.sure).toEqual({ n: 2, right: 1 });
    expect(c.unsure).toEqual({ n: 3, right: 2 });
    expect(c.unsureP).toBeCloseTo(2 / 3);
    expect(c.guessWorth).toBeCloseTo(guessValue(2 / 3));
    expect(c.confidentMisses).toBe(1);
    expect(calibration([], 0, 1).unsureP).toBeNull();
  });
});

describe("effort and the daily target", () => {
  it("spreads unseen items and due reviews over the days left", () => {
    expect(dailyTarget(1800, 60, 214)).toBe(9);
    expect(dailyTarget(10, 0, 0)).toBe(10);
    expect(dailyTarget(0, 0, 100)).toBe(0);
  });
  it("counts the work left from the log", () => {
    const q1 = mcq("q1", "b"),
      q2 = mcq("q2", "b"),
      q3 = mcq("q3", "b", pyq(2011, false));
    const states = reviewStates([ans(q1, "2026-10-01T09:00:00Z", false, { grade: "forgot" })]);
    expect(workLeft([bank("b", "S", [q1, q2, q3])], states, new Date("2026-10-21T09:00:00Z"))).toEqual({
      unseen: 1,
      due: 1,
    });
  });
  it("counts answers per day from the day files, with empty days in between", () => {
    const q = mcq("q", "b");
    const days = {
      "2026-10-19": [ans(q, "2026-10-19T09:00:00Z", true), ans(q, "2026-10-19T10:00:00Z", false)],
      "2026-10-21": [ans(q, "2026-10-21T09:00:00Z", true)],
    };
    expect(effortByDay(days, "2026-10-19", "2026-10-21")).toEqual([
      { day: "2026-10-19", n: 2, right: 1 },
      { day: "2026-10-20", n: 0, right: 0 },
      { day: "2026-10-21", n: 1, right: 1 },
    ]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });
  it("finds the weeks since the first answer for the all-time range", () => {
    const q = mcq("q", "b");
    expect(weeksSince([], new Date("2026-10-21T00:00:00Z"))).toBe(1);
    expect(weeksSince([ans(q, "2026-09-01T00:00:00Z", true)], new Date("2026-10-21T00:00:00Z"))).toBe(8);
  });
  it("averages seconds per MCQ by week", () => {
    const q = mcq("q", "b");
    const log = [
      ans(q, "2026-10-20T09:00:00Z", true, { ms: 50_000 }),
      ans(q, "2026-10-19T09:00:00Z", true, { ms: 70_000 }),
    ];
    const points = weekPoints(new Date("2026-10-21T12:00:00Z"), 1);
    expect(speedByWeek(log, points)).toEqual([null, 60]);
    expect(clock(54_000)).toBe("0:54");
    expect(clock(72_000)).toBe("1:12");
  });
});

describe("weak spots, traps and the drawer", () => {
  const r1 = mcq("r1", "b", { microtheme: "Rivers" });
  const r2 = mcq("r2", "b", { microtheme: "Rivers" });
  const h1 = mcq("h1", "b", { microtheme: "Hills" });
  const s1 = mcq("s1", "b", { microtheme: "Seas" });

  it("needs three answers and a latest miss, and judges each item by its latest answer", () => {
    const log = [
      // Rivers: 3 answers, r1 missed then fixed, r2 missed last → 1 of 2 right last time.
      ans(r1, "2026-10-10T09:00:00Z", false, { grade: "forgot" }),
      ans(r1, "2026-10-12T09:00:00Z", true),
      ans(r2, "2026-10-12T09:00:00Z", false, { grade: "mixed" }),
      // Hills: 3 answers, all wrong → weakest.
      ans(h1, "2026-10-10T09:00:00Z", false, { grade: "mixed" }),
      ans(h1, "2026-10-11T09:00:00Z", false, { grade: "mixed" }),
      ans(h1, "2026-10-12T09:00:00Z", false, { grade: "unknown" }),
      // Seas: only two answers, both wrong → not enough to call.
      ans(s1, "2026-10-10T09:00:00Z", false),
      ans(s1, "2026-10-11T09:00:00Z", false),
    ];
    const weak = weakSpots([r1, r2, h1, s1], log);
    expect(weak.map((w) => w.microtheme)).toEqual(["Hills", "Rivers"]);
    expect(weak[1]).toEqual({ microtheme: "Rivers", attempts: 3, answered: 2, rightLast: 1 });
    // Fixing r2 clears Rivers.
    expect(weakSpots([r1, r2], [...log, ans(r2, "2026-10-14T09:00:00Z", true)])).toEqual([]);
    expect(traps(log).map((t) => [t.label, t.n])).toEqual([
      ["Mixed up", 3],
      ["Didn't know", 1],
      ["Forgot", 1],
    ]);
  });

  it("gathers a topic's drawer: totals, due, recall, time, the 14-day strip, weak spots and traps", () => {
    const c1 = card("c1", "b", "Rivers");
    const b = bank("b", "S", [r1, r2, h1, mcq("p", "b", pyq(2020)), mcq("u", "b", pyq(2011, false)), c1]);
    const days = {
      "2026-10-08": [ans(r1, "2026-10-08T09:00:00Z", false, { grade: "forgot", ms: 30_000 })],
      "2026-10-20": [
        ans(r1, "2026-10-20T09:00:00Z", true, { ms: 50_000 }),
        ans(r2, "2026-10-20T09:05:00Z", false, { grade: "mixed", ms: 70_000 }),
        ans(c1, "2026-10-20T09:10:00Z", true),
      ],
    };
    const now = new Date("2026-10-21T12:00:00Z");
    const states = reviewStates(Object.values(days).flat());
    const m = kindStats(b, "mcq", days, states, now, "2026-10-21");
    expect(m.total).toBe(4);
    expect(m.pyqs).toBe(1);
    expect(m.fresh).toBe(2);
    expect(m.recent).toBe(3);
    expect(m.recall).toBeCloseTo(1 / 3);
    expect(m.avgMs).toBeCloseTo(50_000);
    expect(m.strip).toHaveLength(14);
    expect(m.strip[0].day).toBe("2026-10-08");
    expect(m.strip[0].n).toBe(1);
    expect(m.strip[12]).toEqual({ day: "2026-10-20", n: 2, right: 1 });
    expect(m.traps.map((t) => t.label)).toEqual(["Forgot", "Mixed up"]);
    expect(m.weak.map((w) => w.microtheme)).toEqual(["Rivers"]);
    const f = kindStats(b, "flashcard", days, states, now, "2026-10-21");
    expect(f.total).toBe(1);
    expect(f.recall).toBe(1);
    expect(f.traps).toEqual([]);
  });
});
