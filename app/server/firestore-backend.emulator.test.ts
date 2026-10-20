// The CLI's Firestore backend (Admin SDK) against the emulator (npm run test:cloud): the
// fixture imports and exports without loss, and saves and operations behave like the files.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { fileBackend, snapshot, type Snapshot } from "./backend.ts";
import { firestoreBackend } from "./firestore-backend.ts";
import { HEATMAP_PART } from "../src/lib/cloud-docs.ts";
import type { HeatMap } from "../src/lib/heatmap.ts";
import { mergeLesson, type Lesson, type WeeklyNote } from "../src/lib/lessons.ts";

const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-atlas";
const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const fixture = mkdtempSync(join(tmpdir(), "atlas-fs-"));
cpSync(join(import.meta.dirname, "../fixtures/content"), fixture, { recursive: true });
const files = fileBackend(fixture);
const cloud = firestoreBackend();

/** Deep copy with object keys sorted, so key order doesn't count. */
const sorted = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sorted)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sorted((v as Record<string, unknown>)[k])]),
        )
      : v;
const norm = (s: Snapshot) => sorted({ ...s, pages: [...s.pages].sort((a, b) => a.id.localeCompare(b.id)) });

beforeAll(async () => {
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
});

describe("Firestore backend", () => {
  it("imports the fixture and exports it back unchanged", async () => {
    const original = await snapshot(files);
    expect(original.pages.length).toBeGreaterThan(0);
    await cloud.restoreAll(original);
    const out = mkdtempSync(join(tmpdir(), "atlas-export-"));
    // Files for things deleted from Firestore are pruned from the mirror.
    mkdirSync(join(out, "notes"), { recursive: true });
    mkdirSync(join(out, "comments"), { recursive: true });
    writeFileSync(join(out, "notes", "GONE.json"), "{}");
    writeFileSync(join(out, "notes", "GONE.md"), "");
    writeFileSync(join(out, "comments", "notes-GONE.json"), "{}");
    await fileBackend(out).restoreAll(await snapshot(cloud), { prune: true });
    expect(existsSync(join(out, "notes", "GONE.md")) || existsSync(join(out, "comments", "notes-GONE.json"))).toBe(
      false,
    );
    const round = await snapshot(fileBackend(out));
    expect(norm(round)).toEqual(norm(original));
  });

  it("converts a Markdown page on its first save, then checks versions", async () => {
    const [note] = await cloud.pages("notes");
    expect(note.markdown).toBeTruthy();
    const blocks = [{ id: "b1", type: "paragraph", content: [{ type: "text", text: "Converted" }] }];
    const r = await cloud.savePage("notes", note.id, { ...note, blocks }, 0);
    expect(r).toMatchObject({ conflict: false, version: 1 });
    expect(await cloud.savePage("notes", note.id, { ...note, blocks }, 0)).toMatchObject({ conflict: true });
    const saved = await cloud.page("notes", note.id);
    expect(saved).toMatchObject({ version: 1, blocks });
    expect(saved).not.toHaveProperty("markdown");
  });

  it("replies in threads and files captures as Claude", async () => {
    const [note] = await cloud.pages("notes");
    await cloud.changeThreads("notes", note.id, {
      op: "create",
      thread: { id: "q1", kind: "claude", anchor: { blockId: "b", quote: "q" } },
      comment: { id: "c1", body: "Is this current?" },
      by: "me",
    });
    const threads = await cloud.changeThreads("notes", note.id, {
      op: "reply",
      threadId: "q1",
      comment: { id: "c2", body: "Yes." },
      by: "claude",
    });
    expect(threads.find((t) => t.id === "q1")?.comments.map((c) => c.userId)).toEqual(["me", "claude"]);
    expect((await cloud.allThreads())[`notes:${note.id}`].some((t) => t.id === "q1")).toBe(true);

    await cloud.changeCaptures({ op: "add", id: "k9", text: "file me" });
    const caps = await cloud.changeCaptures({ op: "done", id: "k9", reply: "Filed.", note: note.id });
    expect(caps.find((c) => c.id === "k9")).toMatchObject({ status: "done", note: note.id });
  });

  it("writes lessons keeping your ratings, and keeps the weekly notes, like the files do", async () => {
    const lesson = JSON.parse(readFileSync(join(fixture, "practice", "lessons", "2026-10-20.json"), "utf8")) as Lesson;
    const week = JSON.parse(readFileSync(join(fixture, "practice", "weeks", "2026-W43.json"), "utf8")) as WeeklyNote;
    const empty = fileBackend(mkdtempSync(join(tmpdir(), "atlas-lessons-")));
    for (const b of [cloud, empty]) {
      await b.writeLesson(lesson.day, () => ({ ...lesson, ratings: [] }));
      const at = "2026-10-20T15:00:00Z";
      await b.changeLesson(lesson.day, { op: "rate", cardId: lesson.cards[0].id, rating: "shaky", at });
      const again = await b.writeLesson(lesson.day, (cur) => mergeLesson(cur, { ...lesson, ratings: [] }, []));
      expect(again.ratings).toEqual([{ cardId: lesson.cards[0].id, rating: "shaky", at }]);
      await expect(b.writeLesson("2026-10-21", () => lesson)).rejects.toThrow(/not 2026-10-21/);
      await expect(b.changeLesson("2026-10-22", { op: "unrate", cardId: "x", at })).rejects.toThrow(/No lesson/);
      expect((await b.lessons()).map((l) => l.day)).toEqual([lesson.day]);
      await b.setWeek(week);
      expect(await b.weeks()).toEqual([week]);
      await expect(b.setWeek({ ...week, lines: [] })).rejects.toThrow(/lines/);
    }
  });

  it("keeps a heat map too long for one document in parts", async () => {
    const map = JSON.parse(readFileSync(join(fixture, "heatmap.json"), "utf8")) as HeatMap;
    const story = map.stories[0];
    for (let i = 0; i < 400; i++) map.stories.push({ ...story, id: `copy-${i}`, name: `Copy ${i}` });
    expect(JSON.stringify(map).length).toBeGreaterThan(HEATMAP_PART);
    await cloud.setHeatmap(map);
    expect(await cloud.heatmap()).toEqual(map);
  });
});
