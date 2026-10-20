// Firestore for the CLI and the MCP server, through the Firebase Admin SDK (which the
// security rules don't apply to). Same documents and the same pure operations as the app's
// cloud API (src/content/cloud.ts), so the app and Claude see one set of content.
//
// Credentials: a service-account key at ~/.config/mains-atlas/service-account.json (or
// GOOGLE_APPLICATION_CREDENTIALS). With FIRESTORE_EMULATOR_HOST set, the local emulator is
// used instead, and on Cloud Functions the runtime's service account; neither needs a key.
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
  historyEntry,
  heatmapRecords,
  joinHeatmap,
  type Collection,
  type PageRecord,
  type StoredPage,
} from "../src/lib/cloud-docs.ts";
import { applyProposalOp, type Proposal } from "../src/lib/proposals.ts";
import { approveProposal, restoreVersion, type ProposalIO } from "../src/lib/approve.ts";
import { applyThreadOp, type StoredThread } from "../src/lib/threads.ts";
import { applyDiscussionOp, type Discussion } from "../src/lib/discussions.ts";
import { applyCaptureOp, applyProgressOp, type Capture, type Progress } from "../src/lib/progress.ts";
import type { Comparison, HeatMap } from "../src/lib/heatmap.ts";
import { applyAttemptOp, attemptsDocId, validateBank, type Attempt, type Bank } from "../src/lib/practice.ts";
import {
  applyLessonOp,
  lessonDocId,
  LessonError,
  validateLesson,
  validateWeeklyNote,
  weekDocId,
  type Lesson,
  type WeeklyNote,
} from "../src/lib/lessons.ts";
import type { Backend } from "./backend.ts";
import { mainsExtraFirestore } from "./mains-extra-firestore.ts";
import { mkdirSync } from "node:fs";
import {
  applyAnswerOp,
  isAnswerId,
  MainsError,
  PHOTO_FILE,
  storagePath,
  validateAnswer,
  validateQuestionSet,
  type MainsAnswer,
  type QuestionSet,
} from "../src/lib/mains.ts";

/** Where answer photos live: ATLAS_STORAGE_BUCKET, or the project's default Storage bucket. */
export const photoBucket = (app: App) =>
  process.env.ATLAS_STORAGE_BUCKET ?? `${app.options.projectId}.firebasestorage.app`;

// Named through a variable so the MCP bundles (rolldown) leave Storage out: only the CLI
// downloads photos.
const STORAGE_MODULE = "firebase-admin/storage";

/** Where the CLI keeps photos it downloads for the marking run to read. */
export const PHOTO_CACHE = process.env.ATLAS_PHOTO_CACHE ?? join(homedir(), ".cache", "mains-atlas", "answers");

export const KEY_PATH = join(homedir(), ".config", "mains-atlas", "service-account.json");

