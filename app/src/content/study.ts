// Study state for the app: revision progress, quick captures, every page's comment threads
// (for the inbox and the subject table), and recently opened notes (this device only).
import { useSyncExternalStore } from "react";
import { api } from "./store";
import { today, type Capture, type CaptureOp, type Confidence, type Progress, type ProgressOp } from "../lib/progress";
import type { StoredThread } from "../lib/threads";

interface StudyState {
  progress: Progress;
  captures: Capture[];
  /** `notes:P06` → threads. */
  threads: Record<string, StoredThread[]>;
  recent: string[];
}

const RECENT_KEY = "atlas-recent";
function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

let state: StudyState = { progress: { notes: {} }, captures: [], threads: {}, recent: readRecent() };
const listeners = new Set<() => void>();
const set = (next: Partial<StudyState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

export function useStudy(): StudyState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export async function loadStudy() {
  const [progress, captures, threads] = await Promise.all([
    api("/api/progress") as Promise<Progress>,
    api("/api/captures") as Promise<{ captures: Capture[] }>,
    api("/api/comments") as Promise<Record<string, StoredThread[]>>,
  ]);
  set({ progress, captures: captures.captures, threads });
}

/** Re-reads threads and captures (Claude may have replied); cheap enough to call on focus. */
export async function refreshStudy() {
  try {
    await loadStudy();
  } catch {
    /* offline: keep what we have */
  }
}

export function setPageThreads(key: string, threads: StoredThread[]) {
  if (JSON.stringify(state.threads[key] ?? []) === JSON.stringify(threads)) return;
  set({ threads: { ...state.threads, [key]: threads } });
}

const progressOp = async (op: ProgressOp) =>
  set({ progress: (await api("/api/progress", { method: "POST", body: JSON.stringify(op) })) as Progress });

export const markRead = (noteId: string) =>
  state.progress.notes[noteId]?.readAt ? Promise.resolve() : progressOp({ op: "read", noteId, day: today() });
export const markRevised = (noteId: string) => progressOp({ op: "revise", noteId, day: today() });
export const undoRevised = (noteId: string) => progressOp({ op: "unrevise", noteId });
export const setConfidence = (noteId: string, value: Confidence | null) =>
  progressOp({ op: "confidence", noteId, value });

const captureOp = async (op: CaptureOp) =>
  set({
    captures: ((await api("/api/captures", { method: "POST", body: JSON.stringify(op) })) as { captures: Capture[] })
      .captures,
  });

export const addCapture = (text: string) => captureOp({ op: "add", id: crypto.randomUUID().slice(0, 12), text });
export const deleteCapture = (id: string) => captureOp({ op: "delete", id });

export function noteOpened(noteId: string) {
  const recent = [noteId, ...state.recent.filter((x) => x !== noteId)].slice(0, 8);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  } catch {
    /* storage unavailable: recent list lasts this visit */
  }
  set({ recent });
  void markRead(noteId).catch(() => undefined);
}

/** What Claude's column shows for a page: questions waiting, replies to read, or nothing. */
export function claudeState(threads: StoredThread[] = []) {
  const open = threads.filter((t) => t.kind === "claude" && !t.resolved);
  const replied = open.filter((t) => t.comments.at(-1)?.userId === "claude").length;
  return { waiting: open.length - replied, replied };
}

export function commentCounts(threads: StoredThread[] = []) {
  return {
    open: threads.filter((t) => !t.resolved && t.kind === "comment").length,
    sticky: threads.filter((t) => t.kind === "sticky").length,
  };
}
