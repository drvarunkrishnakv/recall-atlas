import { describe, expect, it } from "vitest";
import type { Block } from "./blocks";
import { anchorText, locateQuote } from "./flags";
import { applyThreadOp, ThreadOpError, waitingForClaude } from "./threads";

const para = (id: string, content: unknown, children: Block[] = []): Block =>
  ({ id, type: "paragraph", props: {}, content, children }) as Block;
const doc: Block[] = [
  para("p1", [
    { type: "text", text: "The 16th FC kept " },
    { type: "link", href: "https://x", content: [{ type: "text", text: "41%" }] },
    { type: "term", props: { id: "fc", label: "Finance Commission" } },
    { type: "text", text: " for 2026–31." },
    { type: "cite", props: { label: "PRS", url: "https://prs" } },
  ]),
  para(
    "p2",
    [{ type: "text", text: "Cesses are shrinking the pool." }],
    [para("p2a", [{ type: "text", text: "Twice: pool, pool." }])],
  ),
  {
    id: "t1",
    type: "table",
    content: {
      type: "tableContent",
      rows: [
        { cells: [[{ type: "text", text: "GST" }], { type: "tableCell", content: [{ type: "text", text: " 2017" }] }] },
      ],
    },
  } as Block,
];

describe("locateQuote", () => {
  it("reads text and link runs, skipping terms and source markers", () => {
    expect(anchorText(doc[0])).toBe("The 16th FC kept 41% for 2026–31.");
    expect(locateQuote(doc, "kept 41% for 2026–31")).toEqual({ blockIds: ["p1"], count: 1 });
  });
  it("counts every match, nested blocks and table cells included", () => {
    expect(locateQuote(doc, "pool").count).toBe(3);
    expect(locateQuote(doc, "GST 2017")).toEqual({ blockIds: ["t1"], count: 1 });
    expect(locateQuote(doc, "Finance Commission").count).toBe(0);
  });
});

describe("flag threads", () => {
  const flag = { by: "reviewer", level: "uncertain" as const, sources: [] };
  const anchor = { blockId: "p1", quote: "kept 41%" };
  it("only Grok raises a flag, and Grok can raise nothing else", () => {
    expect(() =>
      applyThreadOp([], {
        op: "create",
        thread: { id: "t", kind: "flag", anchor, flag },
        comment: { id: "c", body: "x" },
        by: "me",
      }),
    ).toThrow(ThreadOpError);
    expect(() =>
      applyThreadOp([], {
        op: "create",
        thread: { id: "t", kind: "comment", anchor },
        comment: { id: "c", body: "x" },
        by: "grok",
      }),
    ).toThrow(ThreadOpError);
  });
  it("waits for Claude's check until Claude replies, then until resolved no longer", () => {
    let ts = applyThreadOp([], {
      op: "create",
      thread: { id: "t", kind: "flag", anchor, flag },
      comment: { id: "c", body: "Is it 41% or 41.5%?" },
      by: "grok",
    });
    expect(ts[0].flag).toEqual(flag);
    expect(waitingForClaude(ts)).toHaveLength(1);
    ts = applyThreadOp(ts, {
      op: "reply",
      threadId: "t",
      comment: { id: "c2", body: "Confirmed: 41%." },
      by: "claude",
    });
    ts = applyThreadOp(ts, { op: "reply", threadId: "t", comment: { id: "c3", body: "Thanks" }, by: "me" });
    expect(waitingForClaude(ts)).toHaveLength(0);
  });
});
