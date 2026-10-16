// Comment threads as stored in `content/comments/<collection>-<id>.json`, and the
// operations that change them. Shared by the dev save API, the app and the Claude CLI.

export type ThreadKind = "comment" | "sticky" | "claude";
export type Author = "me" | "claude";

/** Where a thread points: the block it's in and the exact text it highlights. */
export interface Anchor {
  blockId: string;
  quote: string;
}

export interface StoredComment {
  id: string;
  userId: Author;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredThread {
  id: string;
  kind: ThreadKind;
  anchor: Anchor;
  /** True once the highlighted text is gone from the page; the thread then lists under "Detached". */
  detached?: boolean;
  resolved: boolean;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
  comments: StoredComment[];
}

export type ThreadOp =
  | {
      op: "create";
      thread: { id: string; kind: ThreadKind; anchor: Anchor };
      comment: { id: string; body: string };
      by: Author;
    }
  | { op: "reply"; threadId: string; comment: { id: string; body: string }; by: Author }
  | { op: "edit"; threadId: string; commentId: string; body: string }
  | { op: "deleteComment"; threadId: string; commentId: string }
  | { op: "delete"; threadId: string }
  | { op: "resolve"; threadId: string }
  | { op: "unresolve"; threadId: string }
  | { op: "kind"; threadId: string; kind: ThreadKind }
  | { op: "anchors"; anchors: Record<string, Anchor | null> };

export class ThreadOpError extends Error {}

/** Applies one operation and returns the new list. Throws ThreadOpError for a bad op. */
export function applyThreadOp(threads: StoredThread[], op: ThreadOp, now = new Date().toISOString()): StoredThread[] {
  const find = (id: string) => {
    const t = threads.find((x) => x.id === id);
    if (!t) throw new ThreadOpError(`No thread ${id}`);
    return t;
  };
  const update = (id: string, fn: (t: StoredThread) => StoredThread) =>
    threads.map((t) => (t.id === id ? { ...fn(t), updatedAt: now } : t));
  const body = (b: string) => {
    const text = String(b ?? "").trim();
    if (!text) throw new ThreadOpError("Empty comment");
    return text.slice(0, 10_000);
  };

  switch (op.op) {
    case "create": {
      if (threads.some((t) => t.id === op.thread.id)) throw new ThreadOpError("Thread exists");
      const t: StoredThread = {
        id: op.thread.id,
        kind: op.thread.kind,
        anchor: op.thread.anchor,
        resolved: false,
        createdAt: now,
        updatedAt: now,
        comments: [{ id: op.comment.id, userId: op.by, body: body(op.comment.body), createdAt: now, updatedAt: now }],
      };
      return [...threads, t];
    }
    case "reply":
      find(op.threadId);
      return update(op.threadId, (t) => ({
        ...t,
        comments: [
          ...t.comments,
          { id: op.comment.id, userId: op.by, body: body(op.comment.body), createdAt: now, updatedAt: now },
        ],
      }));
    case "edit":
      find(op.threadId);
      return update(op.threadId, (t) => ({
        ...t,
        comments: t.comments.map((c) => (c.id === op.commentId ? { ...c, body: body(op.body), updatedAt: now } : c)),
      }));
    case "deleteComment": {
      const t = find(op.threadId);
      if (t.comments[0]?.id === op.commentId) return threads.filter((x) => x.id !== op.threadId);
      return update(op.threadId, (x) => ({ ...x, comments: x.comments.filter((c) => c.id !== op.commentId) }));
    }
    case "delete":
      find(op.threadId);
      return threads.filter((t) => t.id !== op.threadId);
    case "resolve":
      if (find(op.threadId).kind === "sticky") throw new ThreadOpError("Sticky notes stay open; unpin first");
      return update(op.threadId, (t) => ({ ...t, resolved: true, resolvedAt: now }));
    case "unresolve":
      find(op.threadId);
      return update(op.threadId, (t) => ({ ...t, resolved: false, resolvedAt: undefined }));
    case "kind":
      find(op.threadId);
      return update(op.threadId, (t) => ({ ...t, kind: op.kind, resolved: op.kind === "sticky" ? false : t.resolved }));
    case "anchors":
      return threads.map((t) => {
        if (!(t.id in op.anchors)) return t;
        const a = op.anchors[t.id];
        if (a === null) return t.detached ? t : { ...t, detached: true };
        if (!t.detached && a.blockId === t.anchor.blockId && a.quote === t.anchor.quote) return t;
        return { ...t, anchor: a, detached: false };
      });
  }
}

/** Open threads where Claude is asked and hasn't had the last word. */
export function waitingForClaude(threads: StoredThread[]): StoredThread[] {
  return threads.filter((t) => t.kind === "claude" && !t.resolved && t.comments.at(-1)?.userId !== "claude");
}
