import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { changeDiscussions, loadDiscussions } from "../server/content-api.ts";
import { DEFAULT_SEATS } from "../src/lib/personas.ts";
import { fileBackend } from "../server/backend.ts";
import { buildServer } from "./server.ts";

const dir = mkdtempSync(join(tmpdir(), "atlas-mcp-"));
cpSync(join(import.meta.dirname, "../fixtures/content"), dir, { recursive: true });
const client = new Client({ name: "test", version: "1" });
const src = [{ label: "PRS", url: "https://prsindia.org/" }];
const body = "A turn long enough to count as a real argument.";

const call = async (name: string, args: Record<string, unknown>) => {
  const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  return { error: !!r.isError, text: r.content.map((c) => c.text).join("\n") };
};

beforeAll(async () => {
  changeDiscussions(dir, "notes", "P06", {
    op: "create",
    discussion: {
      id: "d1",
      mode: "devil",
      topic: "Census 2027 is the next step",
      anchor: null,
      seats: DEFAULT_SEATS.devil,
    },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await buildServer(fileBackend(dir)).connect(a);
  await client.connect(b);
}, 60_000);

describe("Atlas MCP server", () => {
  it("offers only reading and turn-taking tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "atlas_get_discussion",
      "atlas_list_notes",
      "atlas_my_turns",
      "atlas_post_turn",
      "atlas_read_note",
    ]);
  });

  it("tells a bot when it's its turn, and what to write", async () => {
    expect((await call("atlas_my_turns", { persona: "devil" })).text).toContain("YOUR TURN as Devil's advocate");
    const d = await call("atlas_get_discussion", { persona: "devil", discussion_id: "d1" });
    expect(d.text).toContain("## YOUR TURN (Grok · Devil's advocate)");
    expect(d.text).toContain("Attack the claim");
  });

  it("refuses unknown bots, out-of-turn posts, Claude's seats and turns without a source", async () => {
    expect((await call("atlas_my_turns", { persona: "tracker-pro" })).error).toBe(true);
    expect((await call("atlas_post_turn", { persona: "claude", discussion_id: "d1", body, sources: src })).error).toBe(
      true,
    );
    expect(
      (await call("atlas_post_turn", { persona: "economist", discussion_id: "d1", body, sources: src })).text,
    ).toMatch(/Grok · Devil's advocate's turn/);
    expect((await call("atlas_post_turn", { persona: "devil", discussion_id: "d1", body, sources: [] })).error).toBe(
      true,
    );
  });

  it("posts a turn, and then it's Claude's turn to defend", async () => {
    const r = await call("atlas_post_turn", { persona: "devil", discussion_id: "d1", body, sources: src });
    expect(r.text).toBe("Posted. Next: Claude · Defends the note.");
    const [d] = loadDiscussions(dir, "notes", "P06");
    expect(d.turns[0]).toMatchObject({ role: "devil", by: "devil", round: 1, sources: src });
    expect((await call("atlas_post_turn", { persona: "devil", discussion_id: "d1", body, sources: src })).error).toBe(
      true,
    );
  });
});
