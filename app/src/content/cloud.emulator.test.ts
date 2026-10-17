// Firestore rules and the app's cloud API, against the Firestore emulator (npm run test:cloud).
// Three clients: the owner (a token with the atlasOwner claim), another Google account, and
// nobody signed in.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, doc, getDoc, getDocs, collection, getFirestore, setDoc } from "firebase/firestore";
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
