// The CLI's Mains commands on Firestore and Storage (Admin SDK) against the emulators
// (npm run test:cloud): questions in and out, the marking run's steps, and a photo downloaded to
// a file the run can read.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { getStorage } from "firebase-admin/storage";
import { CHECKLIST, draftAnswer, groupQuestions, type MainsQuestion } from "../src/lib/mains.ts";

const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-atlas";
const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.ATLAS_STORAGE_BUCKET = `${PROJECT}.appspot.com`;
process.env.ATLAS_PHOTO_CACHE = mkdtempSync(join(tmpdir(), "atlas-photos-"));
const { adminApp, firestoreBackend } = await import("./firestore-backend.ts");
const cloud = firestoreBackend();

const q = (id: string, paper: MainsQuestion["paper"]): MainsQuestion => ({
  id,
  paper,
  marks: 10,
  words: 150,
  text: `Sample question ${id}?`,
  asksFor: ["A sample part"],
  topic: "Sample",
  year: 2021,
  source: "pyq",
});

beforeAll(async () => {
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
});

describe("Mains on Firestore (CLI)", () => {
  it("imports questions by paper, merges, and replaces", async () => {
    await cloud.setMainsQuestions(groupQuestions([q("gs1-a", "GS1"), q("gs2-a", "GS2")]));
    expect((await cloud.mainsQuestions()).map((s) => s.paper).sort()).toEqual(["GS1", "GS2"]);
    await cloud.setMainsQuestions(groupQuestions([q("gs2-b", "GS2")]), true);
    const sets = await cloud.mainsQuestions();
    expect(sets.map((s) => [s.paper, s.questions.map((x) => x.id)])).toEqual([["GS2", ["gs2-b"]]]);
    await expect(cloud.setMainsQuestions([{ paper: "GS2", questions: [q("gs3-x", "GS3")] }])).rejects.toThrow(/GS3/);
  });

  it("marks a waiting answer, resolves a dispute and marks a rewrite", async () => {
    const a = draftAnswer(q("gs2-b", "GS2"), new Date("2026-10-21T05:00:00Z"));
    await cloud.changeAnswer(a.id, { op: "create", answer: a });
    await cloud.changeAnswer(a.id, {
      op: "addPage",
      page: { file: "page-1.png", type: "image/png", at: "2026-10-21T05:08:00Z" },
    });
    await cloud.changeAnswer(a.id, { op: "submit", selfScore: 6, selfMissed: [], at: "2026-10-21T05:09:00Z" });
    expect((await cloud.answers()).filter((x) => x.status === "waiting").map((x) => x.id)).toEqual([a.id]);
    const marking = {
      checklist: CHECKLIST.map((c) => ({ key: c.key, got: c.key === "dimensions" ? 0.5 : c.max, why: "Sample why." })),
      comments: [{ page: 1, y: 0.2, kind: "fix" as const, text: "Sample comment." }],
      keep: [],
      fix: [],
      outline: [],
      fromNotes: [],
      tags: [{ tag: "thin-dimensions" as const, note: "Sample" }],
      run: "2026-10-21 evening",
      markedAt: "2026-10-21T13:00:00Z",
    };
    const m = await cloud.changeAnswer(a.id, { op: "mark", marking, transcript: { text: "Sample.", unsure: [] } });
    expect(m.marking!.score).toBe(8.5);
    await cloud.changeAnswer(a.id, {
      op: "dispute",
      dispute: { id: "d-1", item: "dimensions", text: "Sample.", at: "2026-10-21T14:00:00Z" },
    });
    expect((await cloud.answer(a.id))!.status).toBe("disputed");
    const r = await cloud.changeAnswer(a.id, {
      op: "resolve",
      disputeId: "d-1",
      outcome: "changed",
      reason: "Sample reason.",
      points: 1,
      at: "2026-10-22T01:00:00Z",
    });
    expect([r.status, r.marking!.score]).toEqual(["marked", 9]);
  });

  it("downloads a page photo from Storage to a file for the run to read", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    await getStorage(adminApp())
      .bucket(process.env.ATLAS_STORAGE_BUCKET)
      .file("answers/a-photo-1/page-1.png")
      .save(bytes, { contentType: "image/png" });
    const path = await cloud.answerPhoto("a-photo-1", "page-1.png");
    expect(path).toBe(join(process.env.ATLAS_PHOTO_CACHE!, "a-photo-1", "page-1.png"));
    expect(readFileSync(path!)).toEqual(bytes);
    expect(await cloud.answerPhoto("a-photo-1", "page-2.png")).toBeNull();
    await expect(cloud.answerPhoto("../x", "page-1.png")).rejects.toThrow(/Bad photo path/);
  });
});
