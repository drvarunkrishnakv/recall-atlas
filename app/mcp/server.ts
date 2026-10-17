// The Atlas MCP server's tools: how Grok Bot's bots (or any MCP client) take part in a
// note's discussions with Claude. A bot can read notes and discussions and post its own
// turns, only in its own seats, only when it's its turn. It cannot edit notes, comments or
// anything else. The transports are in atlas-mcp.ts.
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { blocksToMarkdown, type PageDoc } from "../src/lib/blocks.ts";
import { briefing, DiscussionOpError, nextUp, type Discussion } from "../src/lib/discussions.ts";
import { GROK_BOTS, grokBot, MODE_INFO, role, speaker } from "../src/lib/personas.ts";
import type { Backend } from "../server/backend.ts";
import type { Collection } from "../src/lib/cloud-docs.ts";

const INSTRUCTIONS = `Mains Atlas is a UPSC Mains revision app. Each note hosts discussions between
Claude and Grok bots: debates (two sides, three rounds), roundtables (Claude moderates; each
expert gives one dimension, then answers the others) and devil's-advocate rounds (a Grok bot
attacks a claim in the note, Claude defends it). You are one Grok bot; pass your bot id as
"persona" on every call. Start with atlas_my_turns, read each discussion where it's your turn
with atlas_get_discussion, then post with atlas_post_turn. Every argument needs at least one
real source (label and link). Bot ids: ${GROK_BOTS.map((b) => `${b.id} (${b.roles.map((r) => role(r)?.label).join(" or ")})`).join("; ")}.`;

const botId = z.string().describe(`Your Grok bot id: ${GROK_BOTS.map((b) => b.id).join(", ")}`);

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });
const guard =
  <A>(fn: (args: A) => string | Promise<string>) =>
  async (args: A) => {
    try {
      return text(await fn(args));
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  };

function checkBot(id: string) {
  if (!grokBot(id))
    throw new DiscussionOpError(`Unknown bot "${id}". Use one of: ${GROK_BOTS.map((b) => b.id).join(", ")}`);
}

async function readPage(db: Backend, collection: string, id: string): Promise<PageDoc | null> {
  const page = await db.page(collection as Collection, id);
  return page && Array.isArray(page.blocks) ? page : null;
}

async function allDiscussions(db: Backend): Promise<{ page: string; d: Discussion }[]> {
  return Object.entries(await db.allDiscussions()).flatMap(([page, list]) => list.map((d) => ({ page, d })));
}

async function locate(db: Backend, discussionId: string) {
  const hit = (await allDiscussions(db)).find((x) => x.d.id === discussionId);
  if (!hit) throw new DiscussionOpError(`No discussion ${discussionId}`);
  const [collection, id] = hit.page.split(":");
  return { collection: collection as Collection, id, d: hit.d };
}

/** A fresh server over `db` (the content folder or Firestore). */
export function buildServer(db: Backend): McpServer {
  const server = new McpServer({ name: "mains-atlas", version: "0.2.0" }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "atlas_my_turns",
    {
      title: "Discussions waiting for you",
      description: "List the open discussions where it's your bot's turn, then the others you have a seat in.",
      inputSchema: { persona: botId },
    },
    guard(async ({ persona: me }: { persona: string }) => {
      checkBot(me);
      const mine = (await allDiscussions(db)).filter(
        ({ d }) => d.status === "open" && d.seats.some((s) => s.by === me),
      );
      if (!mine.length) return "No open discussions have a seat for you.";
      const rows = mine.map(({ page, d }) => {
        const up = nextUp(d);
        const state = !up
          ? "concluded"
          : up.seat.by === me
            ? `YOUR TURN as ${role(up.seat.role)?.label}`
            : `waiting for ${speaker(up.seat)}`;
        return {
          yours: up?.seat.by === me,
          line: `- ${d.id} · ${MODE_INFO[d.mode].title} on ${page.replace(":", "/")} · ${state} · "${d.topic}"`,
        };
      });
      rows.sort((a, b) => Number(b.yours) - Number(a.yours));
      return rows.map((r) => r.line).join("\n");
    }),
  );

  server.registerTool(
    "atlas_get_discussion",
    {
      title: "Read a discussion",
      description:
        "Read one discussion: the topic, who sits where, every turn so far with its sources, the section of the note it is about, and, if it is your turn, exactly what to write.",
      inputSchema: { persona: botId, discussion_id: z.string() },
    },
    guard(async ({ persona: me, discussion_id }: { persona: string; discussion_id: string }) => {
      checkBot(me);
      const { collection, id, d } = await locate(db, discussion_id);
      return briefing(d, await readPage(db, collection, id), `${collection}/${id}`, me);
    }),
  );

  server.registerTool(
    "atlas_post_turn",
    {
      title: "Post your turn",
      description:
        "Post your turn in a discussion. Only works when it is your bot's turn. Give the text and at least one source (short label and http(s) link) for the facts you use. Don't put source names inside sentences.",
      inputSchema: {
        persona: botId,
        discussion_id: z.string(),
        body: z.string().describe("Your turn, in plain prose. Keep to the word limit in the task."),
        sources: z
          .array(z.object({ label: z.string().describe('Short, e.g. "PRS", "SC judgment"'), url: z.string() }))
          .describe("The sources for the facts in your turn"),
      },
    },
    guard(
      async ({
        persona: me,
        discussion_id,
        body,
        sources,
      }: {
        persona: string;
        discussion_id: string;
        body: string;
        sources: { label: string; url: string }[];
      }) => {
        checkBot(me);
        const { collection, id } = await locate(db, discussion_id);
        const list = await db.changeDiscussions(collection, id, {
          op: "turn",
          discussionId: discussion_id,
          turn: { id: randomUUID().slice(0, 12), by: me, body, sources },
        });
        const up = nextUp(list.find((x) => x.id === discussion_id)!);
        return `Posted. Next: ${up ? `${speaker(up.seat)}${up.kind === "conclusion" ? " (conclusion)" : ""}` : "nobody"}.`;
      },
    ),
  );

  server.registerTool(
    "atlas_read_note",
    {
      title: "Read a note",
      description: "Read a whole note as Markdown, for context beyond the section a discussion is about.",
      inputSchema: { note_id: z.string().describe("e.g. P06") },
    },
    guard(async ({ note_id }: { note_id: string }) => {
      if (!/^[A-Za-z0-9-]{1,80}$/.test(note_id)) throw new DiscussionOpError("Bad note id");
      const page = await readPage(db, "notes", note_id);
      if (!page) throw new DiscussionOpError(`No note ${note_id}`);
      return `# ${page.title}\n\n${blocksToMarkdown(page.blocks)}`.slice(0, 60_000);
    }),
  );

  server.registerTool(
    "atlas_list_notes",
    { title: "List notes", description: "List the notes in the Atlas, with how many discussions are open on each." },
    guard(async () => {
      const open = (await allDiscussions(db)).filter(({ d }) => d.status === "open");
      const rows = (await db.pages("notes")).map((p) => {
        const n = open.filter(({ page }) => page === `notes:${p.id}`).length;
        return `- ${p.id}: ${p.title}${n ? ` · ${n} open discussion${n > 1 ? "s" : ""}` : ""}`;
      });
      return rows.join("\n") || "No notes yet.";
    }),
  );

  return server;
}
