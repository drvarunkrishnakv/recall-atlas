// The Essay, Ethics and Medical Science routes (M12) answered from Firestore in the cloud build,
// like the dev save API answers them from files (server/mains-extra-files.ts).
//
//   GET  /api/mains-extra             content, your records, and the Write flow's answers and questions
//   POST /api/mains-extra/:kind/:id   one WorkOp on your record, in a transaction
import { collection as col, doc, getDocs, runTransaction, type DocumentData, type Firestore } from "firebase/firestore";
import { decodeJson } from "../lib/cloud-docs";
import {
  answerSummaries,
  applyWorkOp,
  emptyWork,
  EXTRA_KINDS,
  isContentId,
  MainsExtraError,
  mineId,
  questionSummaries,
  type ExtraKind,
  type MainsExtra,
  type WorkOp,
} from "../lib/mains-extra";

/** A document's value: its `json`, or its fields when it keeps them plainly. */
const valueOf = (id: string, data: DocumentData): unknown => {
  if (typeof data.json === "string") {
    const v = decodeJson<unknown>(data, null);
    return v && typeof v === "object" && !Array.isArray(v) ? { id, ...v } : v;
  }
  return { id, ...data };
};

/** The Write flow's collections (M8): read when they exist and the rules allow it, else nothing. */
async function readLoose(db: Firestore, name: string): Promise<unknown[]> {
  try {
    return (await getDocs(col(db, name))).docs.map((d) => valueOf(d.id, d.data()));
  } catch {
    return [];
  }
}

export async function mainsExtraCloud(db: Firestore, path: string, method: string, body: unknown): Promise<unknown> {
  if (path === "/api/mains-extra" && method === "GET") {
    const out: MainsExtra = {
      essay: [],
      ethics: [],
      medical: [],
      work: { essay: {}, ethics: {}, medical: {} },
      answers: [],
      questions: [],
    };
    const [snaps, answers, questions] = await Promise.all([
      Promise.all(EXTRA_KINDS.map((k) => getDocs(col(db, k)))),
      readLoose(db, "answers"),
      readLoose(db, "mainsq"),
    ]);
    EXTRA_KINDS.forEach((kind, i) => {
      for (const d of snaps[i].docs) {
        const value = decodeJson<unknown>(d.data(), null);
        if (value === null) continue;
        if (d.id.startsWith("mine-")) (out.work[kind] as Record<string, unknown>)[d.id.slice(5)] = value;
        else (out[kind] as unknown[]).push(value);
      }
    });
    out.medical.sort((a, b) => a.order - b.order);
    out.essay.sort((a, b) => b.year - a.year || a.n - b.n);
    out.ethics.sort((a, b) => a.n - b.n);
    out.answers = answerSummaries(answers);
    out.questions = questionSummaries(questions);
    return out;
  }
  const m = /^\/api\/mains-extra\/([a-z]+)\/([^/]+)$/.exec(path);
  if (m && method === "POST") {
    const kind = m[1] as ExtraKind;
    const id = decodeURIComponent(m[2]);
    if (!EXTRA_KINDS.includes(kind) || !isContentId(id)) throw new MainsExtraError("Not found");
    const ref = doc(db, kind, mineId(id));
    const work = await runTransaction(db, async (tx) => {
      if (!(await tx.get(doc(db, kind, id))).exists()) throw new MainsExtraError(`No ${kind} ${id}`);
      const next = applyWorkOp(kind, decodeJson((await tx.get(ref)).data(), emptyWork(kind)), body as WorkOp);
      tx.set(ref, { json: JSON.stringify(next), updatedAt: Date.now() });
      return next;
    });
    return { work };
  }
  throw new MainsExtraError("Not found");
}
