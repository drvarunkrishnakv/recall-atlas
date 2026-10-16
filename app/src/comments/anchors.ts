// Comment anchors: a thread points at a block id and the exact text it highlights. Marks
// aren't saved with the blocks, so on load we find each quote again and re-add its mark,
// and after edits we read the marks back to keep the anchors current.
import type { Node as PMNode } from "prosemirror-model";
import type { Anchor, StoredThread } from "../lib/threads";
import type { AtlasEditor } from "../editor/schema";

interface Seg {
  offset: number;
  pos: number;
  len: number;
}

/** The text of a block's own content (not its children), with a map back to document positions. */
function blockText(content: PMNode, contentPos: number): { text: string; segs: Seg[] } {
  let text = "";
  const segs: Seg[] = [];
  content.descendants((child, rel) => {
    if (child.isText) {
      segs.push({ offset: text.length, pos: contentPos + 1 + rel, len: child.text!.length });
      text += child.text;
    }
  });
  return { text, segs };
}

const toPos = (segs: Seg[], i: number): number | null => {
  for (const s of segs) if (i >= s.offset && i <= s.offset + s.len) return s.pos + (i - s.offset);
  return null;
};
const toIndex = (segs: Seg[], pos: number, text: string): number => {
  for (const s of segs) if (pos >= s.pos && pos <= s.pos + s.len) return s.offset + (pos - s.pos);
  const after = segs.filter((s) => s.pos + s.len <= pos);
  return after.length ? after.at(-1)!.offset + after.at(-1)!.len : pos > (segs[0]?.pos ?? 0) ? text.length : 0;
};

function containerAt(doc: PMNode, pos: number): { id: string; content: PMNode; contentPos: number } | null {
  const $pos = doc.resolve(pos);
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === "blockContainer") {
      const start = $pos.before(d);
      return { id: String(node.attrs.id), content: node.firstChild!, contentPos: start + 1 };
    }
  }
  return null;
}

function findContainer(doc: PMNode, blockId: string): { content: PMNode; contentPos: number } | null {
  let found: { content: PMNode; contentPos: number } | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === "blockContainer" && node.attrs.id === blockId) {
      found = { content: node.firstChild!, contentPos: pos + 1 };
      return false;
    }
    return true;
  });
  return found;
}

/** The anchor for a selection, clamped to the block it starts in. */
export function anchorFor(doc: PMNode, from: number, to: number): { anchor: Anchor; from: number; to: number } | null {
  const c = containerAt(doc, from);
  if (!c) return null;
  const { text, segs } = blockText(c.content, c.contentPos);
  const a = toIndex(segs, from, text);
  const b = Math.min(text.length, toIndex(segs, Math.min(to, c.contentPos + c.content.nodeSize), text));
  const quote = text.slice(a, b);
  if (!quote.trim()) return null;
  return { anchor: { blockId: c.id, quote }, from: toPos(segs, a)!, to: toPos(segs, b)! };
}

export function findAnchor(doc: PMNode, anchor: Anchor): { from: number; to: number } | null {
  if (!anchor.quote) return null;
  const c = findContainer(doc, anchor.blockId);
  const search = (content: PMNode, contentPos: number) => {
    const { text, segs } = blockText(content, contentPos);
    const i = text.indexOf(anchor.quote);
    if (i < 0) return null;
    const from = toPos(segs, i);
    const to = toPos(segs, i + anchor.quote.length);
    return from !== null && to !== null ? { from, to } : null;
  };
  if (c) {
    const hit = search(c.content, c.contentPos);
    if (hit) return hit;
  }
  // The block may have been split or moved: look for the quote anywhere.
  let hit: { from: number; to: number } | null = null;
  doc.descendants((node, pos) => {
    if (hit) return false;
    if (node.type.name === "blockContainer") hit = search(node.firstChild!, pos + 1);
    return true;
  });
  return hit;
}

function markRanges(doc: PMNode): Map<string, { from: number; to: number }> {
  const out = new Map<string, { from: number; to: number }>();
  doc.descendants((node, pos) => {
    for (const m of node.marks) {
      if (m.type.name !== "comment" || !m.attrs.threadId) continue;
      const r = out.get(m.attrs.threadId) ?? { from: Infinity, to: 0 };
      out.set(m.attrs.threadId, { from: Math.min(r.from, pos), to: Math.max(r.to, pos + node.nodeSize) });
    }
  });
  return out;
}

/** Re-adds marks for threads whose text is in the page but unmarked. Not added to undo history. */
export function attachMarks(editor: AtlasEditor, threads: StoredThread[]) {
  const view = editor.prosemirrorView;
  if (!view) return;
  const doc = view.state.doc;
  const have = markRanges(doc);
  const type = view.state.schema.marks.comment;
  if (!type) return;
  const tr = view.state.tr;
  for (const t of threads) {
    if (have.has(t.id) || t.detached) continue;
    const r = findAnchor(doc, t.anchor);
    if (r) tr.addMark(r.from, r.to, type.create({ threadId: t.id, orphan: t.resolved }));
  }
  if (tr.steps.length) view.dispatch(tr.setMeta("addToHistory", false));
}

/** Adds the mark for a new thread at a range. */
export function markRange(editor: AtlasEditor, threadId: string, from: number, to: number) {
  const view = editor.prosemirrorView;
  const type = view?.state.schema.marks.comment;
  if (!view || !type) return;
  view.dispatch(
    view.state.tr.addMark(from, to, type.create({ threadId, orphan: false })).setMeta("addToHistory", false),
  );
}

/** Anchors that changed since they were stored (null = the highlighted text is gone). */
export function changedAnchors(editor: AtlasEditor, threads: StoredThread[]): Record<string, Anchor | null> {
  const view = editor.prosemirrorView;
  if (!view) return {};
  const doc = view.state.doc;
  const ranges = markRanges(doc);
  const out: Record<string, Anchor | null> = {};
  for (const t of threads) {
    const r = ranges.get(t.id);
    if (!r) {
      if (!t.detached) out[t.id] = null;
      continue;
    }
    const a = anchorFor(doc, r.from, r.to)?.anchor ?? null;
    if (!a) {
      if (!t.detached) out[t.id] = null;
    } else if (t.detached || a.blockId !== t.anchor.blockId || a.quote !== t.anchor.quote) out[t.id] = a;
  }
  return out;
}
