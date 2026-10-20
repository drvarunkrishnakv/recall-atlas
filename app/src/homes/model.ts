// Small helpers the Prelims Home, the subject page and Analytics share (M11).
import type { Bank } from "../lib/practice";
import { pyqShares, pyqStats } from "../lib/readiness";
import { subjectSlug } from "../lib/reading";

/**
 * One signature colour per subject (the chosen Board mocks), not a rainbow: the nine most-asked
 * subjects get these; Science & Tech moved from teal to cyan so it stays apart from Environment.
 */
const NAMED: Record<string, string> = {
  polity: "#7c7cf0",
  economy: "#e7a52c",
  geography: "#3d9bd6",
  environment: "#4fb873",
  "science-and-technology": "#1fb5c9",
  "modern-history": "#a86fd0",
  "ancient-and-medieval-history": "#c88a4a",
  "art-and-culture": "#d9699b",
  "international-relations": "#ee7a59",
};
const PALETTE = Object.values(NAMED);
/** Smaller subjects share one quiet colour, so the board never turns into a rainbow. */
const QUIET = "#8f8a80";

/** How many subjects the 3×3 board holds; the rest are listed below it. */
export const BOARD_SIZE = 9;

export interface SubjectInfo {
  slug: string;
  name: string;
  /** Two letters for the tile: "Po" for Polity, "St" for Science and Technology. */
  code: string;
  color: string;
  banks: Bank[];
  pyqs: number;
  lastYear?: number;
  /** Share of all Prelims PYQs (0–1). */
  share: number;
}

const SMALL_WORDS = new Set(["and", "of", "the", "&"]);
export function subjectCode(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter((w) => w && !SMALL_WORDS.has(w.toLowerCase()));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0][0].toUpperCase() + words[0].slice(1, 2).toLowerCase();
  return words[0][0].toUpperCase() + words[1][0].toLowerCase();
}

/** The book order of a subject's topics: a bank's own `order` when it has one, else the order they come in. */
export function bookOrder(banks: Bank[]): Bank[] {
  const order = (b: Bank) => (b as Bank & { order?: number }).order;
  return banks
    .map((b, i) => [b, i] as const)
    .sort(([a, i], [b, j]) => (order(a) ?? Infinity) - (order(b) ?? Infinity) || i - j)
    .map(([b]) => b);
}

/** Every subject in the banks, most asked in Prelims first, each with its colour. */
export function subjectsOf(banks: Bank[]): SubjectInfo[] {
  const by = new Map<string, Bank[]>();
  for (const b of banks) {
    const slug = subjectSlug(b.subject);
    by.set(slug, [...(by.get(slug) ?? []), b]);
  }
  const shares = pyqShares(banks, (b) => subjectSlug(b.subject));
  const list = [...by].map(([slug, bs]) => {
    const p = pyqStats(bs.flatMap((b) => b.items));
    return {
      slug,
      name: bs[0].subject,
      code: subjectCode(bs[0].subject),
      color: NAMED[slug] ?? "",
      banks: bookOrder(bs),
      pyqs: p.count,
      lastYear: p.lastYear,
      share: shares.get(slug) ?? 0,
    };
  });
  list.sort((a, b) => b.share - a.share || b.pyqs - a.pyqs || a.name.localeCompare(b.name));
  // Board subjects without a named colour take an unused one in order; the rest stay quiet.
  const free = PALETTE.filter((c) => !list.some((s) => s.color === c));
  list.forEach((s, i) => {
    if (!s.color) s.color = i < BOARD_SIZE ? (free.shift() ?? QUIET) : QUIET;
  });
  return list;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2 Oct" for "2026-10-02". */
export const shortDay = (day: string) => `${+day.slice(8, 10)} ${MONTHS[+day.slice(5, 7) - 1]}`;

/** "15 – 21 October", or "29 September – 5 October" across a month. */
export function dayRange(from: string, to: string): string {
  const [m1, m2] = [+from.slice(5, 7) - 1, +to.slice(5, 7) - 1];
  return m1 === m2
    ? `${+from.slice(8, 10)} – ${+to.slice(8, 10)} ${LONG_MONTHS[m2]}`
    : `${+from.slice(8, 10)} ${LONG_MONTHS[m1]} – ${+to.slice(8, 10)} ${LONG_MONTHS[m2]}`;
}

/** "Today", "Yesterday" or "2 Oct". */
export function readDay(day: string | undefined, today: string, yesterday: string): string {
  if (!day) return "—";
  return day === today ? "Today" : day === yesterday ? "Yesterday" : shortDay(day);
}

/** "+9 this week", "−3 this week" or "no change". */
export const weekDelta = (d: number) => (d > 0 ? `+${d} this week` : d < 0 ? `−${-d} this week` : "no change");
export const deltaClass = (d: number) => (d > 0 ? "up" : d < 0 ? "down" : "");
export const signed = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "±0");
export const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
