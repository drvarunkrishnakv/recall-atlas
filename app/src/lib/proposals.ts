// Proposed changes to a note, for the owner to approve or reject. Claude writes them (from an
// AI reviewer's flag, from the official-source feed, or on its own run); approving one applies
// it to the page and saves a history entry. Stored per page beside the threads:
// `content/proposals/<collection>-<id>.json` locally, `proposals/<collection>-<id>` in Firestore.
// Shared by the dev save API, the app's cloud API, the CLI and their tests.
//
// Kinds:
//   edit   replace one exact phrase in a block's plain text (must occur exactly once)
//   add    insert a new block after a block (same type as it, unless `blockType` says otherwise)
//   row    add a row to a table block
//   check  add an open-check item (a to-do) after a block
// New text always carries its source as a citation marker.
import type { Block, InlineItem } from "./blocks.ts";

export type ProposalKind = "edit" | "add" | "row" | "check";
export type ProposalStatus = "pending" | "applied" | "rejected" | "stale";

export interface ProposalSource {
  label: string;
  url: string;
  /** The date of the event or document, YYYY-MM-DD, when known. */
  date?: string;
}

export interface Proposal {
  id: string;
  kind: ProposalKind;
  /** The block the change is in (edit, row) or after (add, check). */
  blockId: string;
  /** edit: the exact text to replace, and what replaces it. */
  find?: string;
  replace?: string;
  /** add, check: the new text. row: one text per cell. */
  text?: string;
  cells?: string[];
  /** add: the new block's type when it shouldn't copy the anchor's (e.g. "paragraph"). */
  blockType?: string;
  source: ProposalSource;
  /** Why the note should change, in a sentence or two. */
  reason: string;
  /** Where it came from: "flag:<threadId>", "feed:<articleId>" or "claude". */
  origin: string;
  /** primary: checked against a primary source; secondary: a digest or newspaper only. */
  verification?: "primary" | "secondary";
  status: ProposalStatus;
  createdAt: string;
  decidedAt?: string;
  /** The page version the approved change produced. */
  appliedVersion?: number;
  /** Why it couldn't be applied (stale). */
  note?: string;
  /** How sure Claude is that the change is right and worth adding (M12 inbox). */
  confidence?: "high" | "medium" | "low";
  /** You pressed "Verify, then add": Claude applies it once the primary source matches (M12 inbox). */
  verifyRequested?: string;
  /** You changed its wording in the inbox (M12). */
  revised?: string;
  /** You added it without the primary-source check; its source label says so (M12 inbox). */
  unverified?: boolean;
}

export type ProposalOp =
  | {
      op: "create";
      proposal: Omit<Proposal, "status" | "createdAt" | "decidedAt" | "appliedVersion" | "note">;
    }
  | { op: "reject"; proposalId: string }
  | { op: "applied"; proposalId: string; version: number }
  | { op: "stale"; proposalId: string; note: string }
  | { op: "delete"; proposalId: string }
  // The inbox (M12): ask Claude to check the primary source first, change the wording, or add it
  // now with its source marked unverified (then approve as usual).
  | { op: "verify"; proposalId: string }
  | { op: "revise"; proposalId: string; text?: string; replace?: string; cells?: string[] }
  | { op: "unverified"; proposalId: string };

export class ProposalError extends Error {}
/** The proposal no longer fits the page (its text or block changed). */
export class StaleProposal extends ProposalError {}

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;
const KINDS: ProposalKind[] = ["edit", "add", "row", "check"];

function cleanSource(s: ProposalSource | undefined): ProposalSource {
  const label = String(s?.label ?? "")
    .trim()
    .slice(0, 80);
  const url = String(s?.url ?? "").trim();
  let ok = false;
  try {
    ok = /^https?:$/.test(new URL(url).protocol);
  } catch {
    ok = false;
  }
  if (!label || !ok) throw new ProposalError("Every proposal needs a source: a short label and an http(s) link");
  const date = s?.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : undefined;
  return { label, url, ...(date ? { date } : {}) };
}

const text = (v: unknown, what: string, max = 2000) => {
  const t = String(v ?? "").trim();
  if (!t) throw new ProposalError(`Give the ${what}`);
  if (t.length > max) throw new ProposalError(`The ${what} is too long`);
  return t;
};

