// Where the CLI and the MCP server keep content: the content folder (the dev save API's
// files, ATLAS_CONTENT_DIR) or Firestore (firestore-backend.ts, through the Admin SDK).
// Both offer the same operations, so the commands don't care which one they run on.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Collection, StoredPage } from "../src/lib/cloud-docs.ts";
import type { StoredThread, ThreadOp } from "../src/lib/threads.ts";
import type { Discussion, DiscussionOp } from "../src/lib/discussions.ts";
import type { Capture, CaptureOp, Progress, ProgressOp } from "../src/lib/progress.ts";
import type { Proposal, ProposalOp } from "../src/lib/proposals.ts";
import type { HistoryEntry } from "../src/lib/cloud-docs.ts";
import { approveProposal, restoreVersion } from "../src/lib/approve.ts";
import type { HeatMap } from "../src/lib/heatmap.ts";
import {
  changeCaptures,
  changeDiscussions,
  changeProposals,
  fileProposalIO,
  listHistory,
  loadAllProposals,
  readHistory,
  changeProgress,
  changeThreads,
  loadAll,
  loadAllDiscussions,
  loadAllThreads,
  loadCaptures,
  loadProgress,
  loadThreads,
  loadHeatmap,
  saveHeatmap,
  savePage,
  writePageFiles,
} from "./content-api.ts";

export type SaveOutcome = { conflict: true; version: number } | { conflict: false; version: number; updated: string };

export interface Backend {
  /** "files" or "firestore", for messages. */
  kind: string;
  /** Every page, sorted by id; Markdown-only pages (not yet opened in the app) have `markdown` and no blocks. */
  pages(collection: Collection): Promise<StoredPage[]>;
  page(collection: Collection, id: string): Promise<StoredPage | null>;
  /** Saves with a version check, like the app does. */
  savePage(collection: Collection, id: string, page: StoredPage, baseVersion: number): Promise<SaveOutcome>;
  threads(collection: Collection, id: string): Promise<StoredThread[]>;
  changeThreads(collection: Collection, id: string, op: ThreadOp): Promise<StoredThread[]>;
  /** `notes:P06` → threads. */
  allThreads(): Promise<Record<string, StoredThread[]>>;
  changeDiscussions(collection: Collection, id: string, op: DiscussionOp): Promise<Discussion[]>;
  /** `notes:P06` → discussions. */
  allDiscussions(): Promise<Record<string, Discussion[]>>;
  progress(): Promise<Progress>;
  changeProgress(op: ProgressOp): Promise<Progress>;
  captures(): Promise<Capture[]>;
  changeCaptures(op: CaptureOp): Promise<Capture[]>;
  /** `notes:P06` → proposed changes. */
  allProposals(): Promise<Record<string, Proposal[]>>;
  changeProposals(collection: Collection, id: string, op: ProposalOp): Promise<Proposal[]>;
  /** Applies a pending proposal (with a history entry) and closes the flag it came from. */
  approve(collection: Collection, id: string, proposalId: string): Promise<{ version: number }>;
  history(collection: Collection, id: string): Promise<HistoryEntry[]>;
  /** Makes a past version current again, as a new version. */
  restore(collection: Collection, id: string, historyId: string): Promise<{ version: number }>;
  /** The news heat map, or null before one is imported. */
  heatmap(): Promise<HeatMap | null>;
  setHeatmap(map: HeatMap): Promise<void>;
  /**
   * Writes everything as given, without version checks: for `atlas import` and `atlas export`.
   * `prune` (files only) also removes pages, comments and discussions that `data` no longer has,
   * so the notes repo's mirror matches Firestore.
   */
  restoreAll(data: Snapshot, opts?: { prune?: boolean }): Promise<void>;
}

/** All of a backend's content, as `atlas import` and `atlas export` move it. */
export interface Snapshot {
  pages: StoredPage[];
  threads: Record<string, StoredThread[]>;
  discussions: Record<string, Discussion[]>;
  proposals: Record<string, Proposal[]>;
  progress: Progress;
  captures: Capture[];
  heatmap?: HeatMap | null;
}

