import { describe, expect, it } from "vitest";
import { bankCounts, dueIn, isDue, planSession, reviewStates } from "./srs";
import type { Attempt, Bank, McqItem } from "./practice";

const item = (id: string, verified = true): McqItem => ({
  id,
  bank: "sample",
  topic: "Sample topic",
  kind: "mcq",
  stem: `Sample question ${id}`,
  options: ["a", "b", "c", "d"],
  answer: 0,
  source: { type: "pyq", year: 2020, paper: "GS1", keyVerified: verified },
});
const bank: Bank = {
  id: "sample",
  subject: "Polity",
  topic: "Sample topic",
  items: ["q1", "q2", "q3", "q4"].map((i) => item(i)),
};
bank.items.push(item("q5", false));
const at = (itemId: string, iso: string, correct: boolean, grade?: Attempt["grade"]): Attempt => ({
  id: `${itemId}-${iso}`,
  itemId,
  bank: "sample",
  kind: "mcq",
  at: iso,
  ms: 30_000,
  mode: "practice",
  correct,
  grade,
});

describe("spaced review", () => {
  it("rebuilds each item's state from the log, whatever order the attempts come in", () => {
    const log = [at("q1", "2026-10-21T09:00:00Z", true, "good"), at("q1", "2026-10-15T09:00:00Z", false, "forgot")];
    const s = reviewStates(log).get("q1")!;
    expect(s.seen).toBe(2);
    expect(s.wrong).toBe(1);
    expect(s.last?.at).toBe("2026-10-21T09:00:00Z");
    expect(reviewStates([...log].reverse()).get("q1")!.card.due).toEqual(s.card.due);
  });
  it("brings a miss back sooner than an instant answer", () => {
    const miss = reviewStates([at("q1", "2026-10-21T09:00:00Z", false, "unknown")]).get("q1")!;
    const easy = reviewStates([at("q1", "2026-10-21T09:00:00Z", true, "easy")]).get("q1")!;
    expect(miss.card.due.getTime()).toBeLessThan(easy.card.due.getTime());
    expect(isDue(miss, new Date("2026-10-22T09:00:00Z"))).toBe(true);
    expect(isDue(easy, new Date("2026-10-22T09:00:00Z"))).toBe(false);
  });
  it("plans a session with due questions first, then new ones, and never an unverified key", () => {
    const states = reviewStates([at("q2", "2026-10-01T09:00:00Z", false, "forgot")]);
    const plan = planSession([bank], states, 3, "mcq", new Date("2026-10-21T09:00:00Z"));
    expect(plan.items.map((i) => i.id)).toEqual(["q2", "q1", "q3"]);
    expect(plan).toMatchObject({ due: 1, fresh: 2 });
    const all = planSession([bank], states, 50, "mcq", new Date("2026-10-21T09:00:00Z"));
    expect(all.items.map((i) => i.id)).not.toContain("q5");
  });
  it("counts new, due, learning and review items, and labels due dates", () => {
    const states = reviewStates([at("q2", "2026-10-01T09:00:00Z", false, "forgot")]);
    expect(bankCounts(bank.items, states, new Date("2026-10-21T09:00:00Z"))).toMatchObject({ fresh: 4, due: 1 });
    expect(dueIn(new Date("2026-10-24T09:00:00Z"), new Date("2026-10-21T09:00:00Z"))).toBe("in 3 days");
    expect(dueIn(new Date("2026-10-20T09:00:00Z"), new Date("2026-10-21T09:00:00Z"))).toBe("today");
  });
});
