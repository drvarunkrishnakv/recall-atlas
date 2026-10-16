import { describe, expect, it } from "vitest";
import { applyCaptureOp, applyProgressOp, dueLabel, isDue, nextDue, ProgressOpError, type Progress } from "./progress";

const empty: Progress = { notes: {} };

describe("revision progress", () => {
  it("first read is due the next day, then 3, 7, 21 and 60 days after each revision", () => {
    let p = applyProgressOp(empty, { op: "read", noteId: "P06", day: "2026-10-16" });
    expect(nextDue(p.notes.P06)).toBe("2026-10-17");
    const days = ["2026-10-17", "2026-10-20", "2026-10-27", "2026-11-17"];
    const expected = ["2026-10-20", "2026-10-27", "2026-11-17", "2027-01-16"];
    days.forEach((day, i) => {
      p = applyProgressOp(p, { op: "revise", noteId: "P06", day });
      expect(nextDue(p.notes.P06)).toBe(expected[i]);
    });
  });
  it("weak notes come back sooner and strong ones later", () => {
    let p = applyProgressOp(empty, { op: "revise", noteId: "P10", day: "2026-10-16" });
    p = applyProgressOp(p, { op: "confidence", noteId: "P10", value: "weak" });
    expect(nextDue(p.notes.P10)).toBe("2026-10-18");
    p = applyProgressOp(p, { op: "confidence", noteId: "P10", value: "strong" });
    expect(nextDue(p.notes.P10)).toBe("2026-10-21");
  });
  it("ignores a second revision on the same day and can undo one", () => {
    let p = applyProgressOp(empty, { op: "revise", noteId: "P18", day: "2026-10-16" });
    p = applyProgressOp(p, { op: "revise", noteId: "P18", day: "2026-10-16" });
    expect(p.notes.P18.revisions).toHaveLength(1);
    p = applyProgressOp(p, { op: "unrevise", noteId: "P18" });
    expect(p.notes.P18.revisions).toHaveLength(0);
  });
  it("knows what is due and labels it", () => {
    const n = { readAt: "2026-10-10", revisions: [] };
    expect(isDue(n, "2026-10-16")).toBe(true);
    expect(isDue(undefined, "2026-10-16")).toBe(false);
    expect(dueLabel("2026-10-16", "2026-10-16")).toBe("today");
    expect(dueLabel("2026-10-17", "2026-10-16")).toBe("tomorrow");
    expect(dueLabel("2026-10-14", "2026-10-16")).toBe("2 days late");
    expect(dueLabel("2026-11-16", "2026-10-16")).toBe("in 31 days");
  });
  it("rejects bad ids", () => {
    expect(() => applyProgressOp(empty, { op: "read", noteId: "../x", day: "2026-10-16" })).toThrow(ProgressOpError);
  });
});

describe("captures", () => {
  it("adds newest first, files with Claude's reply, and deletes", () => {
    let c = applyCaptureOp([], { op: "add", id: "a1", text: " First " }, "T1");
    c = applyCaptureOp(c, { op: "add", id: "b2", text: "Second" }, "T2");
    expect(c.map((x) => x.id)).toEqual(["b2", "a1"]);
    expect(c[1].text).toBe("First");
    c = applyCaptureOp(c, { op: "done", id: "a1", reply: "Added to State of play", note: "P10" }, "T3");
    expect(c[1]).toMatchObject({ status: "done", note: "P10", doneAt: "T3" });
    c = applyCaptureOp(c, { op: "delete", id: "b2" });
    expect(c).toHaveLength(1);
  });
  it("refuses empty text", () => {
    expect(() => applyCaptureOp([], { op: "add", id: "x", text: "  " })).toThrow(ProgressOpError);
  });
});
