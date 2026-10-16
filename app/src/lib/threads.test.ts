import { describe, expect, it } from "vitest";
import { applyThreadOp, ThreadOpError, waitingForClaude, type StoredThread } from "./threads";

const anchor = { blockId: "b1", quote: "Kihoto" };
const make = (kind: "comment" | "sticky" | "claude"): StoredThread[] =>
  applyThreadOp(
    [],
    { op: "create", thread: { id: "t1", kind, anchor }, comment: { id: "c1", body: " Why? " }, by: "me" },
    "T0",
  );

describe("applyThreadOp", () => {
  it("creates a thread with a trimmed first comment", () => {
    const [t] = make("comment");
    expect(t).toMatchObject({ id: "t1", kind: "comment", resolved: false, anchor });
    expect(t.comments[0]).toMatchObject({ userId: "me", body: "Why?" });
  });
  it("refuses to resolve a sticky note", () => {
    expect(() => applyThreadOp(make("sticky"), { op: "resolve", threadId: "t1" })).toThrow(ThreadOpError);
  });
  it("pinning a resolved thread reopens it as a sticky note", () => {
    const resolved = applyThreadOp(make("claude"), { op: "resolve", threadId: "t1" });
    const [t] = applyThreadOp(resolved, { op: "kind", threadId: "t1", kind: "sticky" });
    expect(t).toMatchObject({ kind: "sticky", resolved: false });
  });
  it("deleting the first comment deletes the thread", () => {
    expect(applyThreadOp(make("comment"), { op: "deleteComment", threadId: "t1", commentId: "c1" })).toEqual([]);
  });
  it("marks a thread detached when its text is gone, and re-attaches it", () => {
    const gone = applyThreadOp(make("comment"), { op: "anchors", anchors: { t1: null } });
    expect(gone[0].detached).toBe(true);
    const back = applyThreadOp(gone, { op: "anchors", anchors: { t1: { blockId: "b2", quote: "Kihoto" } } });
    expect(back[0]).toMatchObject({ detached: false, anchor: { blockId: "b2" } });
  });
  it("lists Ask Claude threads until Claude has the last word", () => {
    const t = make("claude");
    expect(waitingForClaude(t)).toHaveLength(1);
    const replied = applyThreadOp(t, {
      op: "reply",
      threadId: "t1",
      comment: { id: "c2", body: "Because…" },
      by: "claude",
    });
    expect(waitingForClaude(replied)).toHaveLength(0);
  });
});
