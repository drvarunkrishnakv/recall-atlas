// Finding a quoted passage in a page's blocks, the way the editor sees it: a block's text is
// its text runs and link text joined together (card terms and source markers add none), and a
// table's text is its cells' text in order. Used to anchor a reviewer bot's flag.
import type { Block, InlineItem } from "./blocks.ts";

function runs(items: InlineItem[] | string | undefined): string {
  if (!Array.isArray(items)) return typeof items === "string" ? items : "";
  return items.map((i) => (i.type === "text" ? (i.text ?? "") : i.type === "link" ? runs(i.content) : "")).join("");
}

/** A block's own text (not its children's), as the editor's comment anchors read it. */
export function anchorText(b: Block): string {
  const c = b.content as unknown;
  if (c && typeof c === "object" && !Array.isArray(c)) {
    const rows = (c as { rows?: { cells: (InlineItem[] | { content: InlineItem[] })[] }[] }).rows ?? [];
    return rows.map((r) => r.cells.map((cell) => runs(Array.isArray(cell) ? cell : cell.content)).join("")).join("");
  }
  return runs(c as InlineItem[] | undefined);
}

/** Where a quote appears: the blocks containing it and the total number of matches. */
export function locateQuote(blocks: Block[], quote: string): { blockIds: string[]; count: number } {
  const blockIds: string[] = [];
  let count = 0;
  const visit = (list: Block[]) =>
    list.forEach((b) => {
      const text = anchorText(b);
      const n = quote ? text.split(quote).length - 1 : 0;
      if (n > 0 && b.id) {
        blockIds.push(b.id);
        count += n;
      }
      if (b.children) visit(b.children);
    });
  visit(blocks);
  return { blockIds, count };
}
