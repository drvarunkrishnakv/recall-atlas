// Lessons for the app: the list of lesson days (with the latest lesson in full), any other day
// opened, and the weekly notes. Each "Got it" / "Still shaky" is shown at once and saved in the
// background, like an answer (content/practice.ts).
import { useEffect, useSyncExternalStore } from "react";
import { api } from "./store";
import {
  applyLessonOp,
  lessonSummary,
  type Lesson,
  type LessonDay,
  type LessonOp,
  type WeeklyNote,
} from "../lib/lessons";

interface LessonsState {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  /** Every lesson day, newest first. */
  days: LessonDay[];
  latest: string | null;
  /** Lessons opened so far, by day; null when that day has none. */
  lessons: Record<string, Lesson | null>;
  saveError?: string;
  weeks: { status: "idle" | "loading" | "ready" | "error"; list: string[]; latest: WeeklyNote | null };
}

let state: LessonsState = {
  status: "idle",
  days: [],
  latest: null,
  lessons: {},
  weeks: { status: "idle", list: [], latest: null },
};
const listeners = new Set<() => void>();

function set(next: Partial<LessonsState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useLessons(): LessonsState {
  const s = useSyncExternalStore(subscribe, () => state);
  if (s.status === "idle") void loadLessons();
  return s;
}

export async function loadLessons() {
  if (state.status === "loading") return;
  set({ status: "loading" });
  try {
    const r = (await api("/api/lessons")) as { days: LessonDay[]; latest: Lesson | null };
    set({
      status: "ready",
      days: r.days,
      latest: r.latest?.day ?? null,
      lessons: { ...state.lessons, ...(r.latest ? { [r.latest.day]: r.latest } : {}) },
    });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

/** One day's lesson (the latest when `day` is null): undefined while loading, null if there is none. */
export function useLesson(day: string | null): Lesson | null | undefined {
  const s = useLessons();
  const want = day ?? s.latest;
  const known = s.status === "ready" && want ? s.lessons[want] : undefined;
  const missing = s.status === "ready" && want && !(want in s.lessons) && !s.days.some((d) => d.day === want);
  useEffect(() => {
    if (s.status !== "ready" || !want || want in s.lessons || missing) return;
    api(`/api/lessons/${want}`).then(
      (l) => set({ lessons: { ...state.lessons, [want]: l as Lesson } }),
      () => set({ lessons: { ...state.lessons, [want]: null } }),
    );
  }, [s.status, s.lessons, want, missing]);
  if (s.status !== "ready") return undefined;
  if (!want || missing) return null;
  return known;
}

function apply(day: string, lesson: Lesson) {
  set({
    lessons: { ...state.lessons, [day]: lesson },
    days: state.days.map((d) => (d.day === day ? lessonSummary(lesson) : d)),
  });
}

async function send(day: string, op: LessonOp) {
  try {
    apply(day, (await api(`/api/lessons/${day}`, { method: "POST", body: JSON.stringify(op) })) as Lesson);
    set({ saveError: undefined });
  } catch (e) {
    set({ saveError: `Couldn't save your rating: ${e instanceof Error ? e.message : String(e)}` });
  }
}

/** "Got it" / "Still shaky" on a card, or its undo: shown at once, saved in the background. */
export function changeLesson(day: string, op: LessonOp) {
  const cur = state.lessons[day];
  if (!cur) return;
  apply(day, applyLessonOp(cur, op));
  void send(day, op);
}

/** The weekly notes: which weeks have one, and the latest in full. */
export function useWeeklyNotes() {
  const s = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (state.weeks.status !== "idle") return;
    set({ weeks: { ...state.weeks, status: "loading" } });
    api("/api/weeks").then(
      (r) => {
        const { weeks, latest } = r as { weeks: string[]; latest: WeeklyNote | null };
        set({ weeks: { status: "ready", list: weeks, latest } });
      },
      () => set({ weeks: { ...state.weeks, status: "error" } }),
    );
  }, []);
  return s.weeks;
}
