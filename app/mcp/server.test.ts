import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { writeFileSync } from "node:fs";
import { changeDiscussions, loadDiscussions, loadThreads } from "../server/content-api.ts";
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
  writeFileSync(
    join(dir, "notes", "P99.json"),
    JSON.stringify({
      id: "P99",
      title: "Test note",
      version: 1,
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          content: [{ type: "text", text: "The 16th FC kept the share at 41% for 2026–31." }],
        },
        { id: "b2", type: "paragraph", content: [{ type: "text", text: "Cesses grew. Cesses grew." }] },
      ],
    }),
  );
  const [a, b] = InMemoryTransport.createLinkedPair();
  await buildServer(fileBackend(dir)).connect(a);
  await client.connect(b);
}, 60_000);

describe("Atlas MCP server", () => {
  it("offers only reading and turn-taking tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "atlas_flag",
      "atlas_get_discussion",
      "atlas_list_flags",
      "atlas_list_notes",
      "atlas_my_turns",
      "atlas_post_turn",
      "atlas_read_card",
      "atlas_read_note",
      "atlas_search",
    ]);
  });

  it("tells a bot when it's its turn, and what to write", async () => {
    expect((await call("atlas_my_turns", { persona: "devil" })).text).toContain("YOUR TURN as Devil's advocate");
    const d = await call("atlas_get_discussion", { persona: "devil", discussion_id: "d1" });
    expect(d.text).toContain("## YOUR TURN (AI · Devil's advocate)");
    expect(d.text).toContain("Attack the claim");
  });

  it("refuses unknown bots, out-of-turn posts, Claude's seats and turns without a source", async () => {
    expect((await call("atlas_my_turns", { persona: "tracker-pro" })).error).toBe(true);
    expect((await call("atlas_post_turn", { persona: "claude", discussion_id: "d1", body, sources: src })).error).toBe(
      true,
    );
    expect(
      (await call("atlas_post_turn", { persona: "economist", discussion_id: "d1", body, sources: src })).text,
    ).toMatch(/AI · Devil's advocate's turn/);
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

  it("flags an exact quote as a thread anchored to its block, for Claude to check", async () => {
    const r = await call("atlas_flag", {
      persona: "reviewer",
      note_id: "P99",
      quote: "kept the share at 41%",
      level: "uncertain",
      reason: "The award text gives 41% but the chapter table rounds differently.",
    });
    expect(r.text).toMatch(/^Flagged \(uncertain\)/);
    const [t] = loadThreads(dir, "notes", "P99");
    expect(t).toMatchObject({
      kind: "flag",
      anchor: { blockId: "b1", quote: "kept the share at 41%" },
      flag: { by: "reviewer" },
    });
    expect(t.comments[0]).toMatchObject({ userId: "grok" });
    expect((await call("atlas_list_flags", { persona: "reviewer", note_id: "P99" })).text).toContain("not checked yet");
  });

  it("refuses quotes that are missing, repeated or already flagged, and wrong flags without a source", async () => {
    const flag = (quote: string, level = "uncertain", sources?: unknown[]) =>
      call("atlas_flag", {
        persona: "reviewer",
        note_id: "P99",
        quote,
        level,
        reason: "A reason that is long enough.",
        sources,
      });
    expect((await flag("not in the note at all")).text).toMatch(/isn't in the note/);
    expect((await flag("Cesses grew.")).text).toMatch(/appears 2 times/);
    expect((await flag("kept the share at 41%")).text).toMatch(/already flagged/);
    expect((await flag("for 2026–31", "wrong")).text).toMatch(/needs at least one source/);
    expect((await flag("for 2026–31", "wrong", [{ label: "x", url: "ftp://x" }])).text).toMatch(/Bad source/);
  });
});
