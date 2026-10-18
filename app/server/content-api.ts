// Local save API for the Vite dev server. Notes, cards and comment threads are files in a
// content folder: ATLAS_CONTENT_DIR (the private notes repo's content/), or, without it, a
// git-ignored working copy of the synthetic fixture. The cloud build answers the same
// routes from Firestore instead (src/content/cloud.ts); the CLI reaches both through server/backend.ts.
//
//   GET  /api/content                         all pages (block JSON, or Markdown not yet converted)
//   GET  /api/pages/:collection/:id           one page (to pick up edits made by Claude's CLI)
//   PUT  /api/pages/:collection/:id           save a page; refuses a stale baseVersion (409)
//   GET  /api/comments/:collection/:id        the page's threads
//   POST /api/comments/:collection/:id        apply one ThreadOp, return the threads
//   GET  /api/comments                        every page's threads (inbox, subject table)
//   GET|POST /api/progress, /api/captures     revision state and quick captures (one op per POST)
//   GET  /api/discussions/:collection/:id     the page's debates, roundtables and devil's-advocate rounds
//   POST /api/discussions/:collection/:id     apply one DiscussionOp, return the discussions
//   GET  /api/discussions                     every page's discussions
//   GET  /api/proposals                       every page's proposed changes
//   GET  /api/proposals/:collection/:id       the page's proposals
//   POST /api/proposals/:collection/:id       a ProposalOp, or {op: "approve", proposalId} (applies it, saves history)
//   GET  /api/history/:collection/:id[/:hid]  the page's past versions, or one of them
//   POST /api/history/:collection/:id         {historyId}: restore that version as a new one
//   GET  /api/heatmap                         the news heat map, {map} (null until one is imported)
//
// Writes are accepted only from this machine (unless ATLAS_ALLOW_LAN_WRITES=1) and only
// from the app's own origin.
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { Connect } from "vite";
import { parseFrontMatter } from "../src/lib/content-parse.ts";
import { PAGE_FIELDS, pageToMarkdown, type PageDoc } from "../src/lib/blocks.ts";
import { applyThreadOp, ThreadOpError, type StoredThread, type ThreadOp } from "../src/lib/threads.ts";
import { applyDiscussionOp, DiscussionOpError, type Discussion, type DiscussionOp } from "../src/lib/discussions.ts";
import { applyProposalOp, ProposalError, type Proposal, type ProposalOp } from "../src/lib/proposals.ts";
import { approveProposal, restoreVersion, type ProposalIO } from "../src/lib/approve.ts";
import { historyEntry, type HistoryEntry } from "../src/lib/cloud-docs.ts";
import {
  applyCaptureOp,
  applyProgressOp,
  ProgressOpError,
  type Capture,
  type CaptureOp,
  type Progress,
  type ProgressOp,
} from "../src/lib/progress.ts";
import type { HeatMap } from "../src/lib/heatmap.ts";

const COLLECTIONS = ["notes", "cards"] as const;
type Collection = (typeof COLLECTIONS)[number];
const ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,80}$/;
const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;

export function contentDir(appRoot: string): string {
  if (process.env.ATLAS_CONTENT_DIR) return process.env.ATLAS_CONTENT_DIR;
  const local = join(appRoot, ".atlas-local");
  if (!existsSync(local)) cpSync(join(appRoot, "fixtures/content"), local, { recursive: true });
  return local;
}

function writeAtomic(path: string, text: string) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

const readJson = <T>(path: string, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
};

/** Every page: converted ones as block JSON, the rest as Markdown for the app to convert once. */
export function loadAll(dir: string) {
  const out: Record<Collection, unknown[]> = { notes: [], cards: [] };
  for (const collection of COLLECTIONS) {
    const folder = join(dir, collection);
    if (!existsSync(folder)) continue;
    const files = readdirSync(folder);
    const ids = new Set(files.filter((f) => /\.(json|md)$/.test(f)).map((f) => f.replace(/\.(json|md)$/, "")));
    for (const id of [...ids].sort()) {
      if (files.includes(id + ".json")) {
        out[collection].push({ ...readJson<PageDoc>(join(folder, id + ".json"), {} as PageDoc), collection, id });
      } else {
        const { meta, body } = parseFrontMatter(readFileSync(join(folder, id + ".md"), "utf8"));
        out[collection].push({ ...meta, collection, id, version: 0, markdown: body });
      }
    }
  }
  return out;
}

