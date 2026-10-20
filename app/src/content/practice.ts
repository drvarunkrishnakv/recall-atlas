// Practice data for the app: the banks of items and the attempt log, loaded once (when a
// Prelims page first needs them) and kept in one store. Each answer is shown at once and saved
// in the background; the review state (FSRS) is rebuilt from the log whenever it changes.
import { useSyncExternalStore } from "react";
import { api } from "./store";
import { today } from "../lib/progress";
import { reviewStates, type ReviewState } from "../lib/srs";
import { ratingAfter, type Attempt, type AttemptOp, type Bank, type Grade, type Item } from "../lib/practice";

interface PracticeState {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  banks: Bank[];
  /** `YYYY-MM-DD` → that day's attempts. */
  days: Record<string, Attempt[]>;
  states: Map<string, ReviewState>;
  items: Map<string, Item>;
  rating: number;
  saveError?: string;
}

let state: PracticeState = {
  status: "idle",
  banks: [],
  days: {},
  states: new Map(),
  items: new Map(),
  rating: ratingAfter([]),
};
const listeners = new Set<() => void>();

function set(next: Partial<PracticeState>) {
  state = { ...state, ...next };
  if (next.days) {
    const all = Object.values(state.days).flat();
    state.states = reviewStates(all);
    state.rating = ratingAfter(all.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)));
  }
  if (next.banks) state.items = new Map(state.banks.flatMap((b) => b.items.map((i) => [i.id, i] as const)));
  listeners.forEach((l) => l());
}

export function usePractice(): PracticeState {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  if (s.status === "idle") void loadPractice();
  return s;
}

export async function loadPractice() {
  if (state.status === "loading") return;
  set({ status: "loading" });
  try {
    const r = (await api("/api/practice")) as { banks: Bank[]; days: Record<string, Attempt[]> };
    set({
      status: "ready",
      banks: [...r.banks].sort((a, b) => a.subject.localeCompare(b.subject) || a.topic.localeCompare(b.topic)),
      days: r.days,
    });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

export const allAttempts = () => Object.values(state.days).flat();

async function send(day: string, op: AttemptOp) {
  try {
    const r = (await api(`/api/practice/attempts/${day}`, { method: "POST", body: JSON.stringify(op) })) as {
      attempts: Attempt[];
    };
    set({ days: { ...state.days, [day]: r.attempts }, saveError: undefined });
  } catch (e) {
    set({ saveError: `Couldn't save your answer: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** Adds an answer to today's log: shown at once, saved in the background. Returns the day it went to. */
export function recordAttempt(a: Attempt): string {
  const day = today();
  set({ days: { ...state.days, [day]: [...(state.days[day] ?? []), a] } });
  void send(day, { op: "add", attempt: a });
  return day;
}

/** Sets (or changes) the grade of an answer: the miss reason, or how well you knew it. */
export function gradeAttempt(day: string, id: string, grade: Grade) {
  set({
    days: { ...state.days, [day]: (state.days[day] ?? []).map((a) => (a.id === id ? { ...a, grade } : a)) },
  });
  void send(day, { op: "grade", id, grade });
}
