// Mains answers (M8) in the emulators (npm run test:cloud): the Firestore rules for questions and
// answers, the app's cloud API for answers, and the Storage rules for page photos. Three clients:
// the owner (a token with the atlasOwner claim), another Google account, and nobody signed in.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, deleteDoc, doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import {
  connectStorageEmulator,
  deleteObject,
  getMetadata,
  getStorage,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from "firebase/storage";
import { cloudApi } from "./cloud";
import { draftAnswer, type MainsAnswer, type MainsQuestion } from "../lib/mains";

declare const process: { env: Record<string, string | undefined> }; // Node, under vitest
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-atlas";
const BUCKET = `${PROJECT}.appspot.com`;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
const [shost, sport] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199").split(":");
const apps: FirebaseApp[] = [];
type Token = { user_id: string; atlasOwner?: boolean };

function client(name: string, token?: Token) {
  const app = initializeApp({ projectId: PROJECT, apiKey: "test", storageBucket: BUCKET }, `mains-${name}`);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(port), token ? { mockUserToken: token } : undefined);
  const st = getStorage(app);
  connectStorageEmulator(st, shost, Number(sport), token ? { mockUserToken: token } : undefined);
  return { db, st };
}

const owner = client("owner", { user_id: "owner-uid", atlasOwner: true });
const stranger = client("stranger", { user_id: "someone-else" });
const nobody = client("nobody");
const api = cloudApi(owner.db);
const post = (path: string, body: unknown) =>
  api(path, { method: "POST", body: JSON.stringify(body) }) as Promise<{ answer: MainsAnswer }>;

const denied = async (p: Promise<unknown>, code = "permission-denied") => {
  const e = await p.then(
    () => null,
    (e: { code?: string }) => e,
  );
  expect(e?.code).toBe(code);
};
const deniedStorage = (p: Promise<unknown>) => denied(p, "storage/unauthorized");

const question: MainsQuestion = {
  id: "gs2-2020-sample",
  paper: "GS2",
  marks: 10,
  words: 150,
  text: "A sample question?",
  asksFor: ["A sample part"],
  topic: "Sample",
  year: 2020,
  source: "pyq",
};

beforeAll(async () => {
  await fetch(`http://${host}:${port}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE",
  });
});
afterAll(() => Promise.all(apps.map((a) => deleteApp(a))));

describe("Mains in Firestore", () => {
  it("lets the owner read questions but leaves writing them to the CLI", async () => {
    expect((await getDoc(doc(owner.db, "mainsq/GS2"))).exists()).toBe(false);
    await denied(setDoc(doc(owner.db, "mainsq/GS2"), { json: "{}" }));
    for (const c of [stranger, nobody]) await denied(getDoc(doc(c.db, "mainsq/GS2")));
    expect(await api("/api/mains")).toEqual({ sets: [], answers: [] });
  });

  it("keeps an answer: draft, pages, sent, disputed; never deleted, and never marked by the app", async () => {
    const a = draftAnswer(question, new Date("2026-10-21T05:00:00Z"));
    const path = `/api/mains/answers/${a.id}`;
    await post(path, { op: "create", answer: a });
    await post(path, { op: "addPage", page: { file: "page-1.jpg", type: "image/jpeg", at: "2026-10-21T05:08:00Z" } });
    const sent = await post(path, { op: "submit", selfScore: 6, selfMissed: ["Evidence"], at: "2026-10-21T05:09:00Z" });
    expect(sent.answer.status).toBe("waiting");
    await expect(
      post(path, { op: "addPage", page: { file: "page-2.jpg", type: "image/jpeg", at: "2026-10-21T05:10:00Z" } }),
    ).rejects.toThrow(/sent/);
    await expect(post(path, { op: "mark", marking: {}, transcript: { text: "x", unsure: [] } })).rejects.toThrow(/CLI/);
    expect(((await api(path)) as MainsAnswer).status).toBe("waiting");
    expect(((await api("/api/mains")) as { answers: MainsAnswer[] }).answers.map((x) => x.id)).toEqual([a.id]);
    await expect(api("/api/mains/answers/a-none")).rejects.toThrow(/Not found/);

    await denied(deleteDoc(doc(owner.db, `answers/${a.id}`)));
    for (const c of [stranger, nobody]) {
      await denied(getDoc(doc(c.db, `answers/${a.id}`)));
      await denied(setDoc(doc(c.db, "answers/a-other"), { json: "{}" }));
    }
  });
});

describe("Page photos in Storage", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
  const at = (st: FirebaseStorage, path: string) => ref(st, path);

  it("lets the owner upload, replace and read page photos", async () => {
    await uploadBytes(at(owner.st, "answers/a-1/page-1.jpg"), jpeg, { contentType: "image/jpeg" });
    await uploadBytes(at(owner.st, "answers/a-1/page-1.jpg"), jpeg.slice(0, 6), { contentType: "image/jpeg" });
    expect((await getMetadata(at(owner.st, "answers/a-1/page-1.jpg"))).size).toBe(6);
    await uploadBytes(at(owner.st, "answers/a-1/rewrite-1.png"), jpeg, { contentType: "image/png" });
  });

  it("refuses other types, other names, large files and deleting", async () => {
    await deniedStorage(uploadBytes(at(owner.st, "answers/a-1/page-2.jpg"), jpeg, { contentType: "text/plain" }));
    await deniedStorage(uploadBytes(at(owner.st, "answers/a-1/notes.jpg"), jpeg, { contentType: "image/jpeg" }));
    await deniedStorage(uploadBytes(at(owner.st, "answers/a-1/page-1.gif"), jpeg, { contentType: "image/gif" }));
    await deniedStorage(uploadBytes(at(owner.st, "elsewhere/page-1.jpg"), jpeg, { contentType: "image/jpeg" }));
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    await deniedStorage(uploadBytes(at(owner.st, "answers/a-1/page-3.jpg"), big, { contentType: "image/jpeg" }));
    await deniedStorage(deleteObject(at(owner.st, "answers/a-1/page-1.jpg")));
  });

  it("refuses a signed-out visitor and any other account", async () => {
    for (const c of [stranger, nobody]) {
      await deniedStorage(getMetadata(at(c.st, "answers/a-1/page-1.jpg")));
      await deniedStorage(uploadBytes(at(c.st, "answers/a-2/page-1.jpg"), jpeg, { contentType: "image/jpeg" }));
    }
  });
});
