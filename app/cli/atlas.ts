// atlas — the command-line tool Claude uses on the notes, without the app open.
// With ATLAS_CONTENT_DIR set it works on that content folder (the dev save API's files);
// otherwise on Firestore, through the Admin SDK (server/firestore-backend.ts).
//
//   node cli/atlas.ts pages                         list notes and cards
//   node cli/atlas.ts show notes/P06 [--ids]        a page as Markdown (--ids: block ids as comments)
//   node cli/atlas.ts comments [--waiting] [--all]  open threads (--waiting: Ask Claude without a reply)
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
//   node cli/atlas.ts import <content-dir> [--force]  copy a content folder into Firestore (once, at the switch)
//   node cli/atlas.ts export <content-dir>           write Firestore out as files: the notes repo's mirror
//   node cli/atlas.ts owner [uid|email] [--remove]   list accounts, or mark the one that may open the app
//
// Claude never resolves your threads and only edits facts you approved or asked for.
import { existsSync, readFileSync } from "node:fs";
import {
  blocksToMarkdown,
  citeLinks,
  pageCites,
  type Block,
  type InlineItem,
  type PageDoc,
} from "../src/lib/blocks.ts";
import type { Collection } from "../src/lib/cloud-docs.ts";
import { waitingForClaude, type StoredThread } from "../src/lib/threads.ts";
import { briefing, nextUp, progress } from "../src/lib/discussions.ts";
import { MODE_INFO, speaker, type Mode, type Seat } from "../src/lib/personas.ts";
import { fileBackend, snapshot, type Backend } from "../server/backend.ts";
import { nextDue } from "../src/lib/progress.ts";