/** The Admin app: the emulator when FIRESTORE_EMULATOR_HOST is set, else the service-account key. */
export function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  if (process.env.FIRESTORE_EMULATOR_HOST)
    return initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-atlas" });
  // On Cloud Functions the runtime's own service account is used; no key file.
  if (process.env.K_SERVICE || process.env.FUNCTION_TARGET) return initializeApp();
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
  const saveTx = (collection: Collection, id: string, page: StoredPage, baseVersion: number, reason?: string) =>
    db.runTransaction(async (tx) => {
      const ref = db.doc(`${collection}/${id}`);
      const plan = planSave(
        collection,
        id,
        (await tx.get(ref)).data() as PageRecord | undefined,
        page,
        baseVersion,
        Date.now(),
        reason,
      );
      if (plan.conflict) return plan;
      if (plan.snapshot) tx.set(ref.collection("history").doc(plan.snapshot.id), plan.snapshot.record);
      tx.set(ref, plan.record);
      return { conflict: false as const, version: plan.version, updated: plan.updated };
    });
  const io = (collection: Collection, id: string): ProposalIO => ({
    page: async () => {
      const snap = await db.doc(`${collection}/${id}`).get();
      return snap.exists ? decodePage(collection, id, snap.data()!) : null;
    },
    save: (page, base, reason) => saveTx(collection, id, page as StoredPage, base, reason),
    proposals: async () =>
      decodeJson((await db.doc(`proposals/${pageKeyDoc(collection, id)}`).get()).data(), {
        proposals: [] as Proposal[],
      }).proposals,
    proposalOp: async (op) =>
      (
        await change(db.doc(`proposals/${pageKeyDoc(collection, id)}`), { proposals: [] as Proposal[] }, (v) => ({
          proposals: applyProposalOp(v.proposals, op),
        }))
      ).proposals,
    threadOp: (op) =>
      change(db.doc(`comments/${pageKeyDoc(collection, id)}`), { threads: [] as StoredThread[] }, (v) => ({
        threads: applyThreadOp(v.threads, op),
      })),
  });

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
    savePage: (collection, id, page, baseVersion) => saveTx(collection, id, page, baseVersion),
    allProposals: () => keyed<Proposal>("proposals", "proposals"),
    changeProposals: (collection, id, op) => io(collection, id).proposalOp(op),
    approve: (collection, id, proposalId) => approveProposal(io(collection, id), proposalId),
    async history(collection, id) {
      return (await db.collection(`${collection}/${id}/history`).get()).docs
        .filter((d) => !d.id.endsWith("-original"))
        .map((d) => historyEntry(d.id, d.data()))
        .sort((a, b) => b.savedAt - a.savedAt);
    },
    async restore(collection, id, historyId) {
      if (!/^\d+-v\d+$/.test(historyId)) throw new Error(`No version ${historyId}`);
      const snap = await db.doc(`${collection}/${id}/history/${historyId}`).get();
      if (!snap.exists) throw new Error(`No version ${historyId}`);
      const old = decodePage(collection, id, snap.data()!);
      return restoreVersion(io(collection, id), old, `v${old.version}`);
    },
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
    heatmap: async () =>
      joinHeatmap<HeatMap>((await db.doc("heatmap/current").get()).data(), async (i) =>
        (await db.doc(`heatmap/current-${i}`).get()).data(),
      ),
    async setHeatmap(map) {
      const batch = db.batch();
      for (const { id, record } of heatmapRecords(map)) batch.set(db.doc(`heatmap/${id}`), record);
      await batch.commit();
    },
    comparison: async () =>
      joinHeatmap<Comparison>((await db.doc("heatmap/questions").get()).data(), async (i) =>
        (await db.doc(`heatmap/questions-${i}`).get()).data(),
      ),
    async setComparison(c) {
      const batch = db.batch();
      for (const { id, record } of heatmapRecords(c, Date.now(), undefined, "questions"))
        batch.set(db.doc(`heatmap/${id}`), record);
      await batch.commit();
    },
    banks: async () =>
      (await db.collection("items").get()).docs
        .map((d) => decodeJson<Bank | null>(d.data(), null))
        .filter((b): b is Bank => !!b),
    async setBanks(banks, replace) {
      banks.forEach(validateBank);
      const keep = new Set(banks.map((b) => b.id));
      const batch = db.batch();
      for (const b of banks)
        batch.set(db.doc(`items/${b.id}`), {
          json: JSON.stringify(b),
          subject: b.subject,
          topic: b.topic,
          count: b.items.length,
          updatedAt: Date.now(),
        });
      if (replace) for (const d of (await db.collection("items").get()).docs) if (!keep.has(d.id)) batch.delete(d.ref);
      await batch.commit();
    },
    attempts: async () =>
      Object.fromEntries(
        (await db.collection("attempts").get()).docs.map((d) => [
          d.id,
          decodeJson(d.data(), { attempts: [] as Attempt[] }).attempts,
        ]),
      ),
    changeAttempts: async (day, op) =>
      (
        await change(db.doc(`attempts/${attemptsDocId(day)}`), { attempts: [] as Attempt[] }, (v) =>
          applyAttemptOp(v, op),
        )
      ).attempts,
    lessons: async () =>
      (await db.collection("lessons").get()).docs
        .map((d) => decodeJson<Lesson | null>(d.data(), null))
        .filter((l): l is Lesson => !!l)
        .sort((a, b) => a.day.localeCompare(b.day)),
    writeLesson: (day, build) =>
      db.runTransaction(async (tx) => {
        const ref = db.doc(`lessons/${lessonDocId(day)}`);
        const next = validateLesson(build(decodeJson<Lesson | null>((await tx.get(ref)).data(), null)));
        if (next.day !== day) throw new LessonError(`The lesson says ${next.day}, not ${day}`);
        tx.set(ref, { json: JSON.stringify(next), updatedAt: Date.now() });
        return next;
      }),
    changeLesson: (day, op) =>
      db.runTransaction(async (tx) => {
        const ref = db.doc(`lessons/${lessonDocId(day)}`);
        const next = applyLessonOp(decodeJson<Lesson | null>((await tx.get(ref)).data(), null), op);
        tx.set(ref, { json: JSON.stringify(next), updatedAt: Date.now() });
        return next;
      }),
    weeks: async () =>
      (await db.collection("notes-week").get()).docs
        .map((d) => decodeJson<WeeklyNote | null>(d.data(), null))
        .filter((n): n is WeeklyNote => !!n)
        .sort((a, b) => a.week.localeCompare(b.week)),
    async setWeek(note) {
      validateWeeklyNote(note);
      await db.doc(`notes-week/${weekDocId(note.week)}`).set({ json: JSON.stringify(note), updatedAt: Date.now() });
    },
    mainsQuestions: async () =>
      (await db.collection("mainsq").get()).docs
        .map((d) => decodeJson<QuestionSet | null>(d.data(), null))
        .filter((s): s is QuestionSet => !!s),
    async setMainsQuestions(sets, replace) {
      sets.forEach(validateQuestionSet);
      const keep = new Set<string>(sets.map((s) => s.paper));
      const batch = db.batch();
      for (const s of sets)
        batch.set(db.doc(`mainsq/${s.paper}`), {
          json: JSON.stringify(s),
          paper: s.paper,
          count: s.questions.length,
          updatedAt: Date.now(),
        });
      if (replace) for (const d of (await db.collection("mainsq").get()).docs) if (!keep.has(d.id)) batch.delete(d.ref);
      await batch.commit();
    },
    answers: async () =>
      (await db.collection("answers").get()).docs
        .map((d) => decodeJson<MainsAnswer | null>(d.data(), null))
        .filter((a): a is MainsAnswer => !!a),
    async answer(id) {
      if (!isAnswerId(id)) return null;
      return decodeJson<MainsAnswer | null>((await db.doc(`answers/${id}`).get()).data(), null);
    },
    async changeAnswer(id, op) {
      if (!isAnswerId(id)) throw new MainsError("Bad answer id");
      return db.runTransaction(async (tx) => {
        const ref = db.doc(`answers/${id}`);
        const next = applyAnswerOp(decodeJson<MainsAnswer | null>((await tx.get(ref)).data(), null), op);
        if (next.id !== id) throw new MainsError("The answer's id doesn't match its address");
        validateAnswer(next);
        tx.set(ref, { json: JSON.stringify(next), updatedAt: Date.now() });
        return next;
      });
    },
    async answerPhoto(id, file) {
      if (!isAnswerId(id) || !PHOTO_FILE.test(file)) throw new MainsError("Bad photo path");
      const { getStorage } = (await import(STORAGE_MODULE)) as typeof import("firebase-admin/storage");
      const app = adminApp();
      const remote = getStorage(app).bucket(photoBucket(app)).file(storagePath(id, file));
      if (!(await remote.exists())[0]) return null;
      mkdirSync(join(PHOTO_CACHE, id), { recursive: true });
      const destination = join(PHOTO_CACHE, id, file);
      await remote.download({ destination });
      return destination;
    },
    mainsExtra: mainsExtraFirestore(db),
    async restoreAll(data) {
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
      for (const [key, proposals] of Object.entries(data.proposals ?? {}))
        writes.push([
          db.doc(`proposals/${key.replace(":", "-")}`),
          { json: JSON.stringify({ proposals }), updatedAt: now },
        ]);
      for (const [key, discussions] of Object.entries(data.discussions))
        writes.push([
          db.doc(`discussions/${key.replace(":", "-")}`),
          { json: JSON.stringify({ discussions }), updatedAt: now },
        ]);
      writes.push([progressRef, { json: JSON.stringify(data.progress), updatedAt: now }]);
      writes.push([capturesRef, { json: JSON.stringify({ captures: data.captures }), updatedAt: now }]);
      for (const { id, record } of data.heatmap ? heatmapRecords(data.heatmap, now) : [])
        writes.push([db.doc(`heatmap/${id}`), record]);
      for (const { id, record } of data.comparison ? heatmapRecords(data.comparison, now, undefined, "questions") : [])
        writes.push([db.doc(`heatmap/${id}`), record]);
      for (let i = 0; i < writes.length; i += 10) {
        const batch = db.batch();
        for (const [ref, value] of writes.slice(i, i + 10)) batch.set(ref, value);
        await batch.commit();
      }
    },
  };
}
