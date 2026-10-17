import { describe, expect, it } from "vitest";
import { changedHunks, diffLines } from "./diff";

describe("diffLines", () => {
  it("marks added and removed lines and keeps the rest", () => {
    const d = diffLines("a\nb\nc\nd", "a\nB\nc\nd\ne");
    expect(d.map((l) => `${l.kind[0]}${l.text}`)).toEqual(["sa", "rb", "aB", "sc", "sd", "ae"]);
  });
  it("folds long unchanged stretches", () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n");
    const after = before.replace("l10", "L10");
    const h = changedHunks(diffLines(before, after));
    expect(h.filter(Boolean).map((l) => l!.text)).toEqual(["l9", "l10", "L10", "l11"]);
    expect(h[0]).toBeNull();
  });
});
