// Firestore rules and the app's cloud API, against the Firestore emulator (npm run test:cloud).
// Three clients: the owner (a token with the atlasOwner claim), another Google account, and
// nobody signed in.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  collection,
  getFirestore,
  setDoc,
} from "firebase/firestore";
import { cloudApi } from "./cloud";
import { ConflictError } from "./store";
import { encodePage } from "../lib/cloud-docs";
import { DEFAULT_SEATS } from "../lib/personas";

declare const process: { env: Record<string, string | undefined> }; // Node, under vitest
const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-atlas";
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
const apps: FirebaseApp[] = [];

function client(name: string, token?: { user_id: string; atlasOwner?: boolean }) {
  const app = initializeApp({ projectId: PROJECT, apiKey: "test" }, name);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(port), token ? { mockUserToken: token } : undefined);
  return db;
}

const owner = client("owner", { user_id: "owner-uid", atlasOwner: true });
const stranger = client("stranger", { user_id: "someone-else" });
const nobody = client("nobody");
const api = cloudApi(owner);
const put = (path: string, body: unknown) => api(path, { method: "PUT", body: JSON.stringify(body) });
const post = (path: string, body: unknown) => api(path, { method: "POST", body: JSON.stringify(body) });

const denied = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (e: { code?: string }) => e,
  );
  expect(e?.code).toBe("permission-denied");
};

/** Writes a `{json}` document as Claude's CLI would: the emulator lets "Bearer owner" past the rules. */
async function cliWrite(path: string, value: unknown) {
  const r = await fetch(`http://${host}:${port}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { json: { stringValue: JSON.stringify(value) } } }),
  });
  expect(r.ok).toBe(true);
}

// A made-up lesson and weekly note: the shapes only.
const LESSON = {
  day: "2026-10-20",
  written: "2026-10-20T13:30:00Z",
  cards: [
    {
      id: "c-one",
      concept: "Sample concept",
      subject: "Sample subject",
      itemIds: ["fx-1"],
      mistakes: [
        {
          itemId: "fx-1",
          attemptId: "fx-1-a",
          at: "2026-10-20T10:00:00Z",
          stem: "A sample question?",
          slipped: [],
          answer: { n: 0, text: "One" },
          correct: false,
        },
      ],
      teach: ["A sample paragraph."],
      remember: "A sample hook.",
      sources: [{ label: "Sample", url: "https://example.org" }],
      checked: false,
    },
  ],
  quiz: ["fx-1"],
  ratings: [],
};
const WEEK = {
  week: "2026-W43",
  written: "2026-10-25T13:00:00Z",
  lines: [{ text: "A sample line.", evidence: { route: "/prelims/notebook", label: "Notebook" } }],
};

beforeAll(async () => {
  await fetch(`http://${host}:${port}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE",
  });
});
afterAll(() => Promise.all(apps.map((a) => deleteApp(a))));

const page = (title: string) => ({
  collection: "notes",
  id: "T1",
  title,
  status: "draft",
  blocks: [
    { id: "b1", type: "table", content: { type: "tableContent", rows: [{ cells: [[{ type: "text", text: "x" }]] }] } },
  ],
});

