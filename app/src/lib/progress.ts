// Your study state, kept beside the notes so it follows you between devices and Claude can
// read it: per-note reading and revision history, confidence, and quick captures.
//   content/progress.json  { notes: { P06: { readAt, revisions: [dates], confidence } } }
//   content/captures.json  { captures: [ { id, text, createdAt, status, reply?, note? } ] }
// Dates are local calendar days, "YYYY-MM-DD".

export type Confidence = "weak" | "ok" | "strong";

export interface NoteProgress {
  readAt?: string;
  revisions: string[];
  confidence?: Confidence;
}
export interface Progress {
  notes: Record<string, NoteProgress>;
}

export type ProgressOp =
  | { op: "read"; noteId: string; day: string }
  | { op: "revise"; noteId: string; day: string }
  | { op: "unrevise"; noteId: string }
  | { op: "confidence"; noteId: string; value: Confidence | null };

export interface Capture {
  id: string;
  text: string;
  createdAt: string;
  status: "open" | "done";
  /** Set by Claude when it files the capture: what it did, and the note it went to. */
  reply?: string;
  note?: string;
  doneAt?: string;
}

export type CaptureOp =
  | { op: "add"; id: string; text: string }
  | { op: "done"; id: string; reply: string; note?: string }
  | { op: "reopen"; id: string }
  | { op: "delete"; id: string };

export class ProgressOpError extends Error {}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,80}$/;

export const today = (d = new Date()) => d.toLocaleDateString("en-CA");

const dayNum = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 864e5;
const fromNum = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);

export function applyProgressOp(p: Progress, op: ProgressOp): Progress {
  if (!ID.test(op.noteId)) throw new ProgressOpError("Bad note id");
  const cur: NoteProgress = p.notes[op.noteId] ?? { revisions: [] };
  let next: NoteProgress;
  switch (op.op) {
    case "read":
      if (!DAY.test(op.day)) throw new ProgressOpError("Bad day");
      if (cur.readAt) return p;
      next = { ...cur, readAt: op.day };
      break;
    case "revise":
      if (!DAY.test(op.day)) throw new ProgressOpError("Bad day");
      if (cur.revisions.at(-1) === op.day) return p;
      next = { ...cur, readAt: cur.readAt ?? op.day, revisions: [...cur.revisions, op.day] };
      break;
    case "unrevise":
      next = { ...cur, revisions: cur.revisions.slice(0, -1) };
      break;
    case "confidence":
      if (op.value !== null && !["weak", "ok", "strong"].includes(op.value)) throw new ProgressOpError("Bad value");
      next = { ...cur, confidence: op.value ?? undefined };
      break;
  }
  return { ...p, notes: { ...p.notes, [op.noteId]: next } };
}

// Spacing after the 1st, 2nd, 3rd and later revisions; weak notes come back sooner.
const INTERVALS = [3, 7, 21, 60];

/** The day a note is next due, or null if it hasn't been read yet. */
export function nextDue(n: NoteProgress | undefined): string | null {
  if (!n?.readAt) return null;
  const count = n.revisions.length;
  const last = count ? n.revisions[count - 1] : n.readAt;
  let gap = count ? INTERVALS[Math.min(count - 1, INTERVALS.length - 1)] : 1;
  if (n.confidence === "weak") gap = Math.max(1, Math.round(gap / 2));
  if (n.confidence === "strong") gap = Math.round(gap * 1.5);
  return fromNum(dayNum(last) + gap);
}

export function isDue(n: NoteProgress | undefined, day = today()): boolean {
  const due = nextDue(n);
  return !!due && due <= day;
}

/** "today", "tomorrow", "Fri", "in 12 days", "3 days late". */
export function dueLabel(due: string, day = today()): string {
  const diff = dayNum(due) - dayNum(day);
  if (diff < 0) return diff === -1 ? "1 day late" : `${-diff} days late`;
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff < 7) return new Date(dayNum(due) * 864e5).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  return `in ${diff} days`;
}

export function applyCaptureOp(list: Capture[], op: CaptureOp, now = new Date().toISOString()): Capture[] {
  const has = (id: string) => {
    if (!list.some((c) => c.id === id)) throw new ProgressOpError(`No capture ${id}`);
  };
  switch (op.op) {
    case "add": {
      const text = String(op.text ?? "").trim();
      if (!text) throw new ProgressOpError("Empty capture");
      if (!ID.test(op.id) || list.some((c) => c.id === op.id)) throw new ProgressOpError("Bad id");
      return [{ id: op.id, text: text.slice(0, 5000), createdAt: now, status: "open" }, ...list];
    }
    case "done":
      has(op.id);
      return list.map((c) =>
        c.id === op.id ? { ...c, status: "done", reply: String(op.reply ?? "").trim(), note: op.note, doneAt: now } : c,
      );
    case "reopen":
      has(op.id);
      return list.map((c) => (c.id === op.id ? { id: c.id, text: c.text, createdAt: c.createdAt, status: "open" } : c));
    case "delete":
      has(op.id);
      return list.filter((c) => c.id !== op.id);
  }
}
