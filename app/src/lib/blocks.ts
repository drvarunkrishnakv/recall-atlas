// Pure helpers over BlockNote documents (block JSON), shared by the app, the dev save
// API and the Claude CLI: Markdown export, plain text, headings, card links and search.
// Types are deliberately loose so this file has no dependency on the editor.

export interface InlineItem {
  type: string;
  text?: string;
  styles?: Record<string, unknown>;
  href?: string;
  content?: InlineItem[] | string;
  props?: Record<string, unknown>;
}
export interface Block {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: InlineItem[] | TableContent | string;
  children?: Block[];
}
interface TableCell {
  type: "tableCell";
  content: InlineItem[];
}
interface TableContent {
  type: "tableContent";
  rows: { cells: (TableCell | InlineItem[])[] }[];
}

/** The page shape saved to `content/<collection>/<id>.json`. */
export interface PageDoc {
  collection: "notes" | "cards";
  id: string;
  title: string;
  version: number;
  updated: string;
  blocks: Block[];
  /** Notes: status, topic, pyqs, paper, subject. Cards: kind, summary. */
  [meta: string]: unknown;
}

export const PAGE_FIELDS = ["collection", "id", "title", "version", "updated", "blocks"];

const isTable = (c: Block["content"]): c is TableContent =>
  !!c && typeof c === "object" && !Array.isArray(c) && c.type === "tableContent";

const cellItems = (cell: TableCell | InlineItem[]): InlineItem[] => (Array.isArray(cell) ? cell : (cell.content ?? []));

const inlineOf = (content: Block["content"]): InlineItem[] =>
  Array.isArray(content) ? content : typeof content === "string" ? [{ type: "text", text: content }] : [];

// ---------- plain text ----------

export function inlineText(items: InlineItem[] | string | undefined): string {
  if (!items) return "";
  if (typeof items === "string") return items;
  return items
    .map((i) => {
      if (i.type === "text") return i.text ?? "";
      if (i.type === "link") return inlineText(i.content);
      if (i.type === "term") return String(i.props?.label ?? "");
      return inlineText(i.content);
    })
    .join("");
}

/** The visible text of one block, without its children. */
export function blockText(block: Block): string {
  if (block.type === "chart") {
    try {
      return String((JSON.parse(String(block.props?.spec ?? "{}")) as { title?: string }).title ?? "");
    } catch {
      return "";
    }
  }
  if (block.type === "flowchart") return "";
  if (isTable(block.content))
    return block.content.rows.map((r) => r.cells.map((c) => inlineText(cellItems(c))).join(" · ")).join("\n");
  return inlineText(inlineOf(block.content));
}

export function walkBlocks(blocks: Block[], fn: (b: Block, depth: number) => void, depth = 0) {
  for (const b of blocks) {
    fn(b, depth);
    if (b.children?.length) walkBlocks(b.children, fn, depth + 1);
  }
}

/** Headings in document order, for the outline. */
export function headings(blocks: Block[]): { id: string; level: number; text: string }[] {
  const out: { id: string; level: number; text: string }[] = [];
  walkBlocks(blocks, (b) => {
    if (b.type === "heading" && b.id) out.push({ id: b.id, level: Number(b.props?.level ?? 1), text: blockText(b) });
  });
  return out;
}

// ---------- links between pages ----------

function eachInline(blocks: Block[], fn: (i: InlineItem) => void) {
  const visit = (items: InlineItem[]) => {
    for (const i of items) {
      fn(i);
      if (Array.isArray(i.content)) visit(i.content);
    }
  };
  walkBlocks(blocks, (b) => {
    if (isTable(b.content)) b.content.rows.forEach((r) => r.cells.forEach((c) => visit(cellItems(c))));
    else visit(inlineOf(b.content));
  });
}

/** Ids of the pages a document links to with term chips, by kind, in order of first appearance. */
export function pageRefs(blocks: Block[], kind: "card" | "note" = "card"): string[] {
  const seen: string[] = [];
  eachInline(blocks, (i) => {
    if (i.type === "term" && (i.props?.kind ?? "card") === kind) {
      const id = String(i.props?.id ?? "");
      if (id && !seen.includes(id)) seen.push(id);
    }
  });
  return seen;
}

/** For each page id, the pages whose blocks link to it ("Cited in" / backlinks). Keys are `card:id` or `note:id`. */
export function backlinks(pages: { collection: string; id: string; blocks: Block[] }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const p of pages) {
    const from = `${p.collection === "notes" ? "note" : "card"}:${p.id}`;
    for (const kind of ["card", "note"] as const) {
      for (const id of pageRefs(p.blocks, kind)) {
        const key = `${kind}:${id}`;
        const list = map.get(key) ?? [];
        if (!list.includes(from)) list.push(from);
        map.set(key, list);
      }
    }
  }
  return map;
}

// ---------- Markdown export ----------

