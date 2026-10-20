import { describe, expect, it } from "vitest";
import { applyReadingOp, lastRead, readingDocId, ReadingError, subjectSlug } from "./reading";

describe("reading log", () => {
  it("makes subject slugs the way the bank ids are made", () => {
    expect(subjectSlug("Science and Technology")).toBe("science-and-technology");
    expect(subjectSlug("Art & Culture")).toBe("art-culture");
    expect(subjectSlug("CSAT")).toBe("csat");
    expect(subjectSlug("  Sample subject ")).toBe("sample-subject");
    expect(readingDocId("polity")).toBe("polity");
    expect(() => readingDocId("../x")).toThrow(ReadingError);
  });

  it("logs a day once, keeps days in order, and undoes a day", () => {
    let log = { topics: {} };
    log = applyReadingOp(log, { op: "log", bank: "polity-parliament", day: "2026-10-21" });
    log = applyReadingOp(log, { op: "log", bank: "polity-parliament", day: "2026-10-02" });
    const same = applyReadingOp(log, { op: "log", bank: "polity-parliament", day: "2026-10-21" });
    expect(same).toBe(log);
    expect(log.topics).toEqual({ "polity-parliament": ["2026-10-02", "2026-10-21"] });
    expect(lastRead(log, "polity-parliament")).toBe("2026-10-21");
    expect(lastRead(log, "polity-dpsp")).toBeUndefined();
    log = applyReadingOp(log, { op: "unlog", bank: "polity-parliament", day: "2026-10-21" });
    expect(lastRead(log, "polity-parliament")).toBe("2026-10-02");
    log = applyReadingOp(log, { op: "unlog", bank: "polity-parliament", day: "2026-10-02" });
    expect(log.topics).toEqual({});
  });

  it("refuses bad changes", () => {
    const log = { topics: {} };
    expect(() => applyReadingOp(log, { op: "log", bank: "Bad Bank", day: "2026-10-21" })).toThrow(ReadingError);
    expect(() => applyReadingOp(log, { op: "log", bank: "polity", day: "21 Oct" })).toThrow(ReadingError);
    expect(() => applyReadingOp(log, { op: "wipe", bank: "polity", day: "2026-10-21" } as never)).toThrow(ReadingError);
  });
});
