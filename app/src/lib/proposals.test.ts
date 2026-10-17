import { describe, expect, it } from "vitest";
import type { Block } from "./blocks";
import { applyProposalOp, applyToBlocks, planApproval, ProposalError, type Proposal } from "./proposals";

const src = { label: "PIB", url: "https://pib.gov.in/x", date: "2026-10-17" };
const blocks: Block[] = [
  { id: "h", type: "heading", props: { level: 2 }, content: [{ type: "text", text: "State of play", styles: {} }] },
  {
    id: "t",
    type: "table",
    content: {
      type: "tableContent",
      rows: [
        {
          cells: [
            { type: "tableCell", content: [{ type: "text", text: "Issue" }], props: { colspan: 1 } },
            { type: "tableCell", content: [{ type: "text", text: "Where it stands" }] },
          ],
        },
        {
          cells: [
            { type: "tableCell", content: [{ type: "text", text: "Borrowing" }] },
            { type: "tableCell", content: [{ type: "text", text: "The FC set a cap of 3%. More text." }] },
          ],
        },
      ],
    } as unknown as Block["content"],
  },
  {
    id: "b",
    type: "bulletListItem",
    content: [{ type: "text", text: "Parent", styles: {} }],
    children: [{ id: "c", type: "bulletListItem", content: [{ type: "text", text: "Child one", styles: {} }] }],
  },
];

const make = (p: Partial<Proposal> & Pick<Proposal, "kind" | "blockId">): Proposal =>
  applyProposalOp([], {
    op: "create",
    proposal: { id: "p1", source: src, reason: "Because the report says so.", origin: "claude", ...p },
  })[0];

const textOf = (b: Block[] | Block) => JSON.stringify(b);

describe("proposals", () => {
  it("need a source, a reason and a known kind", () => {
    expect(() =>
      make({ kind: "edit", blockId: "t", find: "a", replace: "b", source: { label: "", url: "x" } }),
    ).toThrow(ProposalError);
    expect(() => make({ kind: "edit", blockId: "t", find: "a", replace: "b", reason: "" })).toThrow(/reason/);
    expect(() => make({ kind: "bogus" as never, blockId: "t" })).toThrow(/Kind/);
    expect(make({ kind: "edit", blockId: "t", find: "a", replace: "b" })).toMatchObject({ status: "pending" });
  });

  it("edits one exact phrase inside a table cell and cites the source after it", () => {
    const p = make({
      kind: "edit",
      blockId: "t",
      find: "The FC set a cap of 3%.",
      replace: "The FC recommended a 3% limit.",
    });
    const out = applyToBlocks(blocks, p);
    const cell = (out[1].content as unknown as { rows: { cells: { content: { type: string; text?: string }[] }[] }[] })
      .rows[1].cells[1].content;
    expect(cell.map((x) => x.type)).toEqual(["text", "cite", "text"]);
    expect(cell[0].text).toBe("The FC recommended a 3% limit.");
    expect(cell[2].text).toBe(" More text.");
    expect(textOf(blocks)).toContain("set a cap"); // the input is not changed
  });

  it("refuses an edit whose text is gone or repeated", () => {
    expect(() => applyToBlocks(blocks, make({ kind: "edit", blockId: "t", find: "nowhere", replace: "x" }))).toThrow(
      /no longer there/,
    );
    const twice: Block[] = [{ id: "x", type: "paragraph", content: [{ type: "text", text: "a b a" }] }];
    expect(() => applyToBlocks(twice, make({ kind: "edit", blockId: "x", find: "a", replace: "c" }))).toThrow(
      /2 times/,
    );
    expect(() => applyToBlocks(blocks, make({ kind: "edit", blockId: "gone", find: "x", replace: "y" }))).toThrow(
      /gone/,
    );
  });

  it("adds a table row, a sibling after a nested block, and an open check", () => {
    const row = applyToBlocks(blocks, make({ kind: "row", blockId: "t", cells: ["SASCI", "₹1.5 lakh cr in FY27"] }));
    const rows = (row[1].content as unknown as { rows: { cells: { type: string; content: { type: string }[] }[] }[] })
      .rows;
    expect(rows).toHaveLength(3);
    expect(rows[2].cells[0].type).toBe("tableCell");
    expect(rows[2].cells[1].content.map((x) => x.type)).toEqual(["text", "cite"]);

    const add = applyToBlocks(blocks, make({ kind: "add", blockId: "c", text: "Child two" }));
    expect(add[2].children!.map((b) => b.type)).toEqual(["bulletListItem", "bulletListItem"]);
    expect(textOf(add[2].children![1])).toContain("Child two");

    const check = applyToBlocks(blocks, make({ kind: "check", blockId: "h", text: "Confirm the date" }));
    expect(check[1]).toMatchObject({ type: "checkListItem", props: { checked: false } });
  });

  it("approves only a pending proposal, and records rejections and stale ones", () => {
    let list = [make({ kind: "add", blockId: "h", text: "New line" })];
    expect(planApproval(blocks, list, "p1").blocks).toHaveLength(4);
    list = applyProposalOp(list, { op: "applied", proposalId: "p1", version: 7 });
    expect(list[0]).toMatchObject({ status: "applied", appliedVersion: 7 });
    expect(() => planApproval(blocks, list, "p1")).toThrow(/already applied/);
    expect(() => applyProposalOp(list, { op: "reject", proposalId: "p1" })).toThrow();
  });
});
