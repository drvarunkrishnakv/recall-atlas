// The MCP server over HTTP, as the hosted function runs it, against the Firestore emulator
// (npm run test:cloud): per-AI keys, refusals, and turns and flags labelled with the AI.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getFirestore } from "firebase-admin/firestore";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { adminApp, firestoreBackend } from "./firestore-backend.ts";
import { createKey, keyChecker, revokeKey } from "./mcp-keys.ts";
import { handleMcp } from "../mcp/http.ts";

const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-atlas";
const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const fs = getFirestore(adminApp());
const db = firestoreBackend(fs);
let server: Server;
let url: string;
const keys: Record<string, string> = {};

const connect = async (key: string) => {
  const client = new Client({ name: "test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }),
  );
  return {
    client,
    call: async (name: string, args: Record<string, unknown>) => {
      const r = (await client.callTool({ name, arguments: args })) as {
        isError?: boolean;
        content: { text: string }[];
      };
      return { error: !!r.isError, text: r.content.map((c) => c.text).join("\n") };
    },
  };
};

beforeAll(async () => {
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await db.restore({
    pages: [
      {
        collection: "notes",
        id: "P1",
        title: "Test note",
        version: 1,
        updated: "2026-10-17",
        blocks: [
          { id: "b1", type: "paragraph", content: [{ type: "text", text: "The 16th FC kept the share at 41%." }] },
        ],
      },
    ],
    threads: {},
    discussions: {},
    progress: { notes: {} },
    captures: [],
  });
  await db.changeDiscussions("notes", "P1", {
    op: "create",
    discussion: {
      id: "d1",
      mode: "devil",
      topic: "The share stays at 41%",
      anchor: null,
      seats: [
        { role: "devil", by: "devil", ai: "gemini" },
        { role: "defender", by: "claude" },
      ],
    },
  });
  keys.grok = (await createKey(fs, "grok", "Grok Bot")).key;
  keys.gemini = (await createKey(fs, "gemini", "Gemini")).key;
  const checkKey = keyChecker(fs, 0);
  server = createServer((req, res) => void handleMcp({ db, checkKey }, req, res));
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

const post = (headers: Record<string, string>) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

describe("hosted MCP server", () => {
  it("refuses requests without a valid key, and browser requests", async () => {
    expect((await post({})).status).toBe(401);
    expect((await post({ Authorization: "Bearer atlas_grok_notarealkeynotarealkey123" })).status).toBe(401);
    expect((await post({ Authorization: `Bearer ${keys.grok}`, Origin: "https://evil.example" })).status).toBe(403);
    expect((await post({ "X-API-Key": keys.grok })).status).toBe(200);
  });

  it("labels a flag with the AI whose key raised it", async () => {
    const gemini = await connect(keys.gemini);
    const r = await gemini.call("atlas_flag", {
      persona: "reviewer",
      note_id: "P1",
      quote: "kept the share at 41%",
      level: "uncertain",
      reason: "The award text gives 41% but a table rounds it differently.",
    });
    expect(r.text).toMatch(/^Flagged/);
    const [t] = await db.threads("notes", "P1");
    expect(t).toMatchObject({ kind: "flag", flag: { by: "reviewer" } });
    expect(t.comments[0].userId).toBe("gemini");
    expect((await gemini.call("atlas_list_flags", { persona: "reviewer", note_id: "P1" })).text).toContain(
      "by Gemini reviewer",
    );
    await gemini.client.close();
  });

  it("keeps a seat pinned to Gemini away from Grok, and records Gemini's turn", async () => {
    const grok = await connect(keys.grok);
    expect((await grok.call("atlas_my_turns", { persona: "devil" })).text).toContain("No open discussions");
    const r = await grok.call("atlas_post_turn", {
      persona: "devil",
      discussion_id: "d1",
      body: "A turn long enough to count as an argument here.",
      sources: [{ label: "PRS", url: "https://prsindia.org/" }],
    });
    expect(r.error).toBe(true);
    await grok.client.close();

    const gemini = await connect(keys.gemini);
    expect((await gemini.call("atlas_my_turns", { persona: "devil" })).text).toContain("YOUR TURN");
    await gemini.call("atlas_post_turn", {
      persona: "devil",
      discussion_id: "d1",
      body: "A turn long enough to count as an argument here.",
      sources: [{ label: "PRS", url: "https://prsindia.org/" }],
    });
    const d = (await db.allDiscussions())["notes:P1"][0];
    expect(d.turns[0]).toMatchObject({ by: "devil", ai: "gemini" });
    expect((await gemini.call("atlas_search", { query: "16th FC" })).text).toContain("notes/P1");
    await gemini.client.close();
  });

  it("stops accepting a key once it is revoked", async () => {
    const id = (await fs.collection("mcpKeys").where("ai", "==", "grok").get()).docs[0].id.slice(0, 8);
    expect(await revokeKey(fs, id)).toMatchObject({ ai: "grok" });
    expect((await post({ Authorization: `Bearer ${keys.grok}` })).status).toBe(401);
  });
});