describe("Firestore rules", () => {
  it("let the owner read and write every Atlas collection", async () => {
    for (const path of [
      "notes/R1",
      "cards/R1",
      "notes/R1/history/1-v1",
      "comments/notes-R1",
      "discussions/notes-R1",
      "proposals/notes-R1",
      "study/probe",
    ]) {
      await setDoc(doc(owner, path), { json: "{}" });
      expect((await getDoc(doc(owner, path))).exists()).toBe(true);
    }
  });

  it("let the owner read the heat map but leave writing it to the CLI", async () => {
    expect((await getDoc(doc(owner, "heatmap/current"))).exists()).toBe(false);
    await denied(setDoc(doc(owner, "heatmap/current"), { json: "{}" }));
    for (const db of [stranger, nobody]) await denied(getDoc(doc(db, "heatmap/current")));
    expect(await api("/api/heatmap")).toEqual({ map: null, comparison: null });
  });

  it("let the owner read practice banks, keep the attempt log and review state, but never delete attempts", async () => {
    expect((await getDoc(doc(owner, "items/polity-parliament"))).exists()).toBe(false);
    await denied(setDoc(doc(owner, "items/polity-parliament"), { json: "{}" }));
    await setDoc(doc(owner, "attempts/2026-10-20"), { json: '{"attempts":[]}' });
    await setDoc(doc(owner, "attempts/2026-10-20"), { json: '{"attempts":[{"id":"a1"}]}' });
    expect((await getDoc(doc(owner, "attempts/2026-10-20"))).data()?.json).toContain("a1");
    await denied(deleteDoc(doc(owner, "attempts/2026-10-20")));
    await setDoc(doc(owner, "srs/polity-parliament"), { json: '{"cards":{}}' });
    await deleteDoc(doc(owner, "srs/polity-parliament"));
    for (const db of [stranger, nobody]) {
      await denied(getDoc(doc(db, "items/polity-parliament")));
      await denied(getDoc(doc(db, "attempts/2026-10-20")));
      await denied(setDoc(doc(db, "attempts/2026-10-21"), { json: "{}" }));
      await denied(getDoc(doc(db, "srs/polity-parliament")));
    }
  });

  it("let the owner read lessons and rate their cards, but leave writing lessons and weekly notes to the CLI", async () => {
    await denied(setDoc(doc(owner, "lessons/2026-10-20"), { json: JSON.stringify(LESSON) }));
    await cliWrite("lessons/2026-10-20", LESSON);
    expect((await getDoc(doc(owner, "lessons/2026-10-20"))).exists()).toBe(true);
    await setDoc(doc(owner, "lessons/2026-10-20"), { json: JSON.stringify(LESSON), updatedAt: 1 });
    await denied(deleteDoc(doc(owner, "lessons/2026-10-20")));
    await denied(setDoc(doc(owner, "notes-week/2026-W43"), { json: JSON.stringify(WEEK) }));
    await cliWrite("notes-week/2026-W43", WEEK);
    expect((await getDoc(doc(owner, "notes-week/2026-W43"))).exists()).toBe(true);
    await denied(setDoc(doc(owner, "notes-week/2026-W43"), { json: "{}" }));
    for (const db of [stranger, nobody]) {
      await denied(getDoc(doc(db, "lessons/2026-10-20")));
      await denied(setDoc(doc(db, "lessons/2026-10-20"), { json: "{}" }));
      await denied(getDoc(doc(db, "notes-week/2026-W43")));
    }
  });

  it("refuse a signed-out visitor and any other account, for reads and writes", async () => {
    for (const db of [stranger, nobody]) {
      await denied(getDoc(doc(db, "notes/R1")));
      await denied(getDocs(collection(db, "notes")));
      await denied(getDoc(doc(db, "study/progress")));
      await denied(setDoc(doc(db, "notes/R2"), { json: "{}" }));
      await denied(setDoc(doc(db, "comments/notes-R1"), { json: "{}" }));
    }
    await denied(cloudApi(stranger)("/api/content"));
  });

  it("keep collections outside the Atlas closed, even to the owner", async () => {
    await denied(setDoc(doc(owner, "meta/owner"), { uid: "owner-uid" }));
    await denied(getDoc(doc(owner, "anything/else")));
    for (const closed of ["mcpKeys/x", "oauthClients/x", "oauthCodes/x", "oauthTokens/x"])
      await denied(getDoc(doc(owner, closed)));
  });
});

