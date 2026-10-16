// Front matter for the Markdown files in the notes repo. Used by the dev save API.

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