export function savePage(
  dir: string,
  collection: Collection,
  id: string,
  page: PageDoc,
  baseVersion: number,
  /** Why it changed (approved proposal, restore): always keeps a labelled snapshot. */
  reason?: string,
) {
  const folder = join(dir, collection);
  mkdirSync(folder, { recursive: true });
  const jsonPath = join(folder, id + ".json");
  const mdPath = join(folder, id + ".md");
  const current = existsSync(jsonPath) ? readJson<PageDoc | null>(jsonPath, null) : null;
  const currentVersion = current?.version ?? 0;
  if (baseVersion !== currentVersion) return { conflict: true as const, version: currentVersion };

  const history = join(dir, "history", `${collection}-${id}`);
  if (!current && existsSync(mdPath)) {
    // First conversion from Markdown: keep the original file.
    mkdirSync(history, { recursive: true });
    if (!existsSync(join(history, "original.md"))) copyFileSync(mdPath, join(history, "original.md"));
  } else if (current) {
    // Keep a snapshot of the previous version at most every few minutes of editing.
    mkdirSync(history, { recursive: true });
    const snaps = readdirSync(history).filter((f) => f.endsWith(".json"));
    const last = snaps.map((f) => Number(f.split("-")[0])).sort((a, b) => b - a)[0] ?? 0;
    if (reason || Date.now() - last > SNAPSHOT_EVERY_MS)
      writeAtomic(
        join(history, `${Date.now()}-v${currentVersion}.json`),
        JSON.stringify({ ...current, ...(reason ? { historyReason: reason.slice(0, 300) } : {}) }, null, 1),
      );
  }

  const meta = Object.fromEntries(Object.entries(page).filter(([k]) => !["markdown", "collection"].includes(k)));
  const saved: PageDoc = {
    ...meta,
    collection,
    id,
    title: String(page.title ?? id),
    version: currentVersion + 1,
    updated: new Date().toLocaleDateString("en-CA"), // local YYYY-MM-DD
    blocks: Array.isArray(page.blocks) ? page.blocks : [],
  };
  writePageFiles(dir, saved);
  return { conflict: false as const, version: saved.version, updated: saved.updated };
}

/**
 * Writes a page as `<id>.json` plus its Markdown copy `<id>.md`, with no version check
 * (saves and `atlas export`). A page not yet converted to blocks is written back as its Markdown.
 */
export function writePageFiles(dir: string, page: PageDoc & { markdown?: string }) {
  const folder = join(dir, page.collection);
  mkdirSync(folder, { recursive: true });
  if (!Array.isArray(page.blocks) && typeof page.markdown === "string") {
    const skip = ["collection", "version", "markdown", "blocks"];
    const front = Object.entries(page).filter(([k, v]) => !skip.includes(k) && !(k === "updated" && !v));
    const head = front.length ? `---\n${front.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n")}\n---\n\n` : "";
    writeAtomic(join(folder, page.id + ".md"), head + page.markdown);
    return;
  }
  // Fixed key order keeps git diffs readable: identity first, blocks last.
  const ordered = Object.fromEntries([
    ...PAGE_FIELDS.filter((k) => k !== "blocks").map((k) => [k, page[k]]),
    ...Object.entries(page).filter(([k]) => !PAGE_FIELDS.includes(k) && k !== "markdown"),
    ["blocks", page.blocks],
  ]);
  delete (ordered as Record<string, unknown>).collection;
  writeAtomic(join(folder, page.id + ".json"), JSON.stringify(ordered, null, 1) + "\n");
  writeAtomic(join(folder, page.id + ".md"), pageToMarkdown(ordered as PageDoc));
}