export async function snapshot(b: Backend): Promise<Snapshot> {
  const [notes, cards, threads, discussions, proposals, progress, captures, heatmap] = await Promise.all([
    b.pages("notes"),
    b.pages("cards"),
    b.allThreads(),
    b.allDiscussions(),
    b.allProposals(),
    b.progress(),
    b.captures(),
    b.heatmap(),
  ]);
  return { pages: [...notes, ...cards], threads, discussions, proposals, progress, captures, heatmap };
}

const writeJson = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 1) + "\n");

/** The content folder: notes, cards, comments, discussions, progress, captures and the heat map as files. */
export function fileBackend(dir: string): Backend {
  return {
    kind: "files",
    pages: async (collection) => (loadAll(dir)[collection] as StoredPage[]).sort((a, b) => a.id.localeCompare(b.id)),
    page: async (collection, id) => (loadAll(dir)[collection] as StoredPage[]).find((p) => p.id === id) ?? null,
    savePage: async (collection, id, page, baseVersion) => savePage(dir, collection, id, page, baseVersion),
    threads: async (collection, id) => loadThreads(dir, collection, id),
    changeThreads: async (collection, id, op) => changeThreads(dir, collection, id, op),
    allThreads: async () => loadAllThreads(dir),
    changeDiscussions: async (collection, id, op) => changeDiscussions(dir, collection, id, op),
    allDiscussions: async () => loadAllDiscussions(dir),
    progress: async () => loadProgress(dir),
    changeProgress: async (op) => changeProgress(dir, op),
    captures: async () => loadCaptures(dir),
    changeCaptures: async (op) => changeCaptures(dir, op),
    allProposals: async () => loadAllProposals(dir),
    changeProposals: async (collection, id, op) => changeProposals(dir, collection, id, op),
    approve: (collection, id, proposalId) => approveProposal(fileProposalIO(dir, collection, id), proposalId),
    history: async (collection, id) => listHistory(dir, collection, id),
    async restore(collection, id, historyId) {
      const old = readHistory(dir, collection, id, historyId);
      if (!old) throw new Error(`No version ${historyId}`);
      return restoreVersion(fileProposalIO(dir, collection, id), old, `v${old.version}`);
    },
    heatmap: async () => loadHeatmap(dir),
    setHeatmap: async (map) => saveHeatmap(dir, map),
    async restoreAll(data, opts) {
      if (opts?.prune) {
        const keep = new Set(data.pages.map((p) => `${p.collection}/${p.id}`));
        for (const c of ["notes", "cards"]) {
          const folder = join(dir, c);
          if (!existsSync(folder)) continue;
          for (const f of readdirSync(folder)) {
            const m = /^(.+)\.(json|md)$/.exec(f);
            if (m && !keep.has(`${c}/${m[1]}`)) rmSync(join(folder, f));
          }
        }
        for (const [name, map] of [
          ["comments", data.threads],
          ["discussions", data.discussions],
          ["proposals", data.proposals ?? {}],
        ] as const) {
          const folder = join(dir, name);
          if (!existsSync(folder)) continue;
          for (const f of readdirSync(folder))
            if (f.endsWith(".json") && !Object.hasOwn(map, f.slice(0, -5).replace("-", ":"))) rmSync(join(folder, f));
        }
      }
      for (const p of data.pages) writePageFiles(dir, p);
      for (const [name, map, field] of [
        ["comments", data.threads, "threads"],
        ["discussions", data.discussions, "discussions"],
        ["proposals", data.proposals ?? {}, "proposals"],
      ] as const) {
        if (!Object.keys(map).length) continue;
        mkdirSync(join(dir, name), { recursive: true });
        for (const [key, list] of Object.entries(map))
          writeJson(join(dir, name, `${key.replace(":", "-")}.json`), { [field]: list });
      }
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeJson(join(dir, "progress.json"), data.progress);
      writeJson(join(dir, "captures.json"), { captures: data.captures });
      if (data.heatmap) saveHeatmap(dir, data.heatmap);
      else if (opts?.prune && data.heatmap === null && existsSync(join(dir, "heatmap.json")))
        rmSync(join(dir, "heatmap.json"));
    },
  };
}