/** Applies one operation and returns the new list. Throws ProposalError for a bad op. */
export function applyProposalOp(list: Proposal[], op: ProposalOp, now = new Date().toISOString()): Proposal[] {
  const find = (id: string) => {
    const p = list.find((x) => x.id === id);
    if (!p) throw new ProposalError(`No proposal ${id}`);
    return p;
  };
  const update = (id: string, fn: (p: Proposal) => Proposal) => list.map((p) => (p.id === id ? fn(p) : p));
  switch (op.op) {
    case "create": {
      const p = op.proposal;
      if (!ID.test(p.id ?? "") || list.some((x) => x.id === p.id)) throw new ProposalError("Bad or duplicate id");
      if (!KINDS.includes(p.kind)) throw new ProposalError("Kind must be edit, add, row or check");
      if (!ID.test(p.blockId ?? "")) throw new ProposalError("Give the block the change belongs to");
      const base: Proposal = {
        id: p.id,
        kind: p.kind,
        blockId: p.blockId,
        source: cleanSource(p.source),
        reason: text(p.reason, "reason", 600),
        origin: String(p.origin ?? "claude").slice(0, 120),
        ...(p.verification === "primary" || p.verification === "secondary" ? { verification: p.verification } : {}),
        ...(p.confidence && ["high", "medium", "low"].includes(p.confidence) ? { confidence: p.confidence } : {}),
        status: "pending",
        createdAt: now,
      };
      if (p.kind === "edit") {
        base.find = text(p.find, "exact text to replace");
        base.replace = String(p.replace ?? "").trim();
        if (base.find === base.replace) throw new ProposalError("The replacement is the same as the original");
      } else if (p.kind === "row") {
        const cells = Array.isArray(p.cells) ? p.cells.map((c) => String(c ?? "").trim()) : [];
        if (!cells.length || cells.every((c) => !c)) throw new ProposalError("Give the new row's cells");
        base.cells = cells;
      } else {
        base.text = text(p.text, "new text");
        if (p.blockType && /^[A-Za-z]{1,40}$/.test(p.blockType)) base.blockType = p.blockType;
      }
      return [...list, base];
    }
    case "reject":
      if (find(op.proposalId).status !== "pending") throw new ProposalError("Only a pending proposal can be rejected");
      return update(op.proposalId, (p) => ({ ...p, status: "rejected", decidedAt: now }));
    case "applied":
      if (find(op.proposalId).status !== "pending") throw new ProposalError("Only a pending proposal can be applied");
      return update(op.proposalId, (p) => ({ ...p, status: "applied", decidedAt: now, appliedVersion: op.version }));
    case "stale":
      find(op.proposalId);
      return update(op.proposalId, (p) => ({ ...p, status: "stale", decidedAt: now, note: op.note.slice(0, 300) }));
    case "delete":
      find(op.proposalId);
      return list.filter((p) => p.id !== op.proposalId);
    case "verify":
      if (find(op.proposalId).status !== "pending") throw new ProposalError("Only a pending proposal can be verified");
      return update(op.proposalId, (p) => ({ ...p, verifyRequested: now }));
    case "revise": {
      const cur = find(op.proposalId);
      if (cur.status !== "pending") throw new ProposalError("Only a pending proposal can be changed");
      const next: Proposal = { ...cur, revised: now, verifyRequested: now };
      if (cur.kind === "edit") {
        next.replace = String(op.replace ?? "").trim();
        if (next.replace === cur.find) throw new ProposalError("The replacement is the same as the original");
      } else if (cur.kind === "row") {
        const cells = Array.isArray(op.cells) ? op.cells.map((c) => String(c ?? "").trim()) : [];
        if (!cells.length || cells.every((c) => !c)) throw new ProposalError("Give the new row's cells");
        next.cells = cells;
      } else next.text = text(op.text, "new text");
      return update(op.proposalId, () => next);
    }
    case "unverified": {
      const cur = find(op.proposalId);
      if (cur.status !== "pending") throw new ProposalError("Only a pending proposal can be added");
      const label = cur.source.label.endsWith("(unverified)")
        ? cur.source.label
        : `${cur.source.label.slice(0, 66)} (unverified)`;
      return update(op.proposalId, (p) => ({ ...p, unverified: true, source: { ...p.source, label } }));
    }
  }
}

// ---------- applying a proposal to a page ----------

const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-z0-9-]/gi, "");
const cite = (s: ProposalSource): InlineItem => ({ type: "cite", props: { label: s.label, url: s.url } });
const run = (t: string): InlineItem => ({ type: "text", text: t, styles: {} });

type Cell = InlineItem[] | { type: string; content: InlineItem[]; props?: Record<string, unknown> };
interface Table {
  type: "tableContent";
  rows: { cells: Cell[] }[];
}
const isTable = (c: unknown): c is Table =>
  !!c && typeof c === "object" && !Array.isArray(c) && (c as Table).type === "tableContent";

