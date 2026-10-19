// Content for the app: every note and card, loaded at startup and kept in one store that
// pages subscribe to. Saves go back with a version check. Locally the API is the dev
// server's save API; in the cloud build (`--mode cloud`) the same routes are answered from
// Firestore (cloud.ts). The rest of the app only sees this module.
import { useSyncExternalStore } from "react";
import { backlinks, type Block, type PageDoc } from "../lib/blocks";
import { readSnapshot, writeSnapshot } from "./snapshot";

export type Collection = "notes" | "cards";
export interface Page extends PageDoc {
  /** Present only until a Markdown page has been converted to blocks. */
  markdown?: string;
}

interface State {
  status: "loading" | "ready" | "error";
  error?: string;
  pages: Map<string, Page>;
  /** `card:id` / `note:id` → pages (as `note:id` / `card:id`) that link to it. */
  links: Map<string, string[]>;
}

const key = (collection: Collection, id: string) => `${collection}:${id}`;
let state: State = { status: "loading", pages: new Map(), links: new Map() };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  if (next.pages) state.links = backlinks([...state.pages.values()].filter((p) => p.blocks));
  if (next.pages && state.status === "ready") writeSnapshot("pages", () => [...state.pages.values()]);
  listeners.forEach((l) => l());
}

/** Cloud build: shows the pages this device last loaded while the fresh load is on its way. */
export async function paintFromSnapshot(): Promise<boolean> {
  const kept = await readSnapshot<Page[]>("pages");
  if (!kept?.length || state.status !== "loading") return false;
  set({ status: "ready", pages: new Map(kept.map((p) => [key(p.collection, p.id), p])) });
  return true;
}

export function useContent(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const getPage = (collection: Collection, id: string) => state.pages.get(key(collection, id));
export const allPages = (collection?: Collection) =>
  [...state.pages.values()].filter((p) => !collection || p.collection === collection);

export function usePage(collection: Collection, id: string | undefined): Page | undefined {
  const s = useContent();
  return id ? s.pages.get(key(collection, id)) : undefined;
}

/** Pages that link to a card or note, as `{collection, id}`. */
export function linksTo(kind: "card" | "note", id: string): { collection: Collection; id: string }[] {
  return (state.links.get(`${kind}:${id}`) ?? []).map((k) => {
    const [from, pid] = k.split(":");
    return { collection: from === "note" ? "notes" : "cards", id: pid };
  });
}

export class ConflictError extends Error {}

let cloud: Promise<(path: string, init?: RequestInit) => Promise<unknown>> | null = null;
const cloudApi = () =>
  (cloud ??= Promise.all([import("./cloud"), import("./firebase")]).then(([c, f]) => c.cloudApi(f.db)));

/** In the cloud build (MODE "cloud", checked inline so local builds leave Firebase out) the routes go to Firestore. */
export const api = (path: string, init?: RequestInit): Promise<unknown> =>
  import.meta.env.MODE === "cloud" ? cloudApi().then((call) => call(path, init)) : localApi(path, init);

const localApi = (path: string, init?: RequestInit) =>
  fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", "X-Atlas": "1", ...init?.headers },
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (r.status === 409) throw new ConflictError(body.error);
    if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
    return body;
  });

/** Saves a page with a version check; updates the store on success. */
export async function savePage(page: Page, blocks: Block[]): Promise<Page> {
  const { markdown: _md, ...rest } = page;
  void _md;
  const body = { page: { ...rest, blocks }, baseVersion: page.version };
  const r = (await api(`/api/pages/${page.collection}/${page.id}`, { method: "PUT", body: JSON.stringify(body) })) as {
    version: number;
    updated: string;
  };
  const saved: Page = { ...rest, blocks, version: r.version, updated: r.updated };
  const pages = new Map(state.pages);
  pages.set(key(page.collection, page.id), saved);
  set({ pages });
  return saved;
}

/** Re-reads one page; returns it if the file is newer than what the app has (e.g. Claude's CLI edited it). */
export async function refreshPage(collection: Collection, id: string): Promise<Page | null> {
  const fresh = (await api(`/api/pages/${collection}/${id}`)) as Page;
  const current = state.pages.get(key(collection, id));
  if (!current || fresh.version <= current.version) return null;
  const pages = new Map(state.pages);
  pages.set(key(collection, id), fresh);
  set({ pages });
  return fresh;
}

/** Creates a page that doesn't exist yet (a new card, or a planned note being started). */
export async function createPage(page: {
  collection: Collection;
  id: string;
  title: string;
  blocks: Block[];
  [meta: string]: unknown;
}): Promise<Page> {
  return savePage({ ...page, version: 0, updated: "" }, page.blocks);
}

let loading: Promise<void> | null = null;

/** Loads all content once; converts any Markdown-only page to blocks and saves it. */
export function loadContent(): Promise<void> {
  loading ??= (async () => {
    if (state.status === "error") set({ status: "loading", error: undefined });
    try {
      const data = (await api("/api/content")) as Record<Collection, Page[]>;
      const pages = new Map<string, Page>();
      for (const c of ["notes", "cards"] as const) for (const p of data[c] ?? []) pages.set(key(c, p.id), p);
      const pending = [...pages.values()].filter((p) => !p.blocks && typeof p.markdown === "string");
      if (pending.length) {
        const { markdownToBlocks } = await import("../editor/convert");
        for (const p of pending) {
          const saved = await savePage(p, await markdownToBlocks(p.markdown!)).catch(() => null);
          pages.set(key(p.collection, p.id), saved ?? { ...p, blocks: [] });
          // Keep earlier conversions visible while the rest run.
          state = { ...state, pages: new Map(pages) };
        }
      }
      set({ status: "ready", pages });
    } catch (e) {
      // Let a later call try again (say, once the owner claim is set and "Try again" is tapped).
      loading = null;
      // Showing the kept copy (offline, say)? Keep it rather than an error.
      if (state.status !== "ready") set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  })();
  return loading;
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Drafting",
  "in-review": "In review",
  live: "Live",
};

export const KIND_LABEL: Record<string, string> = {
  case: "Case",
  body: "Body",
  provision: "Provision",
  event: "Event",
  concept: "Concept",
};
