// Mains answers for the app: the questions and your answers, loaded when a Mains practice page
// first needs them and kept in one store. Changes go to the save API (the dev server's files, or
// Firestore in the cloud build) as one AnswerOp each; page photos go to the dev API as raw images,
// or to Firebase Storage in the cloud build.
import { useEffect, useState, useSyncExternalStore } from "react";
import { api } from "./store";
import {
  storagePath,
  type AnswerOp,
  type AnswerPage,
  type MainsAnswer,
  type MainsQuestion,
  type PhotoType,
  type QuestionSet,
} from "../lib/mains";

interface MainsState {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  sets: QuestionSet[];
  questions: Map<string, MainsQuestion>;
  answers: Map<string, MainsAnswer>;
}

let state: MainsState = { status: "idle", sets: [], questions: new Map(), answers: new Map() };
const listeners = new Set<() => void>();

function set(next: Partial<MainsState>) {
  state = { ...state, ...next };
  if (next.sets) state.questions = new Map(state.sets.flatMap((s) => s.questions.map((q) => [q.id, q] as const)));
  listeners.forEach((l) => l());
}

export function useMains(): MainsState {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  if (s.status === "idle") void loadMains();
  return s;
}

export async function loadMains() {
  if (state.status === "loading") return;
  set({ status: "loading" });
  try {
    const r = (await api("/api/mains")) as { sets: QuestionSet[]; answers: MainsAnswer[] };
    set({ status: "ready", sets: r.sets, answers: new Map(r.answers.map((a) => [a.id, a])) });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

function keep(a: MainsAnswer) {
  const answers = new Map(state.answers);
  answers.set(a.id, a);
  set({ answers });
}

/** Re-reads one answer (pages sent from the phone, Claude's marking); null if it doesn't exist. */
export async function refreshAnswer(id: string): Promise<MainsAnswer | null> {
  try {
    const a = (await api(`/api/mains/answers/${id}`)) as MainsAnswer;
    const cur = state.answers.get(id);
    if (!cur || JSON.stringify(cur) !== JSON.stringify(a)) keep(a);
    return a;
  } catch {
    return null;
  }
}

/** Applies one change and keeps the saved answer. Throws if the save fails, so the screen can say so. */
export async function changeAnswer(id: string, op: AnswerOp): Promise<MainsAnswer> {
  const r = (await api(`/api/mains/answers/${id}`, { method: "POST", body: JSON.stringify(op) })) as {
    answer: MainsAnswer;
  };
  keep(r.answer);
  return r.answer;
}

/** Sends a photo: to Firebase Storage in the cloud build, else to the dev API as the raw image. */
export async function uploadPhoto(answerId: string, file: string, blob: Blob, type: PhotoType): Promise<void> {
  if (import.meta.env.MODE === "cloud") {
    const [{ storage }, { ref, uploadBytes }] = await Promise.all([import("./storage"), import("firebase/storage")]);
    await uploadBytes(ref(storage, storagePath(answerId, file)), blob, { contentType: type });
    return;
  }
  const r = await fetch(`/api/mains/photos/${answerId}/${file}`, {
    method: "POST",
    headers: { "Content-Type": type, "X-Atlas": "1" },
    body: blob,
  });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
}

const urls = new Map<string, string>();

/** The address to show a photo from; in the cloud build it is fetched (owner-only) first. */
export function usePhotoUrl(answerId: string, page: AnswerPage): string | undefined {
  const key = `${answerId}/${page.file}?v=${page.at}`;
  const local = import.meta.env.MODE === "cloud" ? undefined : `/api/mains/photos/${key}`;
  const [url, setUrl] = useState(() => local ?? urls.get(key));
  useEffect(() => {
    if (import.meta.env.MODE !== "cloud") return setUrl(`/api/mains/photos/${key}`);
    if (urls.has(key)) return setUrl(urls.get(key));
    let live = true;
    void Promise.all([import("./storage"), import("firebase/storage")])
      .then(([{ storage }, { getDownloadURL, ref }]) => getDownloadURL(ref(storage, storagePath(answerId, page.file))))
      .then((u) => {
        urls.set(key, u);
        if (live) setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [answerId, page.file, key]);
  return url;
}

/** Calls `fn` every `ms` while `on` and the page is visible, and when the window regains focus. */
export function usePoll(fn: () => unknown, ms: number, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const tick = () => document.visibilityState === "visible" && void fn();
    const t = window.setInterval(tick, ms);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", tick);
    };
  }, [fn, ms, on]);
}
