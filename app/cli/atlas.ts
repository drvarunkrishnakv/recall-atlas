// atlas — the command-line tool Claude uses on the notes, without the app open.
// Reads and writes the same files as the dev save API (ATLAS_CONTENT_DIR).
//
//   node cli/atlas.ts pages                         list notes and cards
//   node cli/atlas.ts show notes/P06 [--ids]        a page as Markdown (--ids: block ids as comments)
//   node cli/atlas.ts comments [--waiting] [--all]  open threads (--waiting: Ask Claude without a reply,
//                                                    and Grok's flags Claude hasn't checked)
//   node cli/atlas.ts reply notes/P06 <thread> "…"  reply in a thread as Claude
//   node cli/atlas.ts replace notes/P06 "old" "new" change one exact phrase (must match once)
//   node cli/atlas.ts captures [--all]              your scratch-pad captures (open ones by default)
//   node cli/atlas.ts file-capture <id> "…" [P10]   mark a capture done, saying what Claude did
//   node cli/atlas.ts progress                      read / revised / confidence / next due per note
//   node cli/atlas.ts cite-sources cards/<id>       move "(Source)" links out of sentences into citation markers
//   node cli/atlas.ts discussions [--all]           debates, roundtables, devil's advocate, with progress
//   node cli/atlas.ts turns                         every discussion turn (or conclusion) that is Claude's now
//   node cli/atlas.ts post <discussion> "…" [--source "Label|url"]…      take Claude's turn
//   node cli/atlas.ts conclude <discussion> "…" [--source "Label|url"]…  write the conclusion
//   node cli/atlas.ts discuss-import notes/P06 <file.json>   add Claude's prepared questions
//
// Claude never resolves your threads and only edits facts you approved or asked for.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  blocksToMarkdown,
  citeLinks,
  pageCites,
  type Block,
  type InlineItem,
  type PageDoc,
} from "../src/lib/blocks.ts";
import { waitingForClaude, type StoredThread } from "../src/lib/threads.ts";
import { briefing, nextUp, progress } from "../src/lib/discussions.ts";
import { MODE_INFO, speaker, type Mode, type Seat } from "../src/lib/personas.ts";
import {
  changeCaptures,
  changeDiscussions,
  changeThreads,
  loadAllDiscussions,
  loadCaptures,
  loadProgress,
  loadThreads,
  savePage,
} from "../server/content-api.ts";
import { nextDue } from "../src/lib/progress.ts";

const dir = process.env.ATLAS_CONTENT_DIR;
const [cmd, ...args] = process.argv.slice(2);

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}
if (!dir || !existsSync(dir)) fail("Set ATLAS_CONTENT_DIR to the notes repo's content/ folder.");

function parseRef(ref: string | undefined): { collection: "notes" | "cards"; id: string } {
  const m = /^(notes|cards)\/([A-Za-z0-9-]+)$/.exec(ref ?? "");
  if (!m) fail(`Expected notes/<id> or cards/<id>, got "${ref ?? ""}"`);
  return { collection: m[1] as "notes" | "cards", id: m[2] };
}

function readPage(collection: string, id: string): PageDoc {
  const path = join(dir!, collection, `${id}.json`);
  if (!existsSync(path)) fail(`${collection}/${id} has no JSON yet; open it once in the app to convert it.`);
  return { ...(JSON.parse(readFileSync(path, "utf8")) as PageDoc), collection: collection as PageDoc["collection"] };
}

function pageIds(collection: string): string[] {
  const folder = join(dir!, collection);
  return existsSync(folder)
    ? readdirSync(folder)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -5))
        .sort()
    : [];
}

function showThread(ref: string, t: StoredThread) {
  const state = t.resolved ? "resolved" : t.detached ? "detached" : "open";
  console.log(
    `\n## ${ref} · thread ${t.id} · ${t.kind}${t.flag ? ` (${t.flag.level}, by ${t.flag.by})` : ""} · ${state}`,
  );
  console.log(`> ${t.anchor.quote.replace(/\n/g, " ")}   (block ${t.anchor.blockId})`);
  for (const c of t.comments)
    console.log(
      `- ${c.userId === "claude" ? "Claude" : c.userId === "grok" ? "Grok" : "User"} (${c.createdAt}): ${c.body}`,
    );
  if (t.flag?.sources.length) console.log(`  sources: ${t.flag.sources.map((s) => `${s.label} ${s.url}`).join(" · ")}`);
}

