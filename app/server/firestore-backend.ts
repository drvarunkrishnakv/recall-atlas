// Firestore for the CLI and the MCP server, through the Firebase Admin SDK (which the
// security rules don't apply to). Same documents and the same pure operations as the app's
// cloud API (src/content/cloud.ts), so the app and Claude see one set of content.
//
// Credentials: a service-account key at ~/.config/mains-atlas/service-account.json (or
// GOOGLE_APPLICATION_CREDENTIALS). With FIRESTORE_EMULATOR_HOST set, the local emulator is
// used instead and no key is needed.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import {
  COLLECTIONS,
  decodeJson,
  decodePage,
  docToPageKey,
  encodePage,
  pageKeyDoc,
  planSave,
  type PageRecord,
} from "../src/lib/cloud-docs.ts";
import { applyThreadOp, type StoredThread } from "../src/lib/threads.ts";
import { applyDiscussionOp, type Discussion } from "../src/lib/discussions.ts";
import { applyCaptureOp, applyProgressOp, type Capture, type Progress } from "../src/lib/progress.ts";
import type { Backend } from "./backend.ts";

export const KEY_PATH = join(homedir(), ".config", "mains-atlas", "service-account.json");

/** The Admin app: the emulator when FIRESTORE_EMULATOR_HOST is set, else the service-account key. */
export function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  if (process.env.FIRESTORE_EMULATOR_HOST)
    return initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-atlas" });
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? KEY_PATH;
  if (!existsSync(path))
    throw new Error(
      `No Firebase service-account key at ${path}. Download one from Firebase console → Project settings → ` +
        `Service accounts → Generate new private key, and save it there (or set ATLAS_CONTENT_DIR to work on files).`,
    );
  const key = JSON.parse(readFileSync(path, "utf8")) as { project_id: string };
  return initializeApp({ credential: cert(path), projectId: key.project_id });
}

export function firestoreBackend(db: Firestore = getFirestore(adminApp())): Backend {
  const change = <T>(ref: DocumentReference, fallback: T, fn: (v: T) => T): Promise<T> =>
    db.runTransaction(async (tx) => {
      const next = fn(decodeJson((await tx.get(ref)).data(), fallback));
      tx.set(ref, { json: JSON.stringify(next), updatedAt: Date.now() });
      return next;
    });
  const keyed = async <T>(name: string, field: string) => {
    const out: Record<string, T[]> = {};
    for (const d of (await db.collection(name).get()).docs) {
      const key = docToPageKey(d.id);
      if (key) out[key] = decodeJson<Record<string, T[]>>(d.data(), {})[field] ?? [];
    }
    return out;
  };
  const progressRef = db.doc("study/progress");
  const capturesRef = db.doc("study/captures");

  return {
    kind: "firestore",
    pages: async (collection) =>
      (await db.collection(collection).get()).docs
        .map((d) => decodePage(collection, d.id, d.data()))
        .sort((a, b) => a.id.localeCompare(b.id)),
    async page(collection, id) {
      const snap = await db.doc(`${collection}/${id}`).get();
      return snap.exists ? decodePage(collection, id, snap.data()!) : null;
    },
    savePage: (collection, id, page, baseVersion) =>
      db.runTransaction(async (tx) => {
        const ref = db.doc(`${collection}/${id}`);
        const plan = planSave(collection, id, (await tx.get(ref)).data() as PageRecord | undefined, page, baseVersion);
        if (plan.conflict) return plan;
        if (plan.snapshot) tx.set(ref.collection("history").doc(plan.snapshot.id), plan.snapshot.record);
        tx.set(ref, plan.record);
        return { conflict: false, version: plan.version, updated: plan.updated };
      }),
    threads: async (collection, id) =>
      decodeJson((await db.doc(`comments/${pageKeyDoc(collection, id)}`).get()).data(), {
        threads: [] as StoredThread[],
      }).threads,
    changeThreads: async (collection, id, op) =>
      (
        await change(db.doc(`comments/${pageKeyDoc(collection, id)}`), { threads: [] as StoredThread[] }, (v) => ({
          threads: applyThreadOp(v.threads, op),
        }))
      ).threads,
    allThreads: () => keyed<StoredThread>("comments", "threads"),
    changeDiscussions: async (collection, id, op) =>
      (
        await change(db.doc(`discussions/${pageKeyDoc(collection, id)}`), { discussions: [] as Discussion[] }, (v) => ({
          discussions: applyDiscussionOp(v.discussions, op),
        }))
      ).discussions,
    allDiscussions: () => keyed<Discussion>("discussions", "discussions"),
    progress: async () => decodeJson((await progressRef.get()).data(), { notes: {} } as Progress),
    changeProgress: (op) => change(progressRef, { notes: {} } as Progress, (p) => applyProgressOp(p, op)),
    captures: async () => decodeJson((await capturesRef.get()).data(), { captures: [] as Capture[] }).captures,
    changeCaptures: async (op) =>
      (await change(capturesRef, { captures: [] as Capture[] }, (v) => ({ captures: applyCaptureOp(v.captures, op) })))
        .captures,
    async restore(data) {
      // Small batches: a long page is close to a megabyte on its own.
      const writes: [DocumentReference, Record<string, unknown>][] = [];
      const now = Date.now();
      for (const p of data.pages) {
        if (!COLLECTIONS.includes(p.collection)) continue;
        writes.push([db.doc(`${p.collection}/${p.id}`), { ...encodePage(p, now) }]);
      }
      for (const [key, threads] of Object.entries(data.threads))
        writes.push([
          db.doc(`comments/${key.replace(":", "-")}`),
          { json: JSON.stringify({ threads }), updatedAt: now },
        ]);
      for (const [key, discussions] of Object.entries(data.discussions))
        writes.push([
          db.doc(`discussions/${key.replace(":", "-")}`),
          { json: JSON.stringify({ discussions }), updatedAt: now },
        ]);
      writes.push([progressRef, { json: JSON.stringify(data.progress), updatedAt: now }]);
      writes.push([capturesRef, { json: JSON.stringify({ captures: data.captures }), updatedAt: now }]);
      for (let i = 0; i < writes.length; i += 10) {
        const batch = db.batch();
        for (const [ref, value] of writes.slice(i, i + 10)) batch.set(ref, value);
        await batch.commit();
      }
    },
  };
}
