// atlas — the command-line tool Claude uses on the notes, without the app open.
// Reads and writes the same files as the dev save API (ATLAS_CONTENT_DIR).
//
//   node cli/atlas.ts pages                         list notes and cards
//   node cli/atlas.ts show notes/P06 [--ids]        a page as Markdown (--ids: block ids as comments)
//   node cli/atlas.ts comments [--waiting] [--all]  open threads (--waiting: Ask Claude without a reply)
//   node cli/atlas.ts reply notes/P06 <thread> "…"  reply in a thread as Claude
//   node cli/atlas.ts replace notes/P06 "old" "new" change one exact phrase (must match once)
//   node cli/atlas.ts captures [--all]              your scratch-pad captures (open ones by default)
//   node cli/atlas.ts file-capture <id> "…" [P10]   mark a capture done, saying what Claude did
//   node cli/atlas.ts progress                      read / revised / confidence / next due per note
//
// Claude never resolves your threads and only edits facts you approved or asked for.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { blocksToMarkdown, type Block, type InlineItem, type PageDoc } from "../src/lib/blocks.ts";
import { waitingForClaude, type StoredThread } from "../src/lib/threads.ts";
import {
  changeCaptures,
  changeThreads,
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
  console.log(`\n## ${ref} · thread ${t.id} · ${t.kind} · ${state}`);
  console.log(`> ${t.anchor.quote.replace(/\n/g, " ")}   (block ${t.anchor.blockId})`);
  for (const c of t.comments) console.log(`- ${c.userId === "claude" ? "Claude" : "User"} (${c.createdAt}): ${c.body}`);
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

  default:
    fail(
      "Commands: pages | show <ref> [--ids] | comments [--waiting|--all] | reply <ref> <thread> <text> | replace <ref> <old> <new> | captures [--all] | file-capture <id> <text> [note] | progress",
    );
}
