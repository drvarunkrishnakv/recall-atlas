// Statement questions ("Consider the following statements… Which is/are correct?"): which
// statements an option says are true. The session uses it to show the truth of each statement
// once the answer is known, and to light up the option your ✓/✕ marks point to.

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6" };

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\b(vi|iv|v|iii|ii|i)\b/g, (m) => ROMAN[m]);
}

/**
 * What an option says about statements 1…count: true/false per statement, or null when it
 * can't tell (for example "Only two", which gives a count, not which ones).
 */
export function optionVector(option: string, count: number): boolean[] | null {
  if (count < 1) return null;
  const t = normalise(option);
  const all = (v: boolean) => Array.from({ length: count }, () => v);

  // Statement-I / Statement-II questions: is each statement correct (the "explains" part aside).
  if (/statement\s*-?\s*\d/.test(t)) {
    // Three-statement versions ("Both Statement-II and Statement-III explain Statement-I") say
    // which statements are correct only in passing, so they are left to the reader.
    if (count !== 2) return null;
    if (/both\s+statement/.test(t) && /\bcorrect\b/.test(t) && !/incorrect|not correct/.test(t)) return [true, true];
    if (/both\s+statement/.test(t) && /incorrect|not correct/.test(t)) return [false, false];
    const s1 = /statement\s*-?\s*1\s+is\s+(correct|incorrect|not correct)/.exec(t)?.[1];
    const s2 = /statement\s*-?\s*2\s+is\s+(correct|incorrect|not correct)/.exec(t)?.[1];
    if (s1 && s2) return [s1 === "correct", s2 === "correct"];
    return null;
  }
  if (/\bonly\s+(one|two|three|four)\b/.test(t)) return null;
  if (/^\s*none\b|none of (the )?(above|these|them)/.test(t)) return all(false);
  if (/\ball\s+(the\s+)?(two|three|four|five|of the above)\b|\ball\b.*\babove\b/.test(t)) return all(true);
  if (/\bneither\b/.test(t)) {
    const nums = [...t.matchAll(/\b(\d)\b/g)].map((m) => Number(m[1]));
    if (count === 2 || nums.length === count) return all(false);
  }
  const nums = [...new Set([...t.matchAll(/\b(\d)\b/g)].map((m) => Number(m[1])))];
  if (!nums.length || nums.some((n) => n < 1 || n > count)) return null;
  const out = all(false);
  for (const n of nums) out[n - 1] = true;
  return out;
}

/** The truth of each statement, from the right option; null when it can't be told. */
export const statementTruth = (options: string[], answer: number, count: number) =>
  options[answer] === undefined ? null : optionVector(options[answer], count);

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/** How many statements a "How many of the above…?" option says are correct; null if it isn't one. */
export function optionCount(option: string, count: number): number | null {
  const t = option.toLowerCase();
  const only = /\bonly\s+(one|two|three|four|five|six)\b/.exec(t);
  if (only) return WORDS[only[1]];
  const all = /^\s*all\s+(two|three|four|five|six)\b/.exec(t);
  if (all) return WORDS[all[1]] === count ? count : null;
  if (/^\s*none\b/.test(t)) return 0;
  return null;
}

/** Whether ✓/✕ marks make sense: every option names statements or a count of them. */
export const markable = (options: string[], count: number) =>
  count >= 2 && options.every((o) => optionVector(o, count) !== null || optionCount(o, count) !== null);

/** The option your marks point to, when every statement is marked and exactly one option fits. */
export function impliedOption(options: string[], marks: (boolean | null)[]): number | null {
  if (!marks.length || marks.some((m) => m === null)) return null;
  const trues = marks.filter(Boolean).length;
  const fits = options
    .map((o, i) => ({ i, v: optionVector(o, marks.length), n: optionCount(o, marks.length) }))
    .filter(({ v, n }) => (v ? v.every((x, k) => x === marks[k]) : n === trues));
  return fits.length === 1 ? fits[0].i : null;
}