switch (cmd) {
  case "pages":
    for (const c of ["notes", "cards"])
      for (const id of pageIds(c)) {
        const p = readPage(c, id);
        console.log(`${c}/${id}\tv${p.version}\t${p.updated}\t${p.title}`);
      }
    break;

  case "show": {
    const { collection, id } = parseRef(args[0]);
    const page = readPage(collection, id);
    console.log(`# ${page.title}  (${collection}/${id}, v${page.version}, updated ${page.updated})\n`);
    if (args.includes("--ids"))
      for (const b of page.blocks) console.log(`<!-- block ${b.id} -->\n${blocksToMarkdown([b]).trim()}\n`);
    else console.log(blocksToMarkdown(page.blocks));
    break;
  }

  case "comments": {
    let any = false;
    for (const c of ["notes", "cards"])
      for (const id of pageIds(c)) {
        const all = loadThreads(dir!, c, id);
        const list = args.includes("--waiting")
          ? waitingForClaude(all)
          : args.includes("--all")
            ? all
            : all.filter((t) => !t.resolved);
        for (const t of list) {
          showThread(`${c}/${id}`, t);
          any = true;
        }
      }
    if (!any) console.log("No threads.");
    break;
  }

  case "reply": {
    const { collection, id } = parseRef(args[0]);
    const [threadId, text] = args.slice(1);
    if (!threadId || !text?.trim()) fail('Usage: reply notes/P06 <thread-id> "text"');
    const threads = changeThreads(dir!, collection, id, {
      op: "reply",
      threadId,
      comment: { id: crypto.randomUUID().slice(0, 12), body: text },
      by: "claude",
    });
    showThread(
      `${collection}/${id}`,
      threads.find((t) => t.id === threadId)!,
    );
    break;
  }

  case "replace": {
    const { collection, id } = parseRef(args[0]);
    const [find, replacement] = args.slice(1);
    if (!find || replacement === undefined) fail('Usage: replace notes/P06 "exact old text" "new text"');
    const page = readPage(collection, id);
    // Only plain text runs are searched, so links, terms and formatting stay intact.
    const hits: InlineItem[] = [];
    const visit = (items: unknown) => {
      if (!Array.isArray(items)) return;
      for (const i of items as InlineItem[]) {
        if (i.type === "text" && i.text?.includes(find)) hits.push(i);
        visit(i.content);
      }
    };
    const walk = (blocks: Block[]) =>
      blocks.forEach((b) => {
        const content = b.content as unknown;
        if (content && typeof content === "object" && !Array.isArray(content))
          (content as { rows: { cells: unknown[] }[] }).rows.forEach((r) =>
            r.cells.forEach((cell) => visit(Array.isArray(cell) ? cell : (cell as { content: unknown }).content)),
          );
        else visit(content);
        if (b.children) walk(b.children);
      });
    walk(page.blocks);
    const count = hits.reduce((n, i) => n + i.text!.split(find).length - 1, 0);
    if (count !== 1) fail(`"${find}" matches ${count} times in one text run; it must match exactly once.`);
    hits[0].text = hits[0].text!.replace(find, replacement);
    const r = savePage(dir!, collection, id, page, page.version);
    if (r.conflict) fail("The page changed while editing; try again.");
    console.log(`Saved ${collection}/${id} as v${r.version}.`);
    break;
  }

  case "captures": {
    const list = loadCaptures(dir!).filter((c) => args.includes("--all") || c.status === "open");
    if (!list.length) console.log("No captures.");
    for (const c of list)
      console.log(`- ${c.id} · ${c.createdAt.slice(0, 16)} · ${c.status}${c.note ? ` → ${c.note}` : ""}\n  ${c.text}`);
    break;
  }

  case "file-capture": {
    const [id, reply, note] = args;
    if (!id || !reply?.trim()) fail('Usage: file-capture <id> "what was done" [P10]');
    if (note && !/^[A-Za-z0-9-]+$/.test(note)) fail("The note id looks wrong.");
    changeCaptures(dir!, { op: "done", id, reply, note });
    console.log(`Filed ${id}.`);
    break;
  }

  case "progress": {
    const { notes } = loadProgress(dir!);
    const ids = Object.keys(notes).sort();
    if (!ids.length) console.log("No progress yet.");
    for (const id of ids) {
      const n = notes[id];
      console.log(
        `${id}\tread ${n.readAt ?? "-"}\trevised ${n.revisions.length}×\t${n.confidence ?? "unrated"}\tdue ${nextDue(n) ?? "-"}`,
      );
    }
    break;
  }

  case "cite-sources": {
    const { collection, id } = parseRef(args[0]);
    const page = readPage(collection, id);
    const before = pageCites(page.blocks).length;
    const blocks = citeLinks(page.blocks);
    const after = pageCites(blocks).length;
    if (after === before) {
      console.log(`${collection}/${id}: no inline source links to move.`);
      break;
    }
    const r = savePage(dir!, collection, id, { ...page, blocks }, page.version);
    if (r.conflict) fail("The page changed while editing; try again.");
    console.log(`${collection}/${id}: ${after - before} sources moved into markers; saved as v${r.version}.`);
    break;
  }

  case "discussions": {
    let any = false;
    for (const [page, list] of Object.entries(loadAllDiscussions(dir!)))
      for (const d of list) {
        if (d.status !== "open" && !args.includes("--all")) continue;
        any = true;
        const up = nextUp(d);
        const { done, total } = progress(d);
        console.log(
          `${page.replace(":", "/")}\t${d.id}\t${MODE_INFO[d.mode].title}\t${done}/${total}\t` +
            `${up ? `next: ${speaker(up.seat)}${up.kind === "conclusion" ? " (conclusion)" : ""}` : d.status}\t${d.topic}`,
        );
      }
    if (!any) console.log("No open discussions.");
    break;
  }

  case "turns": {
    let n = 0;
    for (const [page, list] of Object.entries(loadAllDiscussions(dir!)))
      for (const d of list) {
        if (nextUp(d)?.seat.by !== "claude") continue;
        const [collection, id] = page.split(":");
        const path = join(dir!, collection, `${id}.json`);
        const p = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as PageDoc) : null;
        console.log(`\n${"=".repeat(80)}\n${briefing(d, p, `${collection}/${id}`, "claude")}`);
        n++;
      }
    console.log(n ? `\n${n} turn${n > 1 ? "s" : ""} for Claude.` : "No turns for Claude.");
    break;
  }

  case "post":
  case "conclude": {
    const [did, body, ...rest] = args;
    if (!did || !body?.trim()) fail(`Usage: ${cmd} <discussion-id> "text" [--source "Label|url"]…`);
    const sources: { label: string; url: string }[] = [];
    for (let i = 0; i < rest.length; i++)
      if (rest[i] === "--source") {
        const [label, url] = (rest[++i] ?? "").split("|");
        sources.push({ label: label?.trim() ?? "", url: url?.trim() ?? "" });
      }
    const hit = Object.entries(loadAllDiscussions(dir!)).find(([, list]) => list.some((d) => d.id === did));
    if (!hit) fail(`No discussion ${did}`);
    const [collection, id] = hit[0].split(":");
    const list = changeDiscussions(
      dir!,
      collection,
      id,
      cmd === "post"
        ? { op: "turn", discussionId: did, turn: { id: crypto.randomUUID().slice(0, 12), by: "claude", body, sources } }
        : { op: "conclude", discussionId: did, body, sources },
    );
    const up = nextUp(list.find((d) => d.id === did)!);
    console.log(`${cmd === "post" ? "Posted" : "Concluded"} ${did}. Next: ${up ? speaker(up.seat) : "nobody"}.`);
    break;
  }

  case "discuss-import": {
    const { collection, id } = parseRef(args[0]);
    if (!args[1] || !existsSync(args[1])) fail("Usage: discuss-import notes/P06 <file.json>");
    const items = JSON.parse(readFileSync(args[1], "utf8")) as {
      mode: Mode;
      topic: string;
      why?: string;
      anchor?: { blockId: string; quote: string } | null;
      section?: string;
      seats: Seat[];
    }[];
    for (const it of items) {
      const did = crypto.randomUUID().slice(0, 12);
      changeDiscussions(dir!, collection, id, {
        op: "create",
        discussion: {
          id: did,
          mode: it.mode,
          topic: it.topic,
          why: it.why,
          anchor: it.anchor ?? null,
          section: it.section,
          seats: it.seats,
        },
      });
      console.log(`${did}\t${MODE_INFO[it.mode].title}\t${it.topic}`);
    }
    break;
  }

  default:
    fail(
      "Commands: pages | show <ref> [--ids] | comments [--waiting|--all] | reply <ref> <thread> <text> | replace <ref> <old> <new> | captures [--all] | file-capture <id> <text> [note] | progress | cite-sources <ref> | discussions [--all] | turns | post <id> <text> | conclude <id> <text> | discuss-import <ref> <file>",
    );
}
