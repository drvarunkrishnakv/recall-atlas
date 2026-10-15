// Pure helpers for Atlas content: front matter, card terms and "cited in" links.
// Used by the Vite content plugin (Node) and by the app (browser).

export type FrontMatter = Record<string, string | number | boolean | null>;

export interface ParsedDoc {
  meta: FrontMatter;
  body: string;
}

/** Front matter is `key: <JSON value>` lines between `---` fences. */
export function parseFrontMatter(text: string): ParsedDoc {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text };
  const meta: FrontMatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    const raw = line.slice(i + 1).trim();
    try {
      meta[key] = JSON.parse(raw);
    } catch {
      meta[key] = raw;
    }
  }
  return { meta, body: text.slice(m[0].length).replace(/^\s+/, "") };
}

const TERM = /\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g;

/** `[[card-id|label]]` → a Markdown link with the `card:` scheme, which the renderer turns into a hover card. */
export function termsToLinks(markdown: string): string {
  return markdown.replace(TERM, (_, id: string, label: string) => `[${label}](card:${id})`);
}

/** Card ids a body links to, in order of first appearance. */
export function cardRefs(markdown: string): string[] {
  const seen: string[] = [];
  for (const m of markdown.matchAll(TERM)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/** For each card id, the notes whose body links to it. */
export function citedIn(notes: { id: string; body: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const n of notes) {
    for (const id of cardRefs(n.body)) {
      const list = map.get(id) ?? [];
      if (!list.includes(n.id)) list.push(n.id);
      map.set(id, list);
    }
  }
  return map;
}