const dir = process.env.ATLAS_CONTENT_DIR;
const [cmd, ...args] = process.argv.slice(2);

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function cloud(): Promise<Backend> {
  const { firestoreBackend } = await import("../server/firestore-backend.ts");
  try {
    return firestoreBackend();
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

// import, export and owner always work on Firestore; the rest on ATLAS_CONTENT_DIR when it's set.
const CLOUD_ONLY = ["import", "export", "owner"];
if (dir && !existsSync(dir)) fail(`ATLAS_CONTENT_DIR ${dir} doesn't exist.`);
const db: Backend = dir && !CLOUD_ONLY.includes(cmd ?? "") ? fileBackend(dir) : await cloud();

function parseRef(ref: string | undefined): { collection: Collection; id: string } {
  const m = /^(notes|cards)\/([A-Za-z0-9-]+)$/.exec(ref ?? "");
  if (!m) fail(`Expected notes/<id> or cards/<id>, got "${ref ?? ""}"`);
  return { collection: m[1] as Collection, id: m[2] };
}

async function readPage(collection: Collection, id: string): Promise<PageDoc> {
  const page = await db.page(collection, id);
  if (!page) fail(`No page ${collection}/${id}.`);
  if (!Array.isArray(page.blocks))
    fail(`${collection}/${id} is still Markdown; open it once in the app to convert it.`);
  return page;
}

const sortedKeys = <T>(map: Record<string, T>) =>
  Object.keys(map).sort((a, b) =>
    a.startsWith("notes") === b.startsWith("notes") ? a.localeCompare(b) : a.startsWith("notes") ? -1 : 1,
  );

function showThread(ref: string, t: StoredThread) {
  const state = t.resolved ? "resolved" : t.detached ? "detached" : "open";
  console.log(`\n## ${ref} · thread ${t.id} · ${t.kind} · ${state}`);
  console.log(`> ${t.anchor.quote.replace(/\n/g, " ")}   (block ${t.anchor.blockId})`);
  for (const c of t.comments) console.log(`- ${c.userId === "claude" ? "Claude" : "User"} (${c.createdAt}): ${c.body}`);
}

switch (cmd) {
  case "pages":
    for (const c of ["notes", "cards"] as const)
      for (const p of await db.pages(c))
        console.log(
          `${c}/${p.id}\tv${p.version}\t${p.updated || "-"}\t${p.title}${p.blocks ? "" : "\t(Markdown, not converted yet)"}`,
        );
    break;

  case "show": {
    const { collection, id } = parseRef(args[0]);
    const page = await readPage(collection, id);
    console.log(`# ${page.title}  (${collection}/${id}, v${page.version}, updated ${page.updated})\n`);
    if (args.includes("--ids"))
      for (const b of page.blocks) console.log(`<!-- block ${b.id} -->\n${blocksToMarkdown([b]).trim()}\n`);
    else console.log(blocksToMarkdown(page.blocks));
    break;
  }

  case "comments": {
    let any = false;
    const threads = await db.allThreads();
    for (const key of sortedKeys(threads)) {
      const all = threads[key];
      const list = args.includes("--waiting")
        ? waitingForClaude(all)
        : args.includes("--all")
          ? all
          : all.filter((t) => !t.resolved);
      for (const t of list) {
        showThread(key.replace(":", "/"), t);
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
    const threads = await db.changeThreads(collection, id, {
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
    const page = await readPage(collection, id);
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
    const r = await db.savePage(collection, id, page, page.version);
    if (r.conflict) fail("The page changed while editing; try again.");
    console.log(`Saved ${collection}/${id} as v${r.version}.`);
    break;
  }

  case "captures": {
    const list = (await db.captures()).filter((c) => args.includes("--all") || c.status === "open");
    if (!list.length) console.log("No captures.");
    for (const c of list)
      console.log(`- ${c.id} · ${c.createdAt.slice(0, 16)} · ${c.status}${c.note ? ` → ${c.note}` : ""}\n  ${c.text}`);
    break;
  }

  case "file-capture": {
    const [id, reply, note] = args;
    if (!id || !reply?.trim()) fail('Usage: file-capture <id> "what was done" [P10]');
    if (note && !/^[A-Za-z0-9-]+$/.test(note)) fail("The note id looks wrong.");
    await db.changeCaptures({ op: "done", id, reply, note });
    console.log(`Filed ${id}.`);
    break;
  }

  case "progress": {
    const { notes } = await db.progress();
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
    const page = await readPage(collection, id);
    const before = pageCites(page.blocks).length;
    const blocks = citeLinks(page.blocks);
    const after = pageCites(blocks).length;
    if (after === before) {
      console.log(`${collection}/${id}: no inline source links to move.`);
      break;
    }
    const r = await db.savePage(collection, id, { ...page, blocks }, page.version);
    if (r.conflict) fail("The page changed while editing; try again.");
    console.log(`${collection}/${id}: ${after - before} sources moved into markers; saved as v${r.version}.`);
    break;
  }

  case "discussions": {
    let any = false;
    for (const [page, list] of Object.entries(await db.allDiscussions()))
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
    for (const [page, list] of Object.entries(await db.allDiscussions()))
      for (const d of list) {
        if (nextUp(d)?.seat.by !== "claude") continue;
        const [collection, id] = page.split(":");
        const p = await db.page(collection as Collection, id);
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
    const hit = Object.entries(await db.allDiscussions()).find(([, list]) => list.some((d) => d.id === did));
    if (!hit) fail(`No discussion ${did}`);
    const [collection, id] = hit[0].split(":");
    const list = await db.changeDiscussions(
      collection as Collection,
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
      await db.changeDiscussions(collection, id, {
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

  case "import": {
    const from = args[0];
    if (!from || !existsSync(from)) fail("Usage: import <content-dir> [--force]");
    const existing = [...(await db.pages("notes")), ...(await db.pages("cards"))].length;
    if (existing && !args.includes("--force"))
      fail(`Firestore already has ${existing} pages. Use --force to overwrite them with ${from}.`);
    const data = await snapshot(fileBackend(from));
    await db.restore(data);
    console.log(
      `Imported ${data.pages.length} pages, ${Object.values(data.threads).flat().length} threads, ` +
        `${Object.values(data.discussions).flat().length} discussions, progress and ${data.captures.length} captures.`,
    );
    break;
  }

  case "export": {
    const to = args[0];
    if (!to) fail("Usage: export <content-dir>");
    const data = await snapshot(db);
    await fileBackend(to).restore(data);
    console.log(`Exported ${data.pages.length} pages with their Markdown copies, threads and discussions to ${to}.`);
    break;
  }

  case "owner": {
    const { getAuth } = await import("firebase-admin/auth");
    const { adminApp } = await import("../server/firestore-backend.ts");
    const auth = getAuth(adminApp());
    const target = args.find((a) => !a.startsWith("--"));
    if (!target) {
      const { users } = await auth.listUsers(100);
      if (!users.length) console.log("No accounts yet. Sign in to the app once, then run this again.");
      for (const u of users) console.log(`${u.uid}\t${u.email ?? "-"}\t${u.customClaims?.atlasOwner ? "owner" : ""}`);
      break;
    }
    const user = target.includes("@") ? await auth.getUserByEmail(target) : await auth.getUser(target);
    const remove = args.includes("--remove");
    await auth.setCustomUserClaims(user.uid, { ...user.customClaims, atlasOwner: remove ? undefined : true });
    console.log(
      remove
        ? `${user.email ?? user.uid} can no longer open the app.`
        : `${user.email ?? user.uid} can now open the app. Press "Try again" on the sign-in screen.`,
    );
    break;
  }

  default:
    fail(
      "Commands: pages | show <ref> [--ids] | comments [--waiting|--all] | reply <ref> <thread> <text> | replace <ref> <old> <new> | captures [--all] | file-capture <id> <text> [note] | progress | cite-sources <ref> | discussions [--all] | turns | post <id> <text> | conclude <id> <text> | discuss-import <ref> <file> | import <dir> | export <dir> | owner [uid|email]",
    );
}
