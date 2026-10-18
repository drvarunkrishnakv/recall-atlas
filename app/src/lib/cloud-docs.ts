// How Atlas content sits in Firestore. Shared by the app (web SDK) and by the CLI and MCP
// server (Admin SDK), so both read and write the same shapes.
//
//   notes/{id}, cards/{id}           a page: {title, version, updated, snapshotAt, json}
//   notes/{id}/history/{ms}-v{n}     the version before an edit, at most every 10 minutes of editing
//   comments/{collection}-{id}       {json: {threads}}
//   discussions/{collection}-{id}    {json: {discussions}}
//   study/progress, study/captures   {json: Progress} and {json: {captures}}
//   heatmap/current[, current-1…]    {json, parts}: the news heat map, split when it's long
//   heatmap/questions[, questions-1…] {json, parts}: its comparison with past papers
//
// Each document keeps its data as one JSON string (`json`): BlockNote's nested arrays
// (table cells) and undefined fields aren't valid Firestore values, and a string keeps key
// order for diffs. Title, version and updated stay as plain fields for the Firebase console.
import type { PageDoc } from "./blocks.ts";

export type Collection = "notes" | "cards";
export const COLLECTIONS: readonly Collection[] = ["notes", "cards"];
export const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;

/** A past version, as the history list shows it. */
export interface HistoryEntry {
  id: string;
  version: number;
  /** When the next version replaced it (ms). */
  savedAt: number;
  title: string;
  /** Why it was replaced, when a reason was given (approved proposal, restore). */
  reason?: string;
  /** The Markdown the page started from (first conversion). */
  original?: boolean;
}

export interface PageRecord {
  title: string;
  version: number;
  updated: string;
  /** When the last history snapshot was taken (ms). */
  snapshotAt: number;
  json: string;
  /** History snapshots only: when it was replaced, and why. */
  savedAt?: number;
  reason?: string;
}

/** A page as the app and CLI see it; `markdown` is set only until the app converts it to blocks. */
export type StoredPage = PageDoc & { markdown?: string };

/** `notes-P06` for comments and discussions; `notes:P06` is the key the app uses. */
export const pageKeyDoc = (collection: string, id: string) => `${collection}-${id}`;
export function docToPageKey(docId: string): string | null {
  const m = /^(notes|cards)-(.+)$/.exec(docId);
  return m ? `${m[1]}:${m[2]}` : null;
}

export function encodePage(page: StoredPage, snapshotAt: number): PageRecord {
  const body = Object.fromEntries(Object.entries(page).filter(([k]) => k !== "collection" && k !== "id"));
  return {
    title: String(page.title ?? page.id),
    version: page.version,
    updated: page.updated ?? "",
    snapshotAt,
    json: JSON.stringify(body),
  };
}

export function decodePage(collection: Collection, id: string, rec: Partial<PageRecord>): StoredPage {
  const body = rec.json ? (JSON.parse(rec.json) as Record<string, unknown>) : {};
  return {
    ...body,
    collection,
    id,
    title: String(rec.title ?? body.title ?? id),
    version: Number(rec.version ?? 0),
    updated: String(rec.updated ?? ""),
  } as StoredPage;
}

export const decodeJson = <T>(rec: { json?: unknown } | undefined, fallback: T): T =>
  typeof rec?.json === "string" ? (JSON.parse(rec.json) as T) : fallback;

export type SaveResult =
  | { conflict: true; version: number }
  | {
      conflict: false;
      version: number;
      updated: string;
      record: PageRecord;
      /** The previous version to keep in history, if it's time for a snapshot. */
      snapshot?: { id: string; record: PageRecord };
    };

/**
 * What saving `page` over `current` should write, with the same rules as the file save API:
 * refuse a stale `baseVersion`, bump the version, date it today, and snapshot the previous
 * version at most every few minutes of editing.
 */
export function planSave(
  collection: Collection,
  id: string,
  current: Partial<PageRecord> | undefined,
  page: StoredPage,
  baseVersion: number,
  now = Date.now(),
  /** Why the page changed (an approved proposal, a restore): always keeps a snapshot, labelled. */
  reason?: string,
): SaveResult {
  const currentVersion = Number(current?.version ?? 0);
  if (baseVersion !== currentVersion) return { conflict: true, version: currentVersion };
  // A saved page is block JSON; the Markdown a page started from is dropped once converted.
  const { markdown: _md, ...meta } = page;
  void _md;
  const saved: StoredPage = {
    ...meta,
    collection,
    id,
    title: String(page.title ?? id),
    version: currentVersion + 1,
    updated: new Date(now).toLocaleDateString("en-CA"), // local YYYY-MM-DD
    blocks: Array.isArray(page.blocks) ? page.blocks : [],
  };
  // Keep the Markdown original on first conversion, then a snapshot every few minutes of editing.
  const lastSnap = Number(current?.snapshotAt ?? 0);
  const snap = !!current?.json && (!!reason || currentVersion === 0 || now - lastSnap > SNAPSHOT_EVERY_MS);
  return {
    conflict: false,
    version: saved.version,
    updated: saved.updated,
    record: encodePage(saved, snap ? now : lastSnap),
    snapshot: snap
      ? {
          id: `${now}-${currentVersion === 0 ? "original" : `v${currentVersion}`}`,
          record: { ...(current as PageRecord), savedAt: now, ...(reason ? { reason: reason.slice(0, 300) } : {}) },
        }
      : undefined,
  };
}

/** A history snapshot's list entry, from its id (`<ms>-v<n>` or `<ms>-original`) and record. */
export function historyEntry(id: string, rec: Partial<PageRecord>): HistoryEntry {
  const m = /^(\d+)-(?:v(\d+)|original)$/.exec(id);
  return {
    id,
    version: Number(rec.version ?? m?.[2] ?? 0),
    savedAt: Number(rec.savedAt ?? m?.[1] ?? 0),
    title: String(rec.title ?? ""),
    ...(rec.reason ? { reason: rec.reason } : {}),
    ...(id.endsWith("-original") ? { original: true } : {}),
  };
}

/** Firestore keeps a string field under 1 MiB; 300 000 characters stays under it even in UTF-8. */
export const HEATMAP_PART = 300_000;

/**
 * A long value's documents in the `heatmap` collection: `<base>` holds the first part and the
 * count, `<base>-1`… the rest. `current` is the map, `questions` the comparison with past papers.
 */
export function heatmapRecords(map: unknown, now = Date.now(), max = HEATMAP_PART, base = "current") {
  const json = JSON.stringify(map);
  const parts: string[] = [];
  for (let i = 0; i < json.length; i += max) parts.push(json.slice(i, i + max));
  return parts.map((part, i) =>
    i === 0
      ? { id: base, record: { json: part, parts: parts.length, updatedAt: now } }
      : { id: `${base}-${i}`, record: { json: part } },
  );
}

/** Joins the parts back; `part(i)` reads `<base>-i`. Null when nothing was imported. */
export async function joinHeatmap<T>(
  first: { json?: unknown; parts?: unknown } | undefined,
  part: (i: number) => Promise<{ json?: unknown } | undefined>,
): Promise<T | null> {
  if (typeof first?.json !== "string") return null;
  let json = first.json;
  for (let i = 1; i < Number(first.parts ?? 1); i++) {
    const p = await part(i);
    if (typeof p?.json !== "string") throw new Error(`The heat map is missing part ${i}`);
    json += p.json;
  }
  return JSON.parse(json) as T;
}