const threadsPath = (dir: string, collection: string, id: string) => join(dir, "comments", `${collection}-${id}.json`);

export function loadThreads(dir: string, collection: string, id: string): StoredThread[] {
  return readJson<{ threads: StoredThread[] }>(threadsPath(dir, collection, id), { threads: [] }).threads;
}

export function changeThreads(dir: string, collection: string, id: string, op: ThreadOp): StoredThread[] {
  const next = applyThreadOp(loadThreads(dir, collection, id), op);
  mkdirSync(join(dir, "comments"), { recursive: true });
  writeAtomic(threadsPath(dir, collection, id), JSON.stringify({ threads: next }, null, 1) + "\n");
  return next;
}

/** Every page's threads, keyed `notes:P06`, for the inbox and the subject table. */
export function loadAllThreads(dir: string): Record<string, StoredThread[]> {
  const folder = join(dir, "comments");
  if (!existsSync(folder)) return {};
  const out: Record<string, StoredThread[]> = {};
  for (const f of readdirSync(folder).filter((f) => f.endsWith(".json"))) {
    const m = /^(notes|cards)-(.+)\.json$/.exec(f);
    if (m) out[`${m[1]}:${m[2]}`] = readJson<{ threads: StoredThread[] }>(join(folder, f), { threads: [] }).threads;
  }
  return out;
}

const discussionsPath = (dir: string, collection: string, id: string) =>
  join(dir, "discussions", `${collection}-${id}.json`);

export function loadDiscussions(dir: string, collection: string, id: string): Discussion[] {
  return readJson<{ discussions: Discussion[] }>(discussionsPath(dir, collection, id), { discussions: [] }).discussions;
}

export function changeDiscussions(dir: string, collection: string, id: string, op: DiscussionOp): Discussion[] {
  const next = applyDiscussionOp(loadDiscussions(dir, collection, id), op);
  mkdirSync(join(dir, "discussions"), { recursive: true });
  writeAtomic(discussionsPath(dir, collection, id), JSON.stringify({ discussions: next }, null, 1) + "\n");
  return next;
}

/** Every page's discussions, keyed `notes:P06`. */
export function loadAllDiscussions(dir: string): Record<string, Discussion[]> {
  const folder = join(dir, "discussions");
  if (!existsSync(folder)) return {};
  const out: Record<string, Discussion[]> = {};
  for (const f of readdirSync(folder).filter((f) => f.endsWith(".json"))) {
    const m = /^(notes|cards)-(.+)\.json$/.exec(f);
    if (m)
      out[`${m[1]}:${m[2]}`] = readJson<{ discussions: Discussion[] }>(join(folder, f), {
        discussions: [],
      }).discussions;
  }
  return out;
}

const proposalsPath = (dir: string, collection: string, id: string) =>
  join(dir, "proposals", `${collection}-${id}.json`);

export function loadProposals(dir: string, collection: string, id: string): Proposal[] {
  return readJson<{ proposals: Proposal[] }>(proposalsPath(dir, collection, id), { proposals: [] }).proposals;
}

export function changeProposals(dir: string, collection: string, id: string, op: ProposalOp): Proposal[] {
  const next = applyProposalOp(loadProposals(dir, collection, id), op);
  mkdirSync(join(dir, "proposals"), { recursive: true });
  writeAtomic(proposalsPath(dir, collection, id), JSON.stringify({ proposals: next }, null, 1) + "\n");
  return next;
}

/** Every page's proposals, keyed `notes:P06`. */
export function loadAllProposals(dir: string): Record<string, Proposal[]> {
  const folder = join(dir, "proposals");
  if (!existsSync(folder)) return {};
  const out: Record<string, Proposal[]> = {};
  for (const f of readdirSync(folder).filter((f) => f.endsWith(".json"))) {
    const m = /^(notes|cards)-(.+)\.json$/.exec(f);
    if (m) out[`${m[1]}:${m[2]}`] = readJson<{ proposals: Proposal[] }>(join(folder, f), { proposals: [] }).proposals;
  }
  return out;
}

