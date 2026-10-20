// Essay, Ethics and Medical Science for the app (M12): the content and your records, loaded once
// when one of these screens first needs them. A change to your record shows at once and is saved
// in the background, like practice answers.
import { useSyncExternalStore } from "react";
import { api } from "./store";
import {
  applyWorkOp,
  emptyWork,
  type ExtraKind,
  type ExtraWork,
  type MainsExtra,
  type WorkOp,
} from "../lib/mains-extra";

interface MainsExtraState {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  data: MainsExtra;
  saveError?: string;
}

const EMPTY: MainsExtra = {
  essay: [],
  ethics: [],
  medical: [],
  work: { essay: {}, ethics: {}, medical: {} },
  answers: [],
  questions: [],
};

let state: MainsExtraState = { status: "idle", data: EMPTY };
const listeners = new Set<() => void>();
function set(next: Partial<MainsExtraState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function useMainsExtra(): MainsExtraState {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  if (s.status === "idle") void loadMainsExtra();
  return s;
}

export async function loadMainsExtra() {
  if (state.status === "loading") return;
  set({ status: "loading" });
  try {
    set({ status: "ready", data: (await api("/api/mains-extra")) as MainsExtra, error: undefined });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

/** The newest change sent for each record, so an older reply doesn't undo a newer change. */
const latest = new Map<string, number>();

const putWork = <K extends ExtraKind>(kind: K, id: string, work: ExtraWork[K]) =>
  set({ data: { ...state.data, work: { ...state.data.work, [kind]: { ...state.data.work[kind], [id]: work } } } });

/** Your record for a topic, case or line (empty until you do something with it). */
export const workOf = <K extends ExtraKind>(data: MainsExtra, kind: K, id: string): ExtraWork[K] =>
  ((data.work[kind] as Record<string, ExtraWork[K]>)[id] ?? emptyWork(kind)) as ExtraWork[K];

/**
 * Applies one change to your record: shown at once, saved in the background. Throws (and changes
 * nothing) when the change itself is invalid, so a form can say why.
 */
export function changeWork<K extends ExtraKind>(kind: K, id: string, op: WorkOp): ExtraWork[K] {
  const next = applyWorkOp(kind, workOf(state.data, kind, id), op);
  putWork(kind, id, next);
  const key = `${kind}/${id}`;
  const seq = (latest.get(key) ?? 0) + 1;
  latest.set(key, seq);
  void (async () => {
    try {
      const r = (await api(`/api/mains-extra/${kind}/${encodeURIComponent(id)}`, {
        method: "POST",
        body: JSON.stringify(op),
      })) as { work: ExtraWork[K] };
      // A newer change is already shown: keep it rather than this older reply.
      if (latest.get(key) === seq) putWork(kind, id, r.work);
      if (state.saveError) set({ saveError: undefined });
    } catch (e) {
      set({ saveError: `Couldn't save: ${e instanceof Error ? e.message : String(e)}` });
    }
  })();
  return next;
}
