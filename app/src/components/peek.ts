// The side peek: a note or card opened in a panel on the right (full screen on phones),
// like Notion's side peek. Its state lives in the URL (`?peek=card:id`), so back closes it.
export type PeekKind = "card" | "note";

export function openPeek(kind: PeekKind, id: string) {
  window.dispatchEvent(new CustomEvent("atlas-peek", { detail: `${kind}:${id}` }));
}

export function parsePeek(value: string | null): { kind: PeekKind; id: string } | null {
  const m = /^(card|note):([A-Za-z0-9-]+)$/.exec(value ?? "");
  return m ? { kind: m[1] as PeekKind, id: m[2] } : null;
}
