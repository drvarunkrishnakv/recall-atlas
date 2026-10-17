// A line diff (longest common subsequence), to show what changed between two versions of a
// page's Markdown copy. Notes are a few hundred lines, so the simple O(n·m) table is fine.

export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ kind: "removed", text: a[i++] });
    else out.push({ kind: "added", text: b[j++] });
  }
  while (i < n) out.push({ kind: "removed", text: a[i++] });
  while (j < m) out.push({ kind: "added", text: b[j++] });
  return out;
}

/** Only the changed lines, each with a little context; long unchanged stretches fold to "…". */
export function changedHunks(lines: DiffLine[], context = 1): (DiffLine | null)[] {
  const keep = lines.map((l) => l.kind !== "same");
  const show = lines.map((_, k) => keep.slice(Math.max(0, k - context), k + context + 1).some(Boolean));
  const out: (DiffLine | null)[] = [];
  lines.forEach((l, k) => {
    if (show[k]) out.push(l);
    else if (out.at(-1) !== null) out.push(null);
  });
  return out;
}
