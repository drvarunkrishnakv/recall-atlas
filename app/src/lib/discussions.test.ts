import { describe, expect, it } from "vitest";
import type { Block } from "./blocks";
import {
  applyDiscussionOp,
  briefing,
  DiscussionOpError,
  nextUp,
  progress,
  sectionBlocks,
  turnTask,
  type Discussion,
} from "./discussions";
import { DEFAULT_SEATS, type Mode } from "./personas";

const src = [{ label: "PRS", url: "https://prsindia.org/x" }];
const body = "A point long enough to count as a real turn.";
const start = (mode: Mode, seats = DEFAULT_SEATS[mode]) =>
  applyDiscussionOp(
    [],
    {
      op: "create",
      discussion: { id: "d1", mode, topic: " This House would rotate reserved seats ", anchor: null, seats },
    },
    "T0",
  );
const say = (list: Discussion[], by: string, n: number, sources = src) =>
  applyDiscussionOp(list, { op: "turn", discussionId: "d1", turn: { id: `t${n}`, by, body, sources } });
const conclude = (list: Discussion[]) =>
  applyDiscussionOp(list, {
    op: "conclude",
    discussionId: "d1",
    body: "Both sides agree the quota needs delimitation.",
  });

describe("discussions", () => {
  it("starts a debate with Claude for and Grok's debater against", () => {
    const [d] = start("debate");
    expect(d.topic).toBe("This House would rotate reserved seats");
    expect(nextUp(d)).toMatchObject({ seat: { role: "proposer", by: "claude" }, round: 1, roundName: "Opening" });
    expect(progress(d)).toEqual({ done: 0, total: 7 });
  });

  it("refuses seats that don't fit the mode or the bot", () => {
    expect(() =>
      start("debate", [
        { role: "opposer", by: "debater" },
        { role: "proposer", by: "claude" },
      ]),
    ).toThrow(DiscussionOpError);
    expect(() =>
      start("devil", [
        { role: "devil", by: "economist" },
        { role: "defender", by: "claude" },
      ]),
    ).toThrow(/economist can't play/);
    expect(() =>
      start("roundtable", [
        { role: "lawyer", by: "claude" },
        { role: "economist", by: "economist" },
      ]),
    ).toThrow(/Claude moderating/);
  });

  it("takes debate turns in order, then only Claude's conclusion is left", () => {
    let l = start("debate");
    expect(() => say(l, "debater", 0)).toThrow(/Claude · For the motion's turn/);
    ["claude", "debater", "claude", "debater", "claude", "debater"].forEach((by, i) => (l = say(l, by, i)));
    expect(l[0].turns.map((t) => [t.role, t.round])).toEqual([
      ["proposer", 1],
      ["opposer", 1],
      ["proposer", 2],
      ["opposer", 2],
      ["proposer", 3],
      ["opposer", 3],
    ]);
    expect(nextUp(l[0])).toMatchObject({ kind: "conclusion", seat: { by: "claude" } });
    expect(() => say(l, "claude", 9)).toThrow(/only Claude's conclusion/);
    l = conclude(l);
    expect(nextUp(l[0])).toBeNull();
    expect(progress(l[0])).toEqual({ done: 7, total: 7 });
  });

  it("refuses a conclusion before every turn is in", () => {
    expect(() => conclude(start("debate"))).toThrow(/Not every turn/);
  });

  it("requires a source on argument turns but not on the moderator's opening or your turns", () => {
    let l = start("roundtable");
    expect(nextUp(l[0])).toMatchObject({ kind: "opening", seat: { role: "moderator" } });
    l = say(l, "claude", 1, []);
    expect(() => say(l, "claude", 2, [])).toThrow(/at least one source/);
    expect(() => say(l, "claude", 2, [{ label: "x", url: "javascript:alert(1)" }])).toThrow(/Bad source/);
    l = applyDiscussionOp(l, {
      op: "turn",
      discussionId: "d1",
      turn: { id: "m1", by: "me", body: "And the Rajya Sabha?" },
    });
    expect(l[0].turns.at(-1)).toMatchObject({ role: "you", by: "me", sources: [] });
    expect(nextUp(l[0])).toMatchObject({ seat: { role: "lawyer", by: "claude" } }); // your turns take no seat
    expect(turnTask(l[0])).toContain("And the Rajya Sabha?");
  });

  it("goes round the table twice after the opening", () => {
    let l = start("roundtable");
    const order = [
      "claude",
      "claude",
      "economist",
      "activist",
      "strategist",
      "claude",
      "economist",
      "activist",
      "strategist",
    ];
    order.forEach((by, i) => (l = say(l, by, i)));
    expect(nextUp(l[0])?.kind).toBe("conclusion");
  });

  it("alternates the devil's attacks with Claude's defence", () => {
    let l = start("devil");
    ["devil", "claude", "devil", "claude", "devil", "claude"].forEach((by, i) => (l = say(l, by, i)));
    expect(l[0].turns.map((t) => t.role)).toEqual(["devil", "defender", "devil", "defender", "devil", "defender"]);
    expect(nextUp(l[0])?.kind).toBe("conclusion");
  });

  it("briefs the speaker whose turn it is, and only them", () => {
    const [d] = start("debate");
    expect(briefing(d, null, "notes/P06", "claude")).toContain("## YOUR TURN (Claude · For the motion)");
    expect(briefing(d, null, "notes/P06", "debater")).toContain("It is not your turn");
  });

  it("votes and closes", () => {
    let l = applyDiscussionOp(start("debate"), { op: "vote", discussionId: "d1", vote: "against" });
    expect(l[0].vote).toBe("against");
    l = applyDiscussionOp(l, { op: "close", discussionId: "d1" });
    expect(nextUp(l[0])).toBeNull();
    expect(() => say(l, "claude", 1)).toThrow(/closed/);
  });
});

describe("sectionBlocks", () => {
  const h = (id: string, level: number): Block => ({
    id,
    type: "heading",
    props: { level },
    content: [],
    children: [],
  });
  const p = (id: string, children: Block[] = []): Block => ({
    id,
    type: "paragraph",
    props: {},
    content: [],
    children,
  });
  const doc = [h("a", 2), p("a1"), h("b", 2), p("b1", [p("b1x")]), h("b3", 3), p("b3a"), h("c", 2), p("c1")];
  it("takes the section around a nested block, keeping its subsections", () => {
    expect(sectionBlocks(doc, "b1x").map((b) => b.id)).toEqual(["b", "b1", "b3", "b3a"]);
  });
  it("starts at a heading when the anchor is the heading", () => {
    expect(sectionBlocks(doc, "c").map((b) => b.id)).toEqual(["c", "c1"]);
  });
  it("returns nothing for an unknown block", () => {
    expect(sectionBlocks(doc, "zz")).toEqual([]);
  });
});
