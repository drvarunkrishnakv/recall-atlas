// Data the homes and Analytics read besides practice (M11): the reading log, and the nightly
// engine's lessons and weekly note. The engine (M9) may not be there yet, so those are optional
// fetches: a 404 (or any failure) simply means "nothing yet".
import { useSyncExternalStore } from "react";
import { api } from "../content/store";
import { today } from "../lib/progress";
import { applyReadingOp, type ReadingLog, type ReadingOp } from "../lib/reading";

function makeStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next: Partial<T>) {
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

// ---------- Reading log ----------

interface ReadingState {
  status: "idle" | "loading" | "ready" | "error";
  /** Subject slug → its log. */
  subjects: Record<string, ReadingLog>;
  error?: string;
}
const reading = makeStore<ReadingState>({ status: "idle", subjects: {} });

export function useReading(): ReadingState {
  const s = useSyncExternalStore(reading.subscribe, reading.get);
  if (s.status === "idle") void loadReading();
  return s;
}

async function loadReading() {
  if (reading.get().status === "loading") return;
  reading.set({ status: "loading" });
  try {
    const r = (await api("/api/reading")) as { subjects?: Record<string, ReadingLog> };
    reading.set({ status: "ready", subjects: r.subjects ?? {} });
  } catch (e) {
    reading.set({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

/** Logs (or undoes) a day's reading of a topic: shown at once, saved in the background. */
export async function changeReading(subject: string, bank: string, op: ReadingOp["op"] = "log", day = today()) {
  const change: ReadingOp = { op, bank, day };
  const before = reading.get().subjects;
  const log = before[subject] ?? { topics: {} };
  reading.set({ subjects: { ...before, [subject]: applyReadingOp(log, change) }, error: undefined });
  try {
    const saved = (await api(`/api/reading/${subject}`, {
      method: "POST",
      body: JSON.stringify(change),
    })) as ReadingLog;
    reading.set({ subjects: { ...reading.get().subjects, [subject]: saved } });
  } catch (e) {
    reading.set({
      subjects: before,
      error: `Couldn't save your reading: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

// ---------- Lessons and the weekly note (from the nightly engine, M9) ----------

export interface LessonInfo {
  day: string;
  /** Concept cards in the lesson, when it says. */
  concepts?: number;
  /** Questions in the next morning's quiz, when it says. */
  quiz?: number;
}

export interface WeekNoteLine {
  text: string;
  /** What the line rests on: a section of Analytics ("readiness", "marks"…) or a subject. */
  evidence?: string;
  /** M9's notes link each line to an app route ("/prelims/analytics#calibration"), with a label. */
  route?: string;
  label?: string;
}
export interface WeekNote {
  week: string;
  lines: WeekNoteLine[];
}

interface EngineState {
  status: "idle" | "loading" | "ready";
  /** null when the engine isn't there yet. */
  lessons: LessonInfo[] | null;
  week: WeekNote | null;
}
const engine = makeStore<EngineState>({ status: "idle", lessons: null, week: null });

export function useEngineNotes(): EngineState {
  const s = useSyncExternalStore(engine.subscribe, engine.get);
  if (s.status === "idle") void loadEngine();
  return s;
}

const optional = (path: string): Promise<unknown> => api(path).catch(() => null);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const count = (v: unknown) => (Array.isArray(v) ? v.length : typeof v === "number" ? v : undefined);

/** Entries of a list, or of a map keyed by day or week. */
function entries(v: unknown): [string | undefined, unknown][] {
  if (Array.isArray(v)) return v.map((x) => [undefined, x]);
  if (isObj(v)) return Object.entries(v);
  return [];
}

/** Reads lessons in whichever of the likely shapes the engine sends; anything unreadable is skipped. */
export function parseLessons(raw: unknown): LessonInfo[] {
  const list = isObj(raw) ? (raw.lessons ?? raw.days) : raw;
  const out: LessonInfo[] = [];
  for (const [key, v] of entries(list)) {
    if (!isObj(v)) continue;
    const day = typeof v.day === "string" ? v.day : key;
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const quiz = isObj(v.quiz) ? (v.quiz.items ?? v.quiz.questions) : v.quiz;
    out.push({ day, concepts: count(v.cards ?? v.concepts ?? v.items), quiz: count(quiz) });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** The latest weekly note, from `{weeks}` or a list of notes; lines may be strings or `{text, evidence}`. */
export function parseWeek(raw: unknown): WeekNote | null {
  // M9's GET /api/weeks sends {weeks: ["2026-W43", …], latest: WeeklyNote}.
  if (isObj(raw) && isObj(raw.latest) && typeof raw.latest.week === "string") return parseWeek([raw.latest]);
  const list = isObj(raw) && (raw.weeks ?? raw.notes) ? (raw.weeks ?? raw.notes) : raw;
  let best: WeekNote | null = null;
  for (const [key, v] of entries(list)) {
    if (!isObj(v)) continue;
    const week = typeof v.week === "string" ? v.week : key;
    const lines = (Array.isArray(v.lines) ? v.lines : Array.isArray(v.items) ? v.items : [])
      .map((l: unknown): WeekNoteLine | null =>
        typeof l === "string"
          ? { text: l }
          : isObj(l) && typeof (l.text ?? l.line) === "string"
            ? {
                text: String(l.text ?? l.line),
                evidence: typeof (l.evidence ?? l.section) === "string" ? String(l.evidence ?? l.section) : undefined,
                ...(isObj(l.evidence) && typeof l.evidence.route === "string"
                  ? { route: l.evidence.route, label: typeof l.evidence.label === "string" ? l.evidence.label : undefined }
                  : {}),
              }
            : null,
      )
      .filter((l): l is WeekNoteLine => !!l && l.text.trim().length > 0);
    if (!week || !lines.length) continue;
    if (!best || week > best.week) best = { week, lines };
  }
  return best;
}

async function loadEngine() {
  if (engine.get().status !== "idle") return;
  engine.set({ status: "loading" });
  const raw = await optional("/api/lessons");
  let week = raw ? parseWeek(raw) : null;
  // The weekly note may come with the lessons or from its own route.
  if (raw && !week) week = parseWeek(await optional("/api/weeks"));
  engine.set({ status: "ready", lessons: raw ? parseLessons(raw) : null, week });
}
