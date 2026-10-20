import { describe, expect, it } from "vitest";
import { bookOrder, dayRange, readDay, subjectCode, subjectsOf, weekDelta } from "./model";
import { parseLessons, parseWeek } from "./data";
import type { Bank, McqItem } from "../lib/practice";

const q = (id: string, bank: string, year?: number): McqItem => ({
  id,
  bank,
  topic: "T",
  kind: "mcq",
  stem: "Sample?",
  options: ["a", "b"],
  answer: 0,
  source: year
    ? { type: "pyq", year, paper: "GS1", keyVerified: true }
    : { type: "claude", checked: true, sources: [{ label: "Test", url: "https://example.com" }] },
});
const bank = (id: string, subject: string, items: McqItem[], order?: number) =>
  ({ id, subject, topic: id, items, ...(order === undefined ? {} : { order }) }) as Bank;

describe("home model", () => {
  it("names subjects with two letters", () => {
    expect(subjectCode("Polity")).toBe("Po");
    expect(subjectCode("Science and Technology")).toBe("St");
    expect(subjectCode("Art & Culture")).toBe("Ac");
    expect(subjectCode("CSAT")).toBe("Cs");
  });

  it("keeps book order: a bank's own order first, else the order banks come in", () => {
    const a = bank("a", "S", []),
      b = bank("b", "S", [], 1),
      c = bank("c", "S", []);
    expect(bookOrder([a, b, c]).map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("lists subjects most asked first, each with its own colour and slug", () => {
    const subjects = subjectsOf([
      bank("polity-x", "Polity", [q("p1", "polity-x", 2020)]),
      bank("eco-x", "Economy", [q("e1", "eco-x", 2020), q("e2", "eco-x", 2021)]),
      bank("sam-x", "Sample geography", [q("s1", "sam-x")]),
    ]);
    expect(subjects.map((s) => s.slug)).toEqual(["economy", "polity", "sample-geography"]);
    expect(subjects[0]).toMatchObject({ pyqs: 2, lastYear: 2021, color: "#e7a52c" });
    expect(subjects[0].share).toBeCloseTo(2 / 3);
    expect(new Set(subjects.map((s) => s.color)).size).toBe(3);
  });

  it("writes dates and changes plainly", () => {
    expect(dayRange("2026-10-15", "2026-10-21")).toBe("15 – 21 October");
    expect(dayRange("2026-09-29", "2026-10-05")).toBe("29 September – 5 October");
    expect(readDay("2026-10-21", "2026-10-21", "2026-10-20")).toBe("Today");
    expect(readDay("2026-10-02", "2026-10-21", "2026-10-20")).toBe("2 Oct");
    expect(readDay(undefined, "2026-10-21", "2026-10-20")).toBe("—");
    expect(weekDelta(9)).toBe("+9 this week");
    expect(weekDelta(-3)).toBe("−3 this week");
    expect(weekDelta(0)).toBe("no change");
  });
});

describe("the nightly engine's lessons and weekly note (optional)", () => {
  it("reads lessons from a map by day or from a list, and skips what it can't read", () => {
    expect(parseLessons({ lessons: { "2026-10-21": { cards: [1, 2, 3], quiz: { items: [1, 2] } } } })).toEqual([
      { day: "2026-10-21", concepts: 3, quiz: 2 },
    ]);
    expect(parseLessons([{ day: "2026-10-20", concepts: 4 }, { nope: true }, "x"])).toEqual([
      { day: "2026-10-20", concepts: 4, quiz: undefined },
    ]);
    expect(parseLessons(null)).toEqual([]);
  });

  it("picks the latest weekly note, with lines as text or {text, evidence}", () => {
    const week = parseWeek({
      weeks: {
        "2026-W42": { lines: ["Old line"] },
        "2026-W43": { lines: [{ text: "Polity rose.", evidence: "readiness" }, "Faster this week.", { bad: 1 }] },
      },
    });
    expect(week).toEqual({
      week: "2026-W43",
      lines: [{ text: "Polity rose.", evidence: "readiness" }, { text: "Faster this week." }],
    });
    expect(parseWeek({ lessons: {} })).toBeNull();
    expect(parseWeek(null)).toBeNull();
  });

  it("reads the shapes M9 actually sends: {days, latest} and {weeks, latest}", () => {
    expect(
      parseLessons({ days: [{ day: "2026-10-20", written: "x", cards: [{ id: "a" }, { id: "b" }], quiz: 5 }], latest: null }),
    ).toEqual([{ day: "2026-10-20", concepts: 2, quiz: 5 }]);
    const week = parseWeek({
      weeks: ["2026-W43"],
      latest: {
        week: "2026-W43",
        written: "x",
        lines: [{ text: "Calibration slipped.", evidence: { route: "/prelims/analytics#calibration", label: "Calibration" } }],
      },
    });
    expect(week).toEqual({
      week: "2026-W43",
      lines: [{ text: "Calibration slipped.", route: "/prelims/analytics#calibration", label: "Calibration" }],
    });
  });
});
