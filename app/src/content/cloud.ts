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
import { applyProposalOp, type Proposal, type ProposalOp } from "../lib/proposals";
import { approveProposal, restoreVersion, type ProposalIO } from "../lib/approve";
import { historyEntry, joinHeatmap } from "../lib/cloud-docs";
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

/** Saves a page in a transaction with the version check; `reason` keeps a labelled snapshot. */
function savePageTx(db: Firestore, c: Collection, id: string, page: StoredPage, baseVersion: number, reason?: string) {
  const ref = doc(db, c, id);
  return runTransaction(db, async (tx) => {
    const current = await tx.get(ref);
    const plan = planSave(c, id, current.data() as PageRecord | undefined, page, baseVersion, Date.now(), reason);
    if (plan.conflict) return plan;
    if (plan.snapshot) tx.set(doc(ref, "history", plan.snapshot.id), plan.snapshot.record);
    tx.set(ref, plan.record);
    return plan;
  });
}

function proposalIO(db: Firestore, c: Collection, id: string): ProposalIO {
  const pref = doc(db, "proposals", pageKeyDoc(c, id));
  const tref = doc(db, "comments", pageKeyDoc(c, id));
  return {
    page: async () => {
      const snap = await getDoc(doc(db, c, id));
      return snap.exists() ? decodePage(c, id, snap.data()) : null;
    },
    save: async (page, base, reason) => savePageTx(db, c, id, page as StoredPage, base, reason),
    proposals: async () => decodeJson((await getDoc(pref)).data(), { proposals: [] as Proposal[] }).proposals,
    proposalOp: async (op) =>
      (
        await change(db, pref, { proposals: [] as Proposal[] }, (v) => ({
          proposals: applyProposalOp(v.proposals, op),
        }))
      ).proposals,
    threadOp: (op) =>
      change(db, tref, { threads: [] as StoredThread[] }, (v) => ({ threads: applyThreadOp(v.threads, op) })),
  };
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
    if (path === "/api/proposals" && method === "GET")
      return allKeyed<Proposal>(db, "proposals", (v) => (v as { proposals?: Proposal[] }).proposals ?? []);
    if (path === "/api/discussions" && method === "GET")
      return allKeyed<Discussion>(db, "discussions", (v) => (v as { discussions?: Discussion[] }).discussions ?? []);

    if (path === "/api/heatmap" && method === "GET")
      return {
        map: await joinHeatmap((await getDoc(doc(db, "heatmap", "current"))).data(), async (i) =>
          (await getDoc(doc(db, "heatmap", `current-${i}`))).data(),
        ),
      };

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

    const [, , kind, collection, id, extra, more] = path.split("/"); // "", api, kind, collection, id[, hid]
    if (
      !COLLECTIONS.includes(collection as Collection) ||
      !ID.test(id ?? "") ||
      more !== undefined ||
      (extra !== undefined && kind !== "history")
    )
      throw new NotFoundError("Not found");
    const c = collection as Collection;

    if (kind === "history") {
      const hist = col(db, c, id, "history");
      if (method === "GET" && !extra)
        return {
          versions: (await getDocs(hist)).docs
            .filter((d) => !d.id.endsWith("-original"))
            .map((d) => historyEntry(d.id, d.data()))
            .sort((a, b) => b.savedAt - a.savedAt),
        };
      const hid = method === "GET" ? extra : String((body as { historyId?: string })?.historyId ?? "");
      if (!/^\d+-v\d+$/.test(hid ?? "")) throw new NotFoundError("Not found");
      const snap = await getDoc(doc(hist, hid));
      if (!snap.exists()) throw new NotFoundError("No such version");
      const old = decodePage(c, id, snap.data());
      if (method === "GET") return old;
      const io = proposalIO(db, c, id);
      const r = await restoreVersion(io, old, `v${old.version}`);
      return { ...r, page: await io.page() };
    }
    if (kind === "proposals") {
      const io = proposalIO(db, c, id);
      if (method === "GET") return { proposals: await io.proposals() };
      const op = body as ProposalOp | { op: "approve"; proposalId: string };
      if (op.op === "approve") {
        const r = await approveProposal(io, op.proposalId);
        return { ...r, page: await io.page() };
      }
      return { proposals: await io.proposalOp(op) };
    }

    if (kind === "pages") {
      const ref = doc(db, c, id);
      if (method === "GET") {
        const snap = await getDoc(ref);
        if (!snap.exists()) throw new NotFoundError("Not found");
        return decodePage(c, id, snap.data());
      }
      const { page, baseVersion } = body as { page: StoredPage; baseVersion: number };
      const r = await savePageTx(db, c, id, page, Number(baseVersion ?? 0));
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
