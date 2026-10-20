// Essay, Ethics case studies and Medical Science (M12) in the content folder, for the dev save
// API and the CLI (server/backend.ts). Shapes and checks: src/lib/mains-extra.ts.
//
//   mains/<essay|ethics|medical>/<id>.json        content (the CLI writes it)
//   mains/<essay|ethics|medical>/mine-<id>.json   your records (the app writes them, one op at a time)
//
// The screens also read the Write flow's files (M8) when they exist: mains/answers/<id>.json and
// mains/questions/<paper>.json, summarised loosely (answerSummaries, questionSummaries).
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  answerSummaries,
  applyWorkOp,
  emptyWork,
  EXTRA_KINDS,
  isContentId,
  MainsExtraError,
  mineId,
  questionSummaries,
  validateImport,
  type ExtraContent,
  type ExtraKind,
  type ExtraWork,
  type MainsExtra,
  type WorkOp,
} from "../src/lib/mains-extra.ts";

/** What the CLI and the backends share: read everything, load content, change one record. */
export interface MainsExtraBackend {
  load(): Promise<MainsExtra>;
  /** Writes checked content; `replace` also removes content records not given (never your records). */
  setContent(data: { [K in ExtraKind]: ExtraContent[K][] }, replace?: boolean): Promise<void>;
  changeWork<K extends ExtraKind>(kind: K, id: string, op: WorkOp): Promise<ExtraWork[K]>;
}

const JSON_FILE = /^(.+)\.json$/;

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeAtomic(path: string, text: string) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

const folder = (dir: string, kind: string) => join(dir, "mains", kind);

function readFolder(path: string): [string, unknown][] {
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .sort()
    .flatMap((f) => {
      const m = JSON_FILE.exec(f);
      return m ? [[m[1], readJson<unknown>(join(path, f), null)] as [string, unknown]] : [];
    })
    .filter(([, v]) => v !== null);
}

export function loadMainsExtra(dir: string): MainsExtra {
  const out: MainsExtra = {
    essay: [],
    ethics: [],
    medical: [],
    work: { essay: {}, ethics: {}, medical: {} },
    answers: [],
    questions: [],
  };
  for (const kind of EXTRA_KINDS) {
    for (const [name, value] of readFolder(folder(dir, kind))) {
      if (name.startsWith("mine-")) (out.work[kind] as Record<string, unknown>)[name.slice(5)] = value;
      else if (isContentId(name)) (out[kind] as unknown[]).push(value);
    }
  }
  out.medical.sort((a, b) => a.order - b.order);
  out.essay.sort((a, b) => b.year - a.year || a.n - b.n);
  out.ethics.sort((a, b) => a.n - b.n);
  out.answers = answerSummaries(readFolder(join(dir, "mains", "answers")).map(([id, v]) => ({ id, ...(v as object) })));
  out.questions = questionSummaries(readFolder(join(dir, "mains", "questions")).map(([, v]) => v));
  return out;
}

export function saveMainsExtraContent(dir: string, data: unknown, replace = false) {
  const checked = validateImport(data);
  for (const kind of EXTRA_KINDS) {
    const path = folder(dir, kind);
    mkdirSync(path, { recursive: true });
    const keep = new Set<string>();
    for (const item of checked[kind]) {
      keep.add(`${item.id}.json`);
      writeAtomic(join(path, `${item.id}.json`), JSON.stringify(item, null, 1) + "\n");
    }
    if (replace)
      for (const f of readdirSync(path))
        if (JSON_FILE.test(f) && !f.startsWith("mine-") && !keep.has(f)) rmSync(join(path, f));
  }
}

export function changeMainsExtraWork<K extends ExtraKind>(dir: string, kind: K, id: string, op: WorkOp): ExtraWork[K] {
  if (!EXTRA_KINDS.includes(kind)) throw new MainsExtraError("Unknown kind");
  if (!isContentId(id)) throw new MainsExtraError("Bad id");
  const path = folder(dir, kind);
  if (!existsSync(join(path, `${id}.json`))) throw new MainsExtraError(`No ${kind} ${id}`);
  const file = join(path, `${mineId(id)}.json`);
  const next = applyWorkOp(kind, readJson(file, emptyWork(kind)), op);
  writeAtomic(file, JSON.stringify(next, null, 1) + "\n");
  return next;
}

export function mainsExtraFiles(dir: string): MainsExtraBackend {
  return {
    load: async () => loadMainsExtra(dir),
    setContent: async (data, replace) => saveMainsExtraContent(dir, data, replace),
    changeWork: async (kind, id, op) => changeMainsExtraWork(dir, kind, id, op),
  };
}