/** Every inline list in a block: its content, or each table cell's. */
function inlineLists(b: Block): InlineItem[][] {
  const c = b.content as unknown;
  if (Array.isArray(c)) return [c as InlineItem[]];
  if (isTable(c)) return c.rows.flatMap((r) => r.cells.map((cell) => (Array.isArray(cell) ? cell : cell.content)));
  return [];
}

/** Where a block sits: its list (top level or a parent's children) and index. */
function locate(blocks: Block[], id: string): { list: Block[]; index: number } | null {
  const i = blocks.findIndex((b) => b.id === id);
  if (i >= 0) return { list: blocks, index: i };
  for (const b of blocks) {
    const hit = b.children ? locate(b.children, id) : null;
    if (hit) return hit;
  }
  return null;
}

/** A copy of the blocks with the proposal applied. Throws ProposalError when it no longer fits. */
export function applyToBlocks(blocks: Block[], p: Proposal): Block[] {
  const copy = JSON.parse(JSON.stringify(blocks)) as Block[];
  const at = locate(copy, p.blockId);
  if (!at) throw new StaleProposal("The block this change belongs to is gone");
  const block = at.list[at.index];

  if (p.kind === "edit") {
    const find = p.find ?? "";
    const hits: { items: InlineItem[]; i: number }[] = [];
    for (const items of inlineLists(block))
      items.forEach((it, i) => {
        const n = it.type === "text" && it.text ? it.text.split(find).length - 1 : 0;
        for (let k = 0; k < n; k++) hits.push({ items, i });
      });
    if (hits.length !== 1)
      throw new StaleProposal(
        hits.length ? `The text to replace now appears ${hits.length} times` : "The text to replace is no longer there",
      );
    const { items, i } = hits[0];
    const [before, after] = items[i].text!.split(find);
    const styles = items[i].styles ?? {};
    // The new wording, then its source marker, then the rest of the run.
    items.splice(
      i,
      1,
      ...[
        before ? { ...items[i], text: before } : null,
        p.replace ? { type: "text", text: p.replace, styles } : null,
        cite(p.source),
        after ? { ...items[i], text: after } : null,
      ].filter((x): x is InlineItem => !!x),
    );
    return copy;
  }

  if (p.kind === "row") {
    const c = block.content as unknown;
    if (!isTable(c)) throw new StaleProposal("That block isn't a table");
    const width = c.rows[0]?.cells.length ?? p.cells!.length;
    const template = c.rows.at(-1)?.cells[0];
    const cells: Cell[] = Array.from({ length: width }, (_, i) => {
      const t = p.cells![i] ?? "";
      // The source marker goes after the main cell (the second, as in "Issue | Where it stands | Since").
      const citeAt = Math.min(width, p.cells!.length) >= 2 ? 1 : 0;
      const content = t ? [run(t), ...(i === citeAt ? [cite(p.source)] : [])] : [];
      return Array.isArray(template) || !template
        ? content
        : { type: "tableCell", props: { ...(template.props ?? {}) }, content };
    });
    c.rows.push({ cells });
    return copy;
  }

  // add, check
  const type = p.kind === "check" ? "checkListItem" : (p.blockType ?? block.type);
  const fresh: Block = {
    id: uid(),
    type,
    props: type === "checkListItem" ? { checked: false } : {},
    content: [run(p.text!), cite(p.source)],
    children: [],
  };
  at.list.splice(at.index + 1, 0, fresh);
  return copy;
}

/** The proposal to approve and the page's blocks with it applied; throws when it can't be. */
export function planApproval(blocks: Block[], list: Proposal[], id: string): { blocks: Block[]; proposal: Proposal } {
  const proposal = list.find((p) => p.id === id);
  if (!proposal) throw new ProposalError(`No proposal ${id}`);
  if (proposal.status !== "pending") throw new ProposalError(`This proposal is already ${proposal.status}`);
  return { blocks: applyToBlocks(blocks, proposal), proposal };
}

/** What the change looks like, for the review card: the old and new text. */
export function preview(blocks: Block[], p: Proposal): { before: string; after: string } {
  if (p.kind === "edit") return { before: p.find ?? "", after: p.replace ?? "" };
  if (p.kind === "row") return { before: "", after: (p.cells ?? []).filter(Boolean).join(" · ") };
  void blocks;
  return { before: "", after: p.text ?? "" };
}