function styled(text: string, styles: Record<string, unknown> = {}): string {
  if (!text) return "";
  if (styles.code) return "`" + text + "`";
  // Pipes are escaped everywhere so table cells stay intact; `\|` reads as `|` elsewhere.
  let t = text.replace(/([*_`[\]\\|])/g, "\\$1");
  // Keep surrounding spaces outside the markers, or Markdown won't treat them as emphasis.
  const lead = t.match(/^\s*/)![0];
  const trail = t.match(/\s*$/)![0];
  t = t.trim();
  if (!t) return lead + trail;
  if (styles.bold) t = `**${t}**`;
  if (styles.italic) t = `_${t}_`;
  if (styles.strike) t = `~~${t}~~`;
  return lead + t + trail;
}

export function inlineToMarkdown(items: InlineItem[] | string | undefined): string {
  if (!items) return "";
  if (typeof items === "string") return items;
  return items
    .map((i) => {
      if (i.type === "text") return styled(i.text ?? "", i.styles);
      if (i.type === "link") return `[${inlineToMarkdown(i.content)}](${i.href ?? ""})`;
      if (i.type === "term") {
        const id = String(i.props?.id ?? "");
        const label = String(i.props?.label ?? id);
        return i.props?.kind === "note" ? `[${label}](/notes/${id})` : `[[${id}|${label}]]`;
      }
      return inlineToMarkdown(i.content);
    })
    .join("");
}

function tableToMarkdown(table: TableContent): string {
  const rows = table.rows.map((r) => r.cells.map((c) => inlineToMarkdown(cellItems(c)).replace(/\n/g, "<br>")));
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) => "| " + Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ") + " |";
  return [line(rows[0]), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n");
}

const LIST = new Set(["bulletListItem", "numberedListItem", "checkListItem", "toggleListItem"]);

function blockToMarkdown(b: Block): string {
  const text = () => inlineToMarkdown(inlineOf(b.content));
  const p = b.props ?? {};
  switch (b.type) {
    case "heading":
      return "#".repeat(Math.min(6, Number(p.level ?? 1))) + " " + text();
    case "bulletListItem":
    case "toggleListItem":
      return "- " + text();
    case "numberedListItem":
      return "1. " + text();
    case "checkListItem":
      return `- [${p.checked ? "x" : " "}] ` + text();
    case "quote":
      return text()
        .split("\n")
        .map((l) => "> " + l)
        .join("\n");
    case "callout": {
      const label = String(p.tone ?? "note").toUpperCase();
      return (
        `> [!${label}]\n` +
        text()
          .split("\n")
          .map((l) => "> " + l)
          .join("\n")
      );
    }
    case "codeBlock":
      return "```" + String(p.language ?? "") + "\n" + inlineText(inlineOf(b.content)) + "\n```";
    case "chart":
      return "```chart\n" + String(p.spec ?? "{}") + "\n```";
    case "flowchart":
      return "```mermaid\n" + String(p.code ?? "") + "\n```";
    case "table":
      return isTable(b.content) ? tableToMarkdown(b.content) : "";
    case "divider":
      return "---";
    case "image":
      return `![${String(p.caption ?? "")}](${String(p.url ?? "")})`;
    default:
      return text();
  }
}

function blocksToLines(blocks: Block[], indent: string): string {
  let out = "";
  let prevList = false;
  for (const b of blocks) {
    const isList = LIST.has(b.type);
    const md = blockToMarkdown(b)
      .split("\n")
      .map((l) => (l ? indent + l : l))
      .join("\n");
    if (out) out += isList && prevList ? "\n" : "\n\n";
    out += md;
    if (b.children?.length) {
      const childIndent = indent + (isList ? "  " : "");
      out += (isList ? "\n" : "\n\n") + blocksToLines(b.children, childIndent);
    }
    prevList = isList;
  }
  return out;
}

/** Markdown for a block document, using the Atlas extensions: `[[card|label]]`, ```chart and ```mermaid. */
export function blocksToMarkdown(blocks: Block[]): string {
  return (
    blocksToLines(blocks, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

/** A full Markdown file: `key: <JSON value>` front matter, then the body. */
export function pageToMarkdown(page: PageDoc): string {
  const meta = Object.entries(page).filter(([k]) => k !== "blocks" && k !== "collection");
  return (
    "---\n" +
    meta.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n") +
    "\n---\n\n" +
    blocksToMarkdown(page.blocks)
  );
}

// ---------- search ----------

export interface SearchHit {
  collection: string;
  id: string;
  title: string;
  /** Heading or block the match is in; absent for title matches. */
  blockId?: string;
  snippet: string;
  score: number;
}

/** Case-insensitive search over titles, then block text. Every word must match. */
export function searchPages(
  pages: { collection: string; id: string; title: string; blocks: Block[] }[],
  query: string,
  limit = 20,
): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all = (s: string) => words.every((w) => s.toLowerCase().includes(w));
  const hits: SearchHit[] = [];
  for (const p of pages) {
    if (all(p.title + " " + p.id))
      hits.push({ collection: p.collection, id: p.id, title: p.title, snippet: "", score: 3 });
    let perPage = 0;
    walkBlocks(p.blocks, (b) => {
      if (perPage >= 3) return;
      const text = blockText(b);
      if (!text || !all(text)) return;
      const at = Math.max(0, text.toLowerCase().indexOf(words[0]) - 40);
      const snippet =
        (at > 0 ? "…" : "") + text.slice(at, at + 140).replace(/\s+/g, " ") + (text.length > at + 140 ? "…" : "");
      hits.push({
        collection: p.collection,
        id: p.id,
        title: p.title,
        blockId: b.id,
        snippet,
        score: b.type === "heading" ? 2 : 1,
      });
      perPage++;
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