/** A page's past versions, newest first. */
export function listHistory(dir: string, collection: string, id: string): HistoryEntry[] {
  const folder = join(dir, "history", `${collection}-${id}`);
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((f) => /^\d+-v\d+\.json$/.test(f))
    .map((f) => {
      const rec = readJson<PageDoc & { historyReason?: string }>(join(folder, f), {} as PageDoc);
      return historyEntry(f.slice(0, -5), { version: rec.version, title: rec.title, reason: rec.historyReason });
    })
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function readHistory(dir: string, collection: string, id: string, historyId: string): PageDoc | null {
  if (!/^\d+-v\d+$/.test(historyId)) return null;
  const path = join(dir, "history", `${collection}-${id}`, `${historyId}.json`);
  if (!existsSync(path)) return null;
  const { historyReason: _r, ...page } = readJson<PageDoc & { historyReason?: string }>(path, {} as PageDoc);
  void _r;
  return { ...page, collection: collection as Collection, id };
}

/** The approve and restore steps (src/lib/approve.ts) over this content folder. */
export function fileProposalIO(dir: string, collection: Collection, id: string): ProposalIO {
  return {
    page: async () => {
      const path = join(dir, collection, `${id}.json`);
      return existsSync(path) ? { ...readJson<PageDoc>(path, {} as PageDoc), collection, id } : null;
    },
    save: async (page, base, reason) => savePage(dir, collection, id, page, base, reason),
    proposals: async () => loadProposals(dir, collection, id),
    proposalOp: async (op) => changeProposals(dir, collection, id, op),
    threadOp: async (op) => changeThreads(dir, collection, id, op),
  };
}

export function loadProgress(dir: string): Progress {
  return readJson<Progress>(join(dir, "progress.json"), { notes: {} });
}

export function changeProgress(dir: string, op: ProgressOp): Progress {
  const next = applyProgressOp(loadProgress(dir), op);
  writeAtomic(join(dir, "progress.json"), JSON.stringify(next, null, 1) + "\n");
  return next;
}

export function loadCaptures(dir: string): Capture[] {
  return readJson<{ captures: Capture[] }>(join(dir, "captures.json"), { captures: [] }).captures;
}

export function changeCaptures(dir: string, op: CaptureOp): Capture[] {
  const next = applyCaptureOp(loadCaptures(dir), op);
  writeAtomic(join(dir, "captures.json"), JSON.stringify({ captures: next }, null, 1) + "\n");
  return next;
}

export function loadHeatmap(dir: string): HeatMap | null {
  return readJson<HeatMap | null>(join(dir, "heatmap.json"), null);
}

export function saveHeatmap(dir: string, map: HeatMap) {
  writeAtomic(join(dir, "heatmap.json"), JSON.stringify(map, null, 1) + "\n");
}

// ---------- HTTP ----------

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 5_000_000) throw new Error("Body too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function writeAllowed(req: IncomingMessage): string | null {
  if (!LOOPBACK.has(req.socket.remoteAddress ?? "") && process.env.ATLAS_ALLOW_LAN_WRITES !== "1")
    return "Saving is only allowed from this computer";
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) return "Cross-origin write refused";
  if (req.headers["x-atlas"] !== "1") return "Missing X-Atlas header";
  return null;
}

