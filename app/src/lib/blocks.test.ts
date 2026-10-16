import { describe, expect, it } from "vitest";
import { backlinks, blocksToMarkdown, headings, pageRefs, pageToMarkdown, searchPages, type Block } from "./blocks";

const term = (id: string, label: string, kind = "card") => ({ type: "term", props: { kind, id, label } });
const doc: Block[] = [
  { id: "h1", type: "heading", props: { level: 2 }, content: [{ type: "text", text: "State of play", styles: {} }] },
  {
    id: "p1",
    type: "paragraph",
    content: [
      { type: "text", text: "Upheld in ", styles: {} },
      term("case-kihoto", "Kihoto (1992)"),
      { type: "text", text: " and ", styles: {} },
      { type: "text", text: "binding", styles: { bold: true } },
      { type: "text", text: "; see ", styles: {} },
      term("P10", "fiscal federalism", "note"),
    ],
  },
  {
    id: "l1",
    type: "bulletListItem",
    content: [{ type: "text", text: "First", styles: {} }],
    children: [{ id: "l2", type: "bulletListItem", content: [{ type: "text", text: "Nested", styles: {} }] }],
  },
  { id: "l3", type: "numberedListItem", content: [{ type: "text", text: "Step", styles: {} }] },
  {
    id: "t1",
    type: "table",
    content: {
      type: "tableContent",
      rows: [
        {
          cells: [{ type: "tableCell", content: [{ type: "text", text: "Front" }] }, [{ type: "text", text: "Since" }]],
        },
        { cells: [[term("case-kihoto", "Kihoto")], [{ type: "text", text: "a | b" }]] },
      ],
    } as unknown as Block["content"],
  },
  { id: "c1", type: "chart", props: { spec: '{"title":"Seats"}' } },
  { id: "f1", type: "flowchart", props: { code: "flowchart TD\n  A --> B" } },
  { id: "x1", type: "callout", props: { tone: "prelims" }, content: [{ type: "text", text: "Art 243D" }] },
];

describe("blocksToMarkdown", () => {
  const md = blocksToMarkdown(doc);
  it("writes headings, styles, card terms and note links", () => {
    expect(md).toContain("## State of play");
    expect(md).toContain(
      "Upheld in [[case-kihoto|Kihoto (1992)]] and **binding**; see [fiscal federalism](/notes/P10)",
    );
  });
  it("keeps lists tight and nests children", () => {
    expect(md).toContain("- First\n  - Nested\n1. Step");
  });
  it("writes tables with escaped pipes", () => {
    expect(md).toContain("| Front | Since |\n| --- | --- |\n| [[case-kihoto|Kihoto]] | a \\| b |");
  });
  it("writes charts, flowcharts and callouts as Atlas fences", () => {
    expect(md).toContain('```chart\n{"title":"Seats"}\n```');
    expect(md).toContain("```mermaid\nflowchart TD\n  A --> B\n```");
    expect(md).toContain("> [!PRELIMS]\n> Art 243D");
  });
  it("adds JSON front matter for a full page", () => {
    const page = pageToMarkdown({
      collection: "notes",
      id: "P18",
      title: "T",
      version: 2,
      updated: "2026-10-16",
      blocks: [],
    });
    expect(page.startsWith('---\nid: "P18"\ntitle: "T"\nversion: 2\nupdated: "2026-10-16"\n---\n')).toBe(true);
  });
});

describe("links and outline", () => {
  it("lists headings", () => expect(headings(doc)).toEqual([{ id: "h1", level: 2, text: "State of play" }]));
  it("finds card and note references, including in tables", () => {
    expect(pageRefs(doc)).toEqual(["case-kihoto"]);
    expect(pageRefs(doc, "note")).toEqual(["P10"]);
  });
  it("builds backlinks from notes and cards", () => {
    const map = backlinks([
      { collection: "notes", id: "P18", blocks: doc },
      { collection: "cards", id: "case-x", blocks: [{ type: "paragraph", content: [term("case-kihoto", "K")] }] },
    ]);
    expect(map.get("card:case-kihoto")).toEqual(["note:P18", "card:case-x"]);
    expect(map.get("note:P10")).toEqual(["note:P18"]);
  });
});

describe("searchPages", () => {
  const pages = [{ collection: "notes", id: "P18", title: "Presiding officers", blocks: doc }];
  it("ranks title matches first and finds text in blocks", () => {
    expect(searchPages(pages, "presiding")[0]).toMatchObject({ id: "P18", score: 3 });
    expect(searchPages(pages, "kihoto upheld")[0]).toMatchObject({ blockId: "p1" });
  });
  it("needs every word", () => expect(searchPages(pages, "kihoto zebra")).toEqual([]));
});
