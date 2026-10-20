// Essay, Ethics case studies and Medical Science (M12) in Firestore, for the CLI (Admin SDK,
// which the rules don't apply to). The app reads and writes the same documents through
// src/content/mains-extra-cloud.ts.
//
//   essay/{id}, ethics/{id}, medical/{line}                       {json} content, written here only
//   essay/mine-{id}, ethics/mine-{id}, medical/mine-{line}        {json} your records, written by the app
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { decodeJson } from "../src/lib/cloud-docs.ts";
import {
  applyWorkOp,
  emptyWork,
  EXTRA_KINDS,
  isContentId,
  MainsExtraError,
  mineId,
  validateImport,
  type MainsExtra,
} from "../src/lib/mains-extra.ts";
import type { MainsExtraBackend } from "./mains-extra-files.ts";

export function mainsExtraFirestore(db: Firestore): MainsExtraBackend {
  return {
    async load() {
      const out: MainsExtra = {
        essay: [],
        ethics: [],
        medical: [],
        work: { essay: {}, ethics: {}, medical: {} },
        answers: [],
        questions: [],
      };
      for (const kind of EXTRA_KINDS)
        for (const d of (await db.collection(kind).get()).docs) {
          const value = decodeJson<unknown>(d.data() as DocumentData, null);
          if (value === null) continue;
          if (d.id.startsWith("mine-")) (out.work[kind] as Record<string, unknown>)[d.id.slice(5)] = value;
          else (out[kind] as unknown[]).push(value);
        }
      out.medical.sort((a, b) => a.order - b.order);
      out.essay.sort((a, b) => b.year - a.year || a.n - b.n);
      out.ethics.sort((a, b) => a.n - b.n);
      return out;
    },
    async setContent(data, replace) {
      const checked = validateImport(data);
      const now = Date.now();
      for (const kind of EXTRA_KINDS) {
        const keep = new Set(checked[kind].map((x) => x.id));
        const writes = checked[kind].map((x) => [db.doc(`${kind}/${x.id}`), x] as const);
        for (let i = 0; i < writes.length; i += 20) {
          const batch = db.batch();
          for (const [ref, x] of writes.slice(i, i + 20)) batch.set(ref, { json: JSON.stringify(x), updatedAt: now });
          await batch.commit();
        }
        if (replace) {
          const gone = (await db.collection(kind).get()).docs.filter(
            (d) => !d.id.startsWith("mine-") && !keep.has(d.id),
          );
          for (let i = 0; i < gone.length; i += 20) {
            const batch = db.batch();
            gone.slice(i, i + 20).forEach((d) => batch.delete(d.ref));
            await batch.commit();
          }
        }
      }
    },
    async changeWork(kind, id, op) {
      if (!EXTRA_KINDS.includes(kind)) throw new MainsExtraError("Unknown kind");
      if (!isContentId(id)) throw new MainsExtraError("Bad id");
      const ref = db.doc(`${kind}/${mineId(id)}`);
      return db.runTransaction(async (tx) => {
        if (!(await tx.get(db.doc(`${kind}/${id}`))).exists) throw new MainsExtraError(`No ${kind} ${id}`);
        const next = applyWorkOp(kind, decodeJson((await tx.get(ref)).data(), emptyWork(kind)), op);
        tx.set(ref, { json: JSON.stringify(next), updatedAt: Date.now() });
        return next;
      });
    },
  };
}
