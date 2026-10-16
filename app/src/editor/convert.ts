// One-time conversion of the Markdown notes (from the Docs mirror) into editor blocks.
// Card terms and note links become term chips; ```chart and ```mermaid fences become
// chart and flowchart blocks; a "> [!PRELIMS]" quote becomes a callout.
import { BlockNoteEditor } from "@blocknote/core";
import { schema } from "./schema";
import type { Block, InlineItem } from "../lib/blocks";

const LINK_BASE = "https://atlas.invalid/";

/** Rewrites Atlas links into plain links the Markdown parser keeps, tagged for the post-pass. */
export function prepareMarkdown(md: string): string {
  return md
    .replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, (_, id: string, label: string) => `[${label}](${LINK_BASE}card/${id})`)
    .replace(
      /\]\(\/(notes|cards)\/([A-Za-z0-9-]+)\)/g,
      (_, c: string, id: string) => `](${LINK_BASE}${c === "notes" ? "note" : "card"}/${id})`,
    );
}

function fixInline(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fixInline);
  if (!value || typeof value !== "object") return value;
  const item = value as InlineItem & Record<string, unknown>;
  if (item.type === "link" && typeof item.href === "string" && item.href.startsWith(LINK_BASE)) {
    const [kind, id] = item.href.slice(LINK_BASE.length).split("/");
    const label = (Array.isArray(item.content) ? item.content : []).map((c) => c.text ?? "").join("");
    return { type: "term", props: { kind, id, label }, content: undefined };
  }
  return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, k === "props" ? v : fixInline(v)]));
}

const codeText = (b: Block) =>
  (Array.isArray(b.content) ? b.content : []).map((i) => (i as InlineItem).text ?? "").join("");

function fixBlocks(blocks: Block[]): Block[] {
  return blocks.map((raw) => {
    const b = fixInline(raw) as Block;
    const lang = String(b.props?.language ?? "");
    if (b.type === "codeBlock" && lang === "chart") return { id: b.id, type: "chart", props: { spec: codeText(b) } };
    if (b.type === "codeBlock" && lang === "mermaid")
      return { id: b.id, type: "flowchart", props: { code: codeText(b) } };
    if (b.type === "quote" && Array.isArray(b.content)) {
      const first = b.content[0] as InlineItem | undefined;
      const m = first?.type === "text" ? /^\[!(NOTE|PRELIMS|WARNING)\]\s*/i.exec(first.text ?? "") : null;
      if (m) {
        const rest = [{ ...first!, text: first!.text!.slice(m[0].length) }, ...b.content.slice(1)].filter(
          (i) => i.type !== "text" || i.text,
        );
        return { id: b.id, type: "callout", props: { tone: m[1].toLowerCase() }, content: rest, children: b.children };
      }
    }
    return { ...b, children: b.children ? fixBlocks(b.children) : b.children };
  });
}

let headless: BlockNoteEditor<typeof schema.blockSchema, typeof schema.inlineContentSchema, typeof schema.styleSchema>;

export async function markdownToBlocks(md: string): Promise<Block[]> {
  headless ??= BlockNoteEditor.create({ schema });
  const parsed = headless.tryParseMarkdownToBlocks(prepareMarkdown(md)) as unknown as Block[];
  return fixBlocks(parsed);
}