describe("Essay, Ethics and Medical Science (M12)", () => {
  /** Writes a content record as Claude's CLI would (the emulator's owner token bypasses the rules). */
  const seed = (path: string, value: unknown) =>
    fetch(`http://${host}:${port}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
      method: "PATCH",
      headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { json: { stringValue: JSON.stringify(value) } } }),
    }).then((r) => expect(r.ok).toBe(true));
  const line = {
    id: "SX1",
    paper: "I",
    subject: "Sample subject",
    order: 1,
    label: "A sample line",
    syllabus: "Sample wording.",
    diagrams: [{ id: "sample-diagram", t: "A sample diagram" }],
  };

  it("let the owner read content and keep their own records, which are never deleted", async () => {
    await seed("medical/SX1", line);
    expect((await getDoc(doc(owner, "medical/SX1"))).exists()).toBe(true);
    for (const kind of ["essay", "ethics", "medical"]) {
      await denied(setDoc(doc(owner, `${kind}/S1`), { json: "{}" }));
      await setDoc(doc(owner, `${kind}/mine-S1`), { json: "{}" });
      await setDoc(doc(owner, `${kind}/mine-S1`), { json: '{"x":1}' });
      await denied(deleteDoc(doc(owner, `${kind}/mine-S1`)));
      for (const db of [stranger, nobody]) {
        await denied(getDoc(doc(db, `${kind}/mine-S1`)));
        await denied(setDoc(doc(db, `${kind}/mine-S2`), { json: "{}" }));
      }
    }
    await denied(deleteDoc(doc(owner, "medical/SX1")));
  });

  it("answers the mains-extra routes: everything at once, and one change to your record", async () => {
    await seed("medical/SX1", line);
    const all = (await api("/api/mains-extra")) as {
      medical: { id: string }[];
      work: { medical: Record<string, unknown> };
      answers: unknown[];
    };
    expect(all.medical.map((l) => l.id)).toEqual(["SX1"]);
    expect(all.answers).toEqual([]); // the Write flow's collections are closed or empty here
    const { work } = (await post("/api/mains-extra/medical/SX1", { op: "rate", rating: "rusty" })) as {
      work: { rating: string };
    };
    expect(work.rating).toBe("rusty");
    await post("/api/mains-extra/medical/SX1", {
      op: "drill",
      drill: { id: "d1", diagram: "sample-diagram", at: "2026-10-21T08:00:00.000Z", ms: 190000 },
    });
    const again = (await api("/api/mains-extra")) as { work: { medical: Record<string, { drills: unknown[] }> } };
    expect(again.work.medical.SX1).toMatchObject({ rating: "rusty", drills: [{ id: "d1", ms: 190000 }] });
    await expect(post("/api/mains-extra/medical/NOPE", { op: "rate", rating: "ok" })).rejects.toThrow(/No medical/);
    await expect(post("/api/mains-extra/medical/SX1", { op: "try", text: "x" })).rejects.toThrow(/doesn't apply/);
  });
});

describe("cloud API", () => {
  it("saves pages with a version check, and keeps nested table cells intact", async () => {
    expect(await put("/api/pages/notes/T1", { page: page("One"), baseVersion: 0 })).toMatchObject({ version: 1 });
    const saved = (await api("/api/pages/notes/T1")) as ReturnType<typeof page> & { version: number };
    expect(saved).toMatchObject({ id: "T1", title: "One", status: "draft", version: 1 });
    expect(saved.blocks).toEqual(page("One").blocks);
    await expect(put("/api/pages/notes/T1", { page: page("Stale"), baseVersion: 0 })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(await put("/api/pages/notes/T1", { page: page("Two"), baseVersion: 1 })).toMatchObject({ version: 2 });
    const all = (await api("/api/content")) as { notes: { id: string; title: string }[] };
    expect(all.notes.find((n) => n.id === "T1")?.title).toBe("Two");
  });

  it("keeps a Markdown page's original in history when it is first converted", async () => {
    await setDoc(
      doc(owner, "notes/M1"),
      encodePage({ collection: "notes", id: "M1", title: "M", version: 0, updated: "", markdown: "# Hi" } as never, 0),
    );
    const listed = (await api("/api/content")) as { notes: { id: string; markdown?: string; blocks?: unknown }[] };
    expect(listed.notes.find((n) => n.id === "M1")).toMatchObject({ markdown: "# Hi" });
    await put("/api/pages/notes/M1", { page: { ...page("M"), id: "M1", markdown: "# Hi" }, baseVersion: 0 });
    const history = await getDocs(collection(owner, "notes/M1/history"));
    expect(history.docs.map((d) => d.id)).toEqual([expect.stringMatching(/-original$/)]);
    expect(JSON.parse(String((await getDoc(doc(owner, "notes/M1"))).get("json")))).not.toHaveProperty("markdown");
  });

  it("approves a proposal into the page with a labelled history entry, then restores the old version", async () => {
    const before = (await api("/api/pages/notes/T1")) as { version: number; blocks: { id: string }[] };
    const create = (pid: string, extra: Record<string, unknown>) =>
      post("/api/proposals/notes/T1", {
        op: "create",
        proposal: {
          id: pid,
          blockId: "b1",
          source: { label: "PIB", url: "https://pib.gov.in/x" },
          reason: "The release adds a figure.",
          origin: "feed:pib-1",
          ...extra,
        },
      });
    await create("p1", { kind: "check", text: "Confirm the figure" });
    await create("p2", { kind: "edit", find: "not in the page", replace: "y" });
    expect(await api("/api/proposals")).toMatchObject({ "notes:T1": [{ id: "p1" }, { id: "p2" }] });

    const ok = (await post("/api/proposals/notes/T1", { op: "approve", proposalId: "p1" })) as {
      version: number;
      proposals: { id: string; status: string }[];
      page: { blocks: { type: string }[] };
    };
    expect(ok.version).toBe(before.version + 1);
    expect(ok.proposals[0]).toMatchObject({ status: "applied" });
    expect(ok.page.blocks.map((b) => b.type)).toContain("checkListItem");
    // A proposal that no longer fits is marked stale, not applied.
    await expect(post("/api/proposals/notes/T1", { op: "approve", proposalId: "p2" })).rejects.toThrow(
      /no longer there/,
    );
    expect(((await api("/api/proposals/notes/T1")) as { proposals: { status: string }[] }).proposals[1].status).toBe(
      "stale",
    );

    const { versions } = (await api("/api/history/notes/T1")) as { versions: { id: string; reason?: string }[] };
    expect(versions[0].reason).toBe("Approved: The release adds a figure.");
    const restored = (await post("/api/history/notes/T1", { historyId: versions[0].id })) as {
      version: number;
      page: { blocks: { type: string }[] };
    };
    expect(restored.version).toBe(before.version + 2);
    expect(restored.page.blocks.map((b) => b.type)).not.toContain("checkListItem");
  });

  it("lists lessons, rates a card and takes it back, and reads the weekly note", async () => {
    await cliWrite("lessons/2026-10-20", LESSON);
    await cliWrite("notes-week/2026-W43", WEEK);
    const idx = (await api("/api/lessons")) as { days: { day: string }[]; latest: { day: string } };
    expect(idx.days.map((d) => d.day)).toEqual(["2026-10-20"]);
    expect(idx.latest.day).toBe("2026-10-20");
    const at = "2026-10-20T15:00:00Z";
    const rated = (await post("/api/lessons/2026-10-20", { op: "rate", cardId: "c-one", rating: "shaky", at })) as {
      ratings: unknown[];
    };
    expect(rated.ratings).toEqual([{ cardId: "c-one", rating: "shaky", at }]);
    expect(await api("/api/lessons")).toMatchObject({ days: [{ cards: [{ id: "c-one", rating: "shaky" }] }] });
    const undone = (await post("/api/lessons/2026-10-20", { op: "unrate", cardId: "c-one", at })) as {
      ratings: unknown[];
    };
    expect(undone.ratings).toEqual([]);
    await expect(api("/api/lessons/2026-10-21")).rejects.toThrow("No lesson");
    // Rating can't create a lesson.
    await expect(post("/api/lessons/2026-10-21", { op: "rate", cardId: "c-one", rating: "got", at })).rejects.toThrow(
      /No lesson/,
    );
    expect((await getDoc(doc(owner, "lessons/2026-10-21"))).exists()).toBe(false);
    expect(await api("/api/weeks")).toEqual({ weeks: ["2026-W43"], latest: WEEK });
    expect(await api("/api/weeks/2026-W43")).toEqual(WEEK);
    await expect(api("/api/weeks/2026-W44")).rejects.toThrow("No note");
  });

  it("applies comment, progress, capture and discussion operations", async () => {
    const op = { op: "create", thread: { id: "t1", kind: "claude", anchor: { blockId: "b1", quote: "x" } }, by: "me" };
    const { threads } = (await post("/api/comments/notes/T1", { ...op, comment: { id: "c1", body: "Why?" } })) as {
      threads: { id: string }[];
    };
    expect(threads.map((t) => t.id)).toEqual(["t1"]);
    expect(await api("/api/comments")).toMatchObject({ "notes:T1": [{ id: "t1", kind: "claude" }] });

    await post("/api/progress", { op: "read", noteId: "T1", day: "2026-10-17" });
    expect(await api("/api/progress")).toMatchObject({ notes: { T1: { readAt: "2026-10-17" } } });

    await post("/api/captures", { op: "add", id: "k1", text: "a thought" });
    expect(await api("/api/captures")).toMatchObject({ captures: [{ id: "k1", status: "open" }] });

    const d = { id: "d1", mode: "devil", topic: "A claim", anchor: null, seats: DEFAULT_SEATS.devil };
    await post("/api/discussions/notes/T1", { op: "create", discussion: d });
    expect(await api("/api/discussions")).toMatchObject({ "notes:T1": [{ id: "d1", status: "open" }] });
    await expect(post("/api/discussions/notes/T1", { op: "create", discussion: d })).rejects.toThrow();
    await expect(api("/api/pages/notes/Nope")).rejects.toThrow("Not found");
  });
});

describe("reading log (M11)", () => {
  it("lets the owner log and undo reading, never delete the record, and keeps everyone else out", async () => {
    await post("/api/reading/sample-science", { op: "log", bank: "fixture-stars", day: "2026-10-21" });
    await post("/api/reading/sample-science", { op: "log", bank: "fixture-stars", day: "2026-10-21" });
    await post("/api/reading/sample-science", { op: "log", bank: "fixture-tides", day: "2026-10-20" });
    expect(await api("/api/reading")).toEqual({
      subjects: { "sample-science": { topics: { "fixture-stars": ["2026-10-21"], "fixture-tides": ["2026-10-20"] } } },
    });
    await post("/api/reading/sample-science", { op: "unlog", bank: "fixture-tides", day: "2026-10-20" });
    expect(await api("/api/reading")).toEqual({
      subjects: { "sample-science": { topics: { "fixture-stars": ["2026-10-21"] } } },
    });
    await expect(
      post("/api/reading/sample-science", { op: "log", bank: "Bad Bank", day: "2026-10-21" }),
    ).rejects.toThrow();
    await denied(deleteDoc(doc(owner, "reading/sample-science")));
    for (const db of [stranger, nobody]) {
      await denied(getDoc(doc(db, "reading/sample-science")));
      await denied(setDoc(doc(db, "reading/sample-science"), { json: "{}" }));
    }
  });
});
