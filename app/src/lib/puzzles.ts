// Puzzles (Puzzles 1 · Arena) and Puzzle Rush: the rating update, choosing the next puzzle,
// checking an answer and Rush's best score. Pure, so the app, the CLI and Claude's runs share it.
// Puzzles stay outside FSRS; each answer is one attempt in the log (lib/practice.ts).
import { servable, type Attempt, type Bank, type PuzzleItem, type PuzzleStyle } from "./practice.ts";

/** Elo, as agreed: K = 32 and expected score 1 / (1 + 10^((d − R) / 400)). */
export const ELO_K = 32;

/** How likely you are to solve a puzzle of difficulty `d` at rating `r` (0–1). */
export const expectedScore = (r: number, d: number) => 1 / (1 + 10 ** ((d - r) / 400));

/** How much your rating moves: round(K × (score − expected)), score 1 when solved and 0 when not. */
export const eloDelta = (r: number, d: number, score: number) => Math.round(ELO_K * (score - expectedScore(r, d)));

/** A puzzle's style; a puzzle without one is a plain pick-one. */
export type PuzzleKind = PuzzleStyle | "pick";
export const puzzleKind = (p: PuzzleItem): PuzzleKind => p.style ?? "pick";

export const PUZZLE_LABEL: Record<PuzzleKind, string> = {
  tf: "True or false",
  match: "Match the pairs",
  order: "Put in order",
  map: "Pin it on the map",
  pick: "Pick one",
};

/** What you answered, per style. */
export type PuzzleAnswer =
  | { kind: "tf"; value: boolean }
  | { kind: "match"; pairs: Record<string, string> }
  | { kind: "order"; order: string[] }
  | { kind: "map"; region: string }
  | { kind: "pick"; option: number };

/** Whether an answer solves the puzzle. An answer of the wrong kind never does. */
export function solves(p: PuzzleItem, a: PuzzleAnswer): boolean {
  switch (a.kind) {
    case "tf":
      return p.style === "tf" && a.value === p.truth;
    case "match":
      return (
        p.style === "match" &&
        !!p.pairs &&
        Object.keys(a.pairs).length === p.pairs.length &&
        p.pairs.every((x) => a.pairs[x.left] === x.right)
      );
    case "order":
      return (
        p.style === "order" &&
        !!p.order &&
        a.order.length === p.order.length &&
        p.order.every((x, i) => a.order[i] === x)
      );
    case "map":
      return p.style === "map" && a.region === p.region;
    case "pick":
      return p.style === undefined && a.option === p.answer;
  }
}

/** The right answer in a sentence, for the result sheet after a miss. */
export function rightAnswer(p: PuzzleItem): string {
  switch (puzzleKind(p)) {
    case "tf":
      return p.truth ? "The statement is true." : "The statement is false.";
    case "match":
      return (p.pairs ?? []).map((x) => `${x.left} → ${x.right}`).join(" · ");
    case "order":
      return (p.order ?? []).map((x, i) => `${i + 1}. ${x}`).join("  ");
    case "map": {
      const r = p.regions?.find((x) => x.id === p.region);
      return `The right place is ${r?.label ? `${r.id} (${r.label})` : r?.id}.`;
    }
    case "pick":
      return `The answer is ${p.options?.[p.answer ?? 0] ?? ""}.`;
  }
}

/** One line on what a puzzle asks, for lists and the CLI. */
export const puzzleText = (p: PuzzleItem) => (p.style === "tf" ? `${p.statement}` : p.prompt);

/** Every puzzle a stream may use: servable, from the chosen subjects (all when none), of the given styles. */
export function puzzlePool(banks: Bank[], subjects?: string[] | null, styles?: readonly PuzzleKind[]): PuzzleItem[] {
  const keep = subjects?.length ? new Set(subjects) : null;
  return banks
    .filter((b) => !keep || keep.has(b.subject))
    .flatMap((b) => b.items)
    .filter((i): i is PuzzleItem => i.kind === "puzzle" && servable(i))
    .filter((p) => !styles || styles.includes(puzzleKind(p)));
}

/** The subject of each puzzle's bank, for the filter chip and the puzzle's header. */
export function puzzleSubjects(banks: Bank[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of banks) for (const i of b.items) if (i.kind === "puzzle") out.set(i.id, b.subject);
  return out;
}

/** The puzzles you answered most recently, newest first (each once), from the log. */
export function recentPuzzles(attempts: Attempt[], n = 40): string[] {
  const out: string[] = [];
  const sorted = attempts.filter((a) => a.kind === "puzzle").sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  for (const a of sorted) {
    if (!out.includes(a.itemId)) out.push(a.itemId);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * The next puzzle: one you haven't met recently, as near your rating as the pool allows. The window
 * starts at ±50 and widens by 50 until it holds a few puzzles, then one is drawn at random. If you
 * have met every puzzle recently, the one met longest ago comes back. `recent` is newest first.
 */
export function pickPuzzle(
  pool: PuzzleItem[],
  rating: number,
  recent: string[],
  random: () => number = Math.random,
): PuzzleItem | null {
  if (!pool.length) return null;
  const seen = new Map(recent.map((id, i) => [id, i] as const));
  const fresh = pool.filter((p) => !seen.has(p.id));
  if (!fresh.length) return pool.reduce((a, b) => (seen.get(b.id)! > seen.get(a.id)! ? b : a));
  const want = Math.min(5, fresh.length);
  for (let w = 50; ; w += 50) {
    const near = fresh.filter((p) => Math.abs(p.difficulty - rating) <= w);
    if (near.length >= want) return near[Math.min(near.length - 1, Math.floor(random() * near.length))];
  }
}

/** Rush's queue: true-or-false puzzles shuffled, easier hundreds first, so a run warms up. */
export function rushQueue(pool: PuzzleItem[], random: () => number = Math.random): PuzzleItem[] {
  const shuffled = pool
    .map((p) => ({ p, k: random() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p);
  return shuffled.sort((a, b) => Math.floor(a.difficulty / 100) - Math.floor(b.difficulty / 100));
}

export const RUSH_SECONDS = 180;
export const RUSH_STRIKES = 3;

export interface RushRun {
  session: string;
  at: string;
  score: number;
  misses: number;
}

/** Each Rush run in the log: its score is the puzzles you got right in it. */
export function rushRuns(attempts: Attempt[]): RushRun[] {
  const runs = new Map<string, RushRun>();
  for (const a of attempts) {
    if (a.kind !== "puzzle" || a.mode !== "rush" || !a.session) continue;
    const r = runs.get(a.session) ?? { session: a.session, at: a.at, score: 0, misses: 0 };
    if (a.correct) r.score++;
    else r.misses++;
    if (a.at < r.at) r.at = a.at;
    runs.set(a.session, r);
  }
  return [...runs.values()].sort((a, b) => a.at.localeCompare(b.at));
}

/** Your Rush best: the highest score of any run (0 before your first). */
export const rushBest = (attempts: Attempt[]) => rushRuns(attempts).reduce((m, r) => Math.max(m, r.score), 0);
