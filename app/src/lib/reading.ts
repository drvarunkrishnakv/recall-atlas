// The reading log (M11): the days you logged reading each Prelims topic, one record per subject.
// Pure, shared by the dev API, the cloud API and the screens.
//
//   reading/{subject}   {json: {topics: {[bank]: ["YYYY-MM-DD", …]}}}   dev files: practice/reading/<subject>.json
//
// One tap on "Log reading" adds today to a topic; "Undo" takes that day off again.

export interface ReadingLog {
  /** Bank id → the days you logged reading it, oldest first. */
  topics: Record<string, string[]>;
}

export type ReadingOp = { op: "log" | "unlog"; bank: string; day: string };

export class ReadingError extends Error {}

const SUBJECT = /^[a-z0-9][a-z0-9-]{0,80}$/;
const BANK = /^[a-z0-9][a-z0-9-]{0,60}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Enough for a topic read every day for well over a year; keeps a record far below Firestore's size limit. */
const MAX_DAYS = 500;

/**
 * A subject's id in links and in the reading log: lower case, every run of other characters a
 * hyphen, as the banks' own ids are made ("Science and Technology" → "science-and-technology").
 */
export const subjectSlug = (subject: string) =>
  subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** The `reading/{id}` document (and file name) for a subject slug. */
export function readingDocId(subject: string): string {
  if (!SUBJECT.test(subject)) throw new ReadingError("Bad subject");
  return subject;
}

/** Applies one change. Logging a day twice keeps one entry, so a retried save can't double it. */
export function applyReadingOp(log: ReadingLog, op: ReadingOp): ReadingLog {
  if (op?.op !== "log" && op?.op !== "unlog") throw new ReadingError("Unknown reading change");
  if (typeof op.bank !== "string" || !BANK.test(op.bank)) throw new ReadingError("Bad topic");
  if (typeof op.day !== "string" || !DAY.test(op.day) || Number.isNaN(Date.parse(op.day)))
    throw new ReadingError("Bad day");
  const days = log.topics?.[op.bank] ?? [];
  const topics = { ...log.topics };
  if (op.op === "log") {
    if (days.includes(op.day)) return log;
    if (days.length >= MAX_DAYS) throw new ReadingError("Too many reading days for one topic");
    topics[op.bank] = [...days, op.day].sort();
  } else {
    const left = days.filter((d) => d !== op.day);
    if (left.length === days.length) return log;
    if (left.length) topics[op.bank] = left;
    else delete topics[op.bank];
  }
  return { ...log, topics };
}

/** The last day you logged reading a topic, if ever. */
export const lastRead = (log: ReadingLog | undefined, bank: string): string | undefined => {
  const days = log?.topics?.[bank];
  return days?.length ? days[days.length - 1] : undefined;
};