export function contentApi(appRoot: string): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://local");
    if (!url.pathname.startsWith("/api/")) return next();
    const dir = contentDir(appRoot);
    const parts = url.pathname.split("/").filter(Boolean); // api, kind, collection, id
    try {
      if (req.method === "GET" && url.pathname === "/api/content") return send(res, 200, loadAll(dir));
      if (req.method === "GET" && url.pathname === "/api/comments") return send(res, 200, loadAllThreads(dir));
      if (req.method === "GET" && url.pathname === "/api/discussions") return send(res, 200, loadAllDiscussions(dir));
      if (req.method === "GET" && url.pathname === "/api/proposals") return send(res, 200, loadAllProposals(dir));
      if (req.method === "GET" && url.pathname === "/api/heatmap") return send(res, 200, { map: loadHeatmap(dir) });
      if (url.pathname === "/api/progress" || url.pathname === "/api/captures") {
        const progress = url.pathname === "/api/progress";
        if (req.method === "GET") return send(res, 200, progress ? loadProgress(dir) : { captures: loadCaptures(dir) });
        if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
        const refused = writeAllowed(req);
        if (refused) return send(res, 403, { error: refused });
        const op = await readBody(req);
        return send(
          res,
          200,
          progress ? changeProgress(dir, op as ProgressOp) : { captures: changeCaptures(dir, op as CaptureOp) },
        );
      }

      const [, kind, collection, id, extra] = parts;
      if (
        !COLLECTIONS.includes(collection as Collection) ||
        !ID.test(id ?? "") ||
        !(parts.length === 4 || (parts.length === 5 && kind === "history"))
      )
        return send(res, 404, { error: "Not found" });
      if (kind === "history" && req.method === "GET") {
        if (!extra) return send(res, 200, { versions: listHistory(dir, collection, id) });
        const old = readHistory(dir, collection, id, extra);
        return old ? send(res, 200, old) : send(res, 404, { error: "Not found" });
      }
      if (kind === "proposals" && req.method === "GET")
        return send(res, 200, { proposals: loadProposals(dir, collection, id) });

      if (kind === "comments" && req.method === "GET")
        return send(res, 200, { threads: loadThreads(dir, collection, id) });
      if (kind === "discussions" && req.method === "GET")
        return send(res, 200, { discussions: loadDiscussions(dir, collection, id) });
      if (kind === "pages" && req.method === "GET") {
        const path = join(dir, collection, `${id}.json`);
        return existsSync(path)
          ? send(res, 200, { ...readJson<PageDoc>(path, {} as PageDoc), collection, id })
          : send(res, 404, { error: "Not found" });
      }

      if (req.method !== "GET") {
        const refused = writeAllowed(req);
        if (refused) return send(res, 403, { error: refused });
      }
      if (kind === "pages" && req.method === "PUT") {
        const body = (await readBody(req)) as { page: PageDoc; baseVersion: number };
        const result = savePage(dir, collection as Collection, id, body.page, Number(body.baseVersion ?? 0));
        return result.conflict
          ? send(res, 409, { error: "This page changed elsewhere. Reload to get the latest version.", ...result })
          : send(res, 200, result);
      }
      if (kind === "comments" && req.method === "POST") {
        const op = (await readBody(req)) as ThreadOp;
        return send(res, 200, { threads: changeThreads(dir, collection, id, op) });
      }
      if (kind === "proposals" && req.method === "POST") {
        const op = (await readBody(req)) as ProposalOp | { op: "approve"; proposalId: string };
        const io = fileProposalIO(dir, collection as Collection, id);
        if (op.op === "approve") {
          const r = await approveProposal(io, op.proposalId);
          return send(res, 200, { ...r, page: await io.page() });
        }
        return send(res, 200, { proposals: changeProposals(dir, collection, id, op) });
      }
      if (kind === "history" && req.method === "POST") {
        const { historyId } = (await readBody(req)) as { historyId: string };
        const old = readHistory(dir, collection, id, historyId);
        if (!old) return send(res, 404, { error: "No such version" });
        const io = fileProposalIO(dir, collection as Collection, id);
        const r = await restoreVersion(io, old, `v${old.version}`);
        return send(res, 200, { ...r, page: await io.page() });
      }
      if (kind === "discussions" && req.method === "POST") {
        const op = (await readBody(req)) as DiscussionOp;
        return send(res, 200, { discussions: changeDiscussions(dir, collection, id, op) });
      }
      return send(res, 405, { error: "Method not allowed" });
    } catch (e) {
      if (
        e instanceof ThreadOpError ||
        e instanceof ProgressOpError ||
        e instanceof DiscussionOpError ||
        e instanceof ProposalError
      )
        return send(res, 400, { error: e.message });
      return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
    }
  };
}
