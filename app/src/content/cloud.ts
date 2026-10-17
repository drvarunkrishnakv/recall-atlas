// The save API's routes, answered from Firestore instead of the dev server. The stores call
// `api(path, init)` as before; in the cloud build that lands here. Changes run in
// transactions over the same pure operations the file API uses (threads, discussions,
// progress, captures), so both backends behave alike.
import {
  collection as col,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { ConflictError } from "./store";
import {
  COLLECTIONS,
  decodeJson,
  decodePage,
  docToPageKey,
  pageKeyDoc,
  planSave,
  type Collection,
  type PageRecord,
  type StoredPage,
} from "../lib/cloud-docs";
import { applyThreadOp, type StoredThread, type ThreadOp } from "../lib/threads";
import { applyDiscussionOp, type Discussion, type DiscussionOp } from "../lib/discussions";
import {
  applyCaptureOp,
  applyProgressOp,
  type Capture,
  type CaptureOp,
  type Progress,
  type ProgressOp,
} from "../lib/progress";

const ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,80}$/;

export class NotFoundError extends Error {}

/** Reads a `{json}` document, applies `fn` to its value and writes it back, in one transaction. */
function change<T>(db: Firestore, ref: DocumentReference, fallback: T, fn: (v: T) => T): Promise<T> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = fn(decodeJson(snap.data(), fallback));
    tx.set(ref, { json: JSON.stringify(next), updatedAt: Date.now() });
    return next;
  });
}

async function allKeyed<T>(db: Firestore, name: string, pick: (v: Record<string, T[]>) => T[]) {
  const out: Record<string, T[]> = {};
  for (const d of (await getDocs(col(db, name))).docs) {
    const key = docToPageKey(d.id);
    if (key) out[key] = pick(decodeJson(d.data(), {}));
  }
  return out;
}

export function cloudApi(db: Firestore) {
  return async (path: string, init?: RequestInit): Promise<unknown> => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    if (path === "/api/content" && method === "GET") {
      const out: Record<Collection, StoredPage[]> = { notes: [], cards: [] };
      await Promise.all(
        COLLECTIONS.map(async (c) => {
          const snap = await getDocs(col(db, c));
          out[c] = snap.docs.map((d) => decodePage(c, d.id, d.data())).sort((a, b) => a.id.localeCompare(b.id));
        }),
      );
      return out;
    }
    if (path === "/api/comments" && method === "GET")
      return allKeyed<StoredThread>(db, "comments", (v) => (v as { threads?: StoredThread[] }).threads ?? []);
    if (path === "/api/discussions" && method === "GET")
      return allKeyed<Discussion>(db, "discussions", (v) => (v as { discussions?: Discussion[] }).discussions ?? []);

    if (path === "/api/progress") {
      const ref = doc(db, "study", "progress");
      if (method === "GET") return decodeJson((await getDoc(ref)).data(), { notes: {} } as Progress);
      return change(db, ref, { notes: {} } as Progress, (p) => applyProgressOp(p, body as ProgressOp));
    }
    if (path === "/api/captures") {
      const ref = doc(db, "study", "captures");
      const fallback = { captures: [] as Capture[] };
      if (method === "GET") return decodeJson((await getDoc(ref)).data(), fallback);
      return change(db, ref, fallback, (v) => ({ captures: applyCaptureOp(v.captures, body as CaptureOp) }));
    }

    const [, , kind, collection, id, extra] = path.split("/"); // "", api, kind, collection, id
    if (!COLLECTIONS.includes(collection as Collection) || !ID.test(id ?? "") || extra !== undefined)
      throw new NotFoundError("Not found");
    const c = collection as Collection;

    if (kind === "pages") {
      const ref = doc(db, c, id);
      if (method === "GET") {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new NotFoundError("Not found");
        return decodePage(c, id, snap.data());
      }
      const { page, baseVersion } = body as { page: StoredPage; baseVersion: number };
      const r = await runTransaction(db, async (tx) => {
        const current = await tx.get(ref);
        const plan = planSave(c, id, current.data() as PageRecord | undefined, page, Number(baseVersion ?? 0));
        if (plan.conflict) return plan;
        if (plan.snapshot) tx.set(doc(ref, "history", plan.snapshot.id), plan.snapshot.record);
        tx.set(ref, plan.record);
        return plan;
      });
      if (r.conflict) throw new ConflictError("This page changed elsewhere. Reload to get the latest version.");
      return { version: r.version, updated: r.updated };
    }
    if (kind === "comments") {
      const ref = doc(db, "comments", pageKeyDoc(c, id));
      const fallback = { threads: [] as StoredThread[] };
      if (method === "GET") return decodeJson((await getDoc(ref)).data(), fallback);
      return change(db, ref, fallback, (v) => ({ threads: applyThreadOp(v.threads, body as ThreadOp) }));
    }
    if (kind === "discussions") {
      const ref = doc(db, "discussions", pageKeyDoc(c, id));
      const fallback = { discussions: [] as Discussion[] };
      if (method === "GET") return decodeJson((await getDoc(ref)).data(), fallback);
      return change(db, ref, fallback, (v) => ({
        discussions: applyDiscussionOp(v.discussions, body as DiscussionOp),
      }));
    }
    throw new NotFoundError("Not found");
  };
}
