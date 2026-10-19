// BlockNote ThreadStore backed by the Atlas comments file for one page. BlockNote keeps
// the highlight marks; this store keeps the threads, their kind (comment / sticky / Ask
// Claude) and their anchor (block + quoted text), so marks can be restored on load.
import { DefaultThreadStoreAuth, ThreadStore } from "@blocknote/core/comments";
import type { CommentData, ThreadData } from "@blocknote/core/comments";
import { api, type Collection } from "../content/store";
import type { Anchor, StoredThread, ThreadKind, ThreadOp } from "../lib/threads";

const uid = () => crypto.randomUUID().slice(0, 12);

function toThreadData(t: StoredThread): ThreadData {
  return {
    type: "thread",
    id: t.id,
    createdAt: new Date(t.createdAt),
    updatedAt: new Date(t.updatedAt),
    resolved: t.resolved,
    resolvedUpdatedAt: t.resolvedAt ? new Date(t.resolvedAt) : undefined,
    metadata: { kind: t.kind, anchor: t.anchor },
    comments: t.comments.map((c): CommentData => ({
      type: "comment",
      id: c.id,
      userId: c.userId,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
      reactions: [],
      metadata: {},
      body: c.body,
    })),
  };
}

export class AtlasThreadStore extends ThreadStore {
  stored: StoredThread[] = [];
  private data = new Map<string, ThreadData>();
  private subs = new Set<(threads: Map<string, ThreadData>) => void>();
  private path: string;

  constructor(collection: Collection, id: string) {
    super(new DefaultThreadStoreAuth("me", "editor"));
    this.path = `/api/comments/${collection}/${id}`;
  }

  private set(threads: StoredThread[]) {
    this.stored = threads;
    this.data = new Map(threads.map((t) => [t.id, toThreadData(t)]));
    this.subs.forEach((s) => s(this.data));
  }

  async load(): Promise<boolean> {
    const { threads } = (await api(this.path)) as { threads: StoredThread[] };
    const changed = JSON.stringify(threads) !== JSON.stringify(this.stored);
    if (changed) this.set(threads);
    return changed;
  }

  async send(op: ThreadOp) {
    const { threads } = (await api(this.path, { method: "POST", body: JSON.stringify(op) })) as {
      threads: StoredThread[];
    };
    this.set(threads);
  }

  // --- Atlas operations used by the comments UI ---

  async create(kind: ThreadKind, anchor: Anchor, body: string): Promise<string> {
    const id = uid();
    await this.send({ op: "create", thread: { id, kind, anchor }, comment: { id: uid(), body }, by: "me" });
    return id;
  }
  reply = (threadId: string, body: string) =>
    this.send({ op: "reply", threadId, comment: { id: uid(), body }, by: "me" });
  setKind = (threadId: string, kind: ThreadKind) => this.send({ op: "kind", threadId, kind });
  setColor = (threadId: string, color: number) => this.send({ op: "color", threadId, color });
  syncAnchors = (anchors: Record<string, Anchor | null>) => this.send({ op: "anchors", anchors });

  // --- BlockNote ThreadStore interface ---

  async createThread(options: {
    initialComment: { body: unknown };
    metadata?: { kind?: ThreadKind; anchor?: Anchor };
  }) {
    const id = await this.create(
      options.metadata?.kind ?? "comment",
      options.metadata?.anchor ?? { blockId: "", quote: "" },
      String(options.initialComment.body),
    );
    return this.getThread(id);
  }
  addThreadToDocument = undefined;
  async addComment(options: { comment: { body: unknown }; threadId: string }) {
    await this.reply(options.threadId, String(options.comment.body));
    return this.getThread(options.threadId).comments.at(-1)!;
  }
  async updateComment(options: { comment: { body: unknown }; threadId: string; commentId: string }) {
    await this.send({
      op: "edit",
      threadId: options.threadId,
      commentId: options.commentId,
      body: String(options.comment.body),
    });
  }
  async deleteComment(options: { threadId: string; commentId: string }) {
    await this.send({ op: "deleteComment", ...options });
  }
  async deleteThread(options: { threadId: string }) {
    await this.send({ op: "delete", threadId: options.threadId });
  }
  async resolveThread(options: { threadId: string }) {
    await this.send({ op: "resolve", threadId: options.threadId });
  }
  async unresolveThread(options: { threadId: string }) {
    await this.send({ op: "unresolve", threadId: options.threadId });
  }
  async addReaction() {}
  async deleteReaction() {}
  getThread(threadId: string): ThreadData {
    const t = this.data.get(threadId);
    if (!t) throw new Error(`No thread ${threadId}`);
    return t;
  }
  getThreads() {
    return this.data;
  }
  subscribe(cb: (threads: Map<string, ThreadData>) => void) {
    this.subs.add(cb);
    return () => void this.subs.delete(cb);
  }
}
