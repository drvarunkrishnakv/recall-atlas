// The rest of Mains (M12): Essay, Ethics case studies and Medical Science. Pure, and shared by
// the app, the dev save API, the cloud API and the CLI (docs/ARCHITECTURE.md, "Mains extras").
//
//   essay/{id}            {json: EssayTopic}     a topic and Claude's breakdown (the CLI writes it)
//   essay/mine-{id}       {json: EssayWork}      your own decoding, outlines and timed sittings
//   ethics/{id}           {json: EthicsCase}     a case and its marking key (the CLI writes it)
//   ethics/mine-{id}      {json: EthicsWork}     your bench attempts
//   medical/{line}        {json: MedicalLine}    a syllabus line, its PYQs, diagrams, Claude's note
//   medical/mine-{line}   {json: MedicalWork}    your rating and diagram drills
//
// Files: `mains/<kind>/<id>.json` and `mains/<kind>/mine-<id>.json` in the content folder.
// Content is written only by the CLI; the app writes only the `mine-` records, one op at a time.
import { blockText, type Block } from "./blocks.ts";

export type ExtraKind = "essay" | "ethics" | "medical";
export const EXTRA_KINDS: readonly ExtraKind[] = ["essay", "ethics", "medical"];

export interface Source {
  label: string;
  url: string;
}

// ---------- Essay ----------

/** One essay topic as UPSC printed it, with Claude's breakdown behind the "try it yourself" gate. */
export interface EssayTopic {
  id: string;
  year: number;
  section: "A" | "B";
  /** Its number on the paper, 1–8. */
  n: number;
  text: string;
  /** A short theme, e.g. "Character and power". */
  theme: string;
  /** Where the wording was checked (the UPSC paper first). */
  sources: Source[];
  decode?: EssayDecode;
}

export interface EssayDecode {
  /** What the topic asks, in a sentence. */
  asks: string;
  keywords: string[];
  /** Six angles: a short name and what it covers. */
  angles: { k: string; v: string }[];
  /** Evidence from your notes: the note and the point it gives. */
  notes: { id: string; why: string }[];
}

/** The body of an outline: seven one-line paragraphs, each tagged with an angle (or the other side). */
export const OUTLINE_PARAS = 7;
export const OTHER_SIDE = "Other side";

export interface EssayOutline {
  id: string;
  /** When it was last saved (ISO). */
  at: string;
  /** Time on the sprint clock when saved, in milliseconds. */
  ms: number;
  thesis: string;
  opening: string;
  paras: { angle: string | null; text: string }[];
  closing: string;
}

/** A timed full essay (1 h 30) or full paper (3 h). The writing itself goes to the Write flow. */
export interface EssaySitting {
  id: string;
  kind: "essay" | "paper";
  at: string;
  ms: number;
  /** The paper's two topics, for a full paper. */
  topics?: string[];
}

export interface EssayWork {
  /** Your own decoding (keywords and angles), written before Claude's breakdown is shown. */
  tried?: { text: string; at: string };
  outlines: EssayOutline[];
  sittings: EssaySitting[];
}

// ---------- Ethics ----------

export type Verdict = "do" | "weak" | "never";
export const VERDICTS: readonly Verdict[] = ["do", "weak", "never"];
export const VERDICT_LABEL: Record<Verdict, string> = { do: "Do", weak: "Weak", never: "Never" };

export interface EthicsCase {
  id: string;
  /** Its number in the table. */
  n: number;
  /** "claude": a practice case Claude wrote. "upsc": a real UPSC case (not loaded yet). */
  by: "claude" | "upsc";
  year?: number;
  title: string;
  setting: string;
  /** Who you are in the case, e.g. "District Collector". */
  you: string;
  /** The tension in a few words, e.g. "Integrity vs career security". */
  clash: string;
  values: string[];
  /** The full case, paragraph by paragraph. Absent: only the brief is written. */
  text?: string[];
  /** The questions under the case. */
  asks?: string[];
  /** Claude's own solution, shown by "Compare with mine" only after your attempt. */
  key?: EthicsKey;
  /** Every law or rule the case cites, each checked against an official source. */
  laws: { cite: string; source: Source }[];
}

export interface EthicsKey {
  /** Stakeholder chips; `key` marks the ones Claude counts as central. */
  stakeholders: { t: string; key: boolean }[];
  issues: { k: string; v: string; central: boolean }[];
  options: { t: string; pro: string; con: string; verdict: Verdict }[];
  decision: string;
  system: string;
}

/** The bench, in the order the answer is marked. */
export const BENCH_STEPS = ["Stakeholders", "Issues and values", "Options", "Decision", "Fix the system", "Write"];
export const ANSWER_MS = 11 * 60 * 1000;

export interface BenchAttempt {
  id: string;
  /** When it was started and last changed (ISO). */
  at: string;
  updated: string;
  /** The stakeholder chips you picked, and any you added yourself. */
  stakeholders: string[];
  own: string[];
  /** The issues you picked (by name). */
  issues: string[];
  /** Your verdict on each option, in the case's order. */
  verdicts: (Verdict | null)[];
  decision: string;
  system: string;
  /** The full answer, if typed here (otherwise written on paper). */
  answer: string;
  answerMs?: number;
}

export interface EthicsWork {
  attempts: BenchAttempt[];
}

// ---------- Medical Science ----------

export type Rating = "rusty" | "ok" | "strong";
export const RATINGS: readonly Rating[] = ["rusty", "ok", "strong"];
export const RATING_LABEL: Record<Rating, string> = { rusty: "Rusty", ok: "OK", strong: "Strong" };

export interface MedicalPyq {
  id: string;
  year: number;
  paper: "I" | "II";
  marks: number;
  text: string;
  /** Whether this line is the question's main line (or a second one it touches). */
  primary: boolean;
}

export interface MedicalLine {
  id: string;
  paper: "I" | "II";
  subject: string;
  /** Its place in the notification's order. */
  order: number;
  /** The condensed line. */
  label: string;
  /** The notification's own wording. */
  syllabus: string;
  /** PYQs mapped to the line. Absent: not loaded yet. */
  pyqs?: {
    /** Sub-parts whose main line this is, their marks, and those that also touch it. */
    count: number;
    marks: number;
    secondary: number;
    /** The latest year it was asked (main or second line). */
    last?: number;
    items: MedicalPyq[];
  };
  /** Key diagrams for the line. */
  diagrams: { id: string; t: string; asked?: number[] }[];
  /** Claude's note: dated syllabus wording, or something to check before writing. */
  note?: { kind: "dated" | "watch"; text: string; checked: boolean; sources: Source[] };
  /** Related GS notes or subjects (in-app links). */
  gs?: { label: string; to: string }[];
}

export const DRILL_MS = 3 * 60 * 1000;

export interface DiagramDrill {
  id: string;
  diagram: string;
  at: string;
  /** How long the drawing took (it may run past the 3 minutes). */
  ms: number;
}

export interface MedicalWork {
  rating?: Rating;
  ratedAt?: string;
  drills: DiagramDrill[];
}

// ---------- shapes and ops ----------

export type ExtraContent = { essay: EssayTopic; ethics: EthicsCase; medical: MedicalLine };
export type ExtraWork = { essay: EssayWork; ethics: EthicsWork; medical: MedicalWork };

/** Everything the screens read: the content, your records by id, and summaries of the Write flow's data. */
export interface MainsExtra {
  essay: EssayTopic[];
  ethics: EthicsCase[];
  medical: MedicalLine[];
  work: { essay: Record<string, EssayWork>; ethics: Record<string, EthicsWork>; medical: Record<string, MedicalWork> };
  /** From the Write flow (M8), when it has data: one row per marked answer. */
  answers: AnswerSummary[];
  /** From the Write flow's question bank (M8), when it has data: Mains PYQs by note. */
  questions: QuestionSummary[];
}

export const emptyWork = <K extends ExtraKind>(kind: K): ExtraWork[K] =>
  (kind === "essay"
    ? { outlines: [], sittings: [] }
    : kind === "ethics"
      ? { attempts: [] }
      : { drills: [] }) as unknown as ExtraWork[K];

export type WorkOp =
  | { op: "try"; text: string }
  | { op: "outline"; outline: EssayOutline }
  | { op: "sitting"; sitting: EssaySitting }
  | { op: "attempt"; attempt: BenchAttempt }
  | { op: "rate"; rating: Rating | null }
  | { op: "drill"; drill: DiagramDrill };

const OPS_OF: Record<ExtraKind, WorkOp["op"][]> = {
  essay: ["try", "outline", "sitting"],
  ethics: ["attempt"],
  medical: ["rate", "drill"],
};

export class MainsExtraError extends Error {}
function fail(what: string): never {
  throw new MainsExtraError(what);
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_MS = 6 * 60 * 60 * 1000;
const MAX_LIST = 200;

/** A content id: letters, digits and dashes, and never `mine-…` (those are your records). */
export const isContentId = (id: unknown): id is string =>
  typeof id === "string" && ID.test(id) && !id.startsWith("mine-");
/** The record id for a content id. */
export const mineId = (id: string) => `mine-${id}`;

const isText = (v: unknown, max = 4000): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const isOptText = (v: unknown, max = 4000): v is string => typeof v === "string" && v.length <= max;
const isIso = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v));
const isMs = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_MS;
const isTexts = (v: unknown, max = 400, n = 40): v is string[] =>
  Array.isArray(v) && v.length <= n && v.every((s) => isText(s, max));
const obj = (x: unknown): Partial<Record<string, unknown>> | null =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Partial<Record<string, unknown>>) : null;

/** A government or UN site: where a law, rule or programme name is checked. */
export function isOfficial(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return /(^|\.)(gov\.in|nic\.in|gov|int|un\.org)$/.test(host) || host === "indiacode.nic.in";
  } catch {
    return false;
  }
}

function checkSource(s: unknown, what: string): Source {
  const src = obj(s);
  if (!src || !isText(src.label, 200) || typeof src.url !== "string" || !/^https?:\/\/\S+$/.test(src.url))
    fail(`Bad source on ${what}`);
  return { label: src.label as string, url: src.url as string };
}

// ---------- content checks (the CLI checks every record before it is imported) ----------

export function validateEssayTopic(x: unknown): EssayTopic {
  const t = obj(x);
  if (!t) fail("Not an essay topic");
  if (!isContentId(t.id)) fail("Bad essay id");
  const id = t.id as string;
  if (!Number.isInteger(t.year) || (t.year as number) < 1993 || (t.year as number) > 2100) fail(`Bad year on ${id}`);
  if (t.section !== "A" && t.section !== "B") fail(`Section must be A or B on ${id}`);
  if (!Number.isInteger(t.n) || (t.n as number) < 1 || (t.n as number) > 12) fail(`Bad number on ${id}`);
  if (!isText(t.text, 600) || !isText(t.theme, 80)) fail(`An essay topic needs its text and a theme (${id})`);
  if (!Array.isArray(t.sources) || t.sources.length === 0) fail(`Say where ${id}'s wording was checked`);
  (t.sources as unknown[]).forEach((s) => checkSource(s, id));
  if (t.decode !== undefined) {
    const d = obj(t.decode);
    if (!d || !isText(d.asks, 600) || !isTexts(d.keywords, 60, 12)) fail(`Bad breakdown on ${id}`);
    const angles = d.angles as unknown;
    if (
      !Array.isArray(angles) ||
      angles.length !== 6 ||
      !angles.every((a) => isText(obj(a)?.k, 40) && isText(obj(a)?.v, 300))
    )
      fail(`A breakdown needs six angles (${id})`);
    if (new Set(angles.map((a) => (a as { k: string }).k)).size !== 6) fail(`Angle names repeat on ${id}`);
    if (angles.some((a) => (a as { k: string }).k === OTHER_SIDE))
      fail(`"${OTHER_SIDE}" is kept for the outline (${id})`);
    const notes = d.notes as unknown;
    if (!Array.isArray(notes) || !notes.every((n) => isContentId(obj(n)?.id) && isText(obj(n)?.why, 400)))
      fail(`Bad evidence from notes on ${id}`);
  }
  return t as unknown as EssayTopic;
}

export function validateEthicsCase(x: unknown): EthicsCase {
  const c = obj(x);
  if (!c) fail("Not a case");
  if (!isContentId(c.id)) fail("Bad case id");
  const id = c.id as string;
  if (!Number.isInteger(c.n) || (c.n as number) < 1) fail(`Bad number on ${id}`);
  if (c.by !== "claude" && c.by !== "upsc") fail(`Say who wrote ${id}: claude or upsc`);
  if (c.by === "upsc" && !Number.isInteger(c.year)) fail(`A UPSC case needs its year (${id})`);
  for (const f of ["title", "setting", "you", "clash"] as const) if (!isText(c[f], 160)) fail(`No ${f} on ${id}`);
  if (!isTexts(c.values, 40, 8) || !(c.values as string[]).length) fail(`Name the values in tension (${id})`);
  if (c.text !== undefined && (!isTexts(c.text, 2000, 12) || !(c.text as string[]).length))
    fail(`Bad case text on ${id}`);
  if (c.asks !== undefined && !isTexts(c.asks, 400, 6)) fail(`Bad questions on ${id}`);
  if (!Array.isArray(c.laws)) fail(`List the laws ${id} cites (an empty list when none)`);
  for (const l of c.laws as unknown[]) {
    const law = obj(l);
    if (!law || !isText(law.cite, 300)) fail(`Bad law on ${id}`);
    const src = checkSource(law.source, id);
    if (!isOfficial(src.url)) fail(`Check "${String(law.cite)}" against an official source, or leave it out (${id})`);
  }
  if (c.key !== undefined) {
    if (!c.text) fail(`A key needs the full case (${id})`);
    const k = obj(c.key);
    if (!k) fail(`Bad key on ${id}`);
    const st = k.stakeholders as unknown;
    if (
      !Array.isArray(st) ||
      st.length < 2 ||
      !st.every((s) => isText(obj(s)?.t, 120) && typeof obj(s)?.key === "boolean")
    )
      fail(`Bad stakeholders on ${id}`);
    const is = k.issues as unknown;
    if (
      !Array.isArray(is) ||
      is.length < 2 ||
      !is.every((s) => isText(obj(s)?.k, 60) && isText(obj(s)?.v, 300) && typeof obj(s)?.central === "boolean")
    )
      fail(`Bad issues on ${id}`);
    const op = k.options as unknown;
    if (
      !Array.isArray(op) ||
      op.length < 2 ||
      op.length > 8 ||
      !op.every(
        (o) =>
          isText(obj(o)?.t, 300) &&
          isText(obj(o)?.pro, 300) &&
          isText(obj(o)?.con, 300) &&
          VERDICTS.includes(obj(o)?.verdict as Verdict),
      )
    )
      fail(`Bad options on ${id}`);
    if (!isText(k.decision, 2000) || !isText(k.system, 1000)) fail(`A key needs a decision and a fix (${id})`);
  }
  return c as unknown as EthicsCase;
}

export function validateMedicalLine(x: unknown): MedicalLine {
  const l = obj(x);
  if (!l) fail("Not a syllabus line");
  if (!isContentId(l.id)) fail("Bad line id");
  const id = l.id as string;
  if (l.paper !== "I" && l.paper !== "II") fail(`Paper must be I or II on ${id}`);
  if (!isText(l.subject, 80) || !isText(l.label, 160) || !isText(l.syllabus, 2000)) fail(`Bad line ${id}`);
  if (!Number.isInteger(l.order) || (l.order as number) < 1) fail(`Bad order on ${id}`);
  if (l.pyqs !== undefined) {
    const p = obj(l.pyqs);
    if (!p || ![p.count, p.marks, p.secondary].every((n) => Number.isInteger(n) && (n as number) >= 0))
      fail(`Bad PYQ counts on ${id}`);
    if (p.last !== undefined && !Number.isInteger(p.last)) fail(`Bad last year on ${id}`);
    const items = p.items as unknown;
    if (
      !Array.isArray(items) ||
      !items.every((q) => {
        const o = obj(q);
        return (
          !!o &&
          typeof o.id === "string" &&
          Number.isInteger(o.year) &&
          (o.paper === "I" || o.paper === "II") &&
          Number.isInteger(o.marks) &&
          isText(o.text, 3000) &&
          typeof o.primary === "boolean"
        );
      })
    )
      fail(`Bad PYQs on ${id}`);
    if ((items as MedicalPyq[]).filter((q) => q.primary).length !== p.count)
      fail(`${id}'s PYQ count doesn't match its questions`);
  }
  const diagrams = l.diagrams as unknown;
  if (!Array.isArray(diagrams) || !diagrams.every((d) => isContentId(obj(d)?.id) && isText(obj(d)?.t, 160)))
    fail(`Bad diagrams on ${id}`);
  if (l.note !== undefined) {
    const n = obj(l.note);
    if (!n || (n.kind !== "dated" && n.kind !== "watch") || !isText(n.text, 1000) || typeof n.checked !== "boolean")
      fail(`Bad note on ${id}`);
    if (!Array.isArray(n.sources)) fail(`Bad note sources on ${id}`);
    (n.sources as unknown[]).forEach((s) => checkSource(s, id));
    if (n.checked && !(n.sources as Source[]).some((s) => isOfficial(s.url)))
      fail(`A checked note needs an official source (${id})`);
  }
  if (l.gs !== undefined) {
    const gs = l.gs as unknown;
    if (
      !Array.isArray(gs) ||
      !gs.every((g) => isText(obj(g)?.label, 80) && /^\/(?!\/)[A-Za-z0-9/_?=&.-]*$/.test(String(obj(g)?.to)))
    )
      fail(`Bad GS links on ${id}`);
  }
  return l as unknown as MedicalLine;
}

export const VALIDATE: { [K in ExtraKind]: (x: unknown) => ExtraContent[K] } = {
  essay: validateEssayTopic,
  ethics: validateEthicsCase,
  medical: validateMedicalLine,
};

/** Checks a whole import ({essay, ethics, medical}); ids must be unique within each kind. */
export function validateImport(x: unknown): { [K in ExtraKind]: ExtraContent[K][] } {
  const d = obj(x);
  if (!d) fail("Expected {essay: [], ethics: [], medical: []}");
  const out = { essay: [], ethics: [], medical: [] } as { [K in ExtraKind]: ExtraContent[K][] };
  for (const kind of EXTRA_KINDS) {
    const list = d[kind] ?? [];
    if (!Array.isArray(list)) fail(`${kind} must be a list`);
    const seen = new Set<string>();
    for (const item of list) {
      const v = VALIDATE[kind](item);
      if (seen.has(v.id)) fail(`${kind} ${v.id} appears twice`);
      seen.add(v.id);
      (out[kind] as unknown[]).push(v);
    }
  }
  return out;
}

// ---------- your records ----------

function checkOutline(x: unknown): EssayOutline {
  const o = obj(x);
  if (!o || typeof o.id !== "string" || !ID.test(o.id)) fail("Bad outline id");
  if (!isIso(o.at) || !isMs(o.ms)) fail("Bad outline time");
  for (const f of ["thesis", "opening", "closing"] as const) if (!isOptText(o[f], 600)) fail(`Bad ${f}`);
  const paras = o.paras as unknown;
  if (
    !Array.isArray(paras) ||
    paras.length !== OUTLINE_PARAS ||
    !paras.every((p) => {
      const q = obj(p);
      return !!q && isOptText(q.text, 600) && (q.angle === null || isText(q.angle, 40));
    })
  )
    fail(`An outline has ${OUTLINE_PARAS} paragraphs`);
  return o as unknown as EssayOutline;
}

function checkSitting(x: unknown): EssaySitting {
  const s = obj(x);
  if (!s || typeof s.id !== "string" || !ID.test(s.id)) fail("Bad sitting id");
  if (s.kind !== "essay" && s.kind !== "paper") fail("A sitting is an essay or a paper");
  if (!isIso(s.at) || !isMs(s.ms)) fail("Bad sitting time");
  if (s.topics !== undefined && (!Array.isArray(s.topics) || !s.topics.every(isContentId))) fail("Bad topics");
  return s as unknown as EssaySitting;
}

function checkAttempt(x: unknown): BenchAttempt {
  const a = obj(x);
  if (!a || typeof a.id !== "string" || !ID.test(a.id)) fail("Bad attempt id");
  if (!isIso(a.at) || !isIso(a.updated)) fail("Bad attempt time");
  if (!isTexts(a.stakeholders, 120, 30) || !isTexts(a.own, 120, 12) || !isTexts(a.issues, 60, 20))
    fail("Bad stakeholders or issues");
  const v = a.verdicts as unknown;
  if (!Array.isArray(v) || v.length > 8 || !v.every((x) => x === null || VERDICTS.includes(x as Verdict)))
    fail("Bad verdicts");
  if (!isOptText(a.decision, 3000) || !isOptText(a.system, 2000) || !isOptText(a.answer, 6000)) fail("Too long");
  if (a.answerMs !== undefined && !isMs(a.answerMs)) fail("Bad answer time");
  return a as unknown as BenchAttempt;
}

function checkDrill(x: unknown): DiagramDrill {
  const d = obj(x);
  if (!d || typeof d.id !== "string" || !ID.test(d.id)) fail("Bad drill id");
  if (!isContentId(d.diagram)) fail("Bad diagram");
  if (!isIso(d.at) || !isMs(d.ms)) fail("Bad drill time");
  return d as unknown as DiagramDrill;
}

const upsert = <T extends { id: string }>(list: T[], item: T): T[] => {
  const i = list.findIndex((x) => x.id === item.id);
  const next = i >= 0 ? list.map((x, j) => (j === i ? item : x)) : [...list, item];
  if (next.length > MAX_LIST) fail("Too many records; ask Claude to archive old ones");
  return next;
};

/**
 * Applies one change to your record for a topic, case or line. Adding a record that is already
 * there replaces it (a retried save can't count twice). Nothing is ever deleted.
 */
export function applyWorkOp<K extends ExtraKind>(
  kind: K,
  work: ExtraWork[K],
  op: WorkOp,
  now = new Date().toISOString(),
): ExtraWork[K] {
  if (!EXTRA_KINDS.includes(kind)) fail("Unknown kind");
  if (!op || !OPS_OF[kind].includes(op.op)) fail(`"${String(op?.op)}" doesn't apply to ${kind}`);
  switch (op.op) {
    case "try": {
      if (!isText(op.text, 3000)) fail("Write your own angles first");
      const w = work as EssayWork;
      return { ...w, tried: { text: op.text.trim(), at: w.tried?.at ?? now } } as ExtraWork[K];
    }
    case "outline": {
      const w = work as EssayWork;
      return { ...w, outlines: upsert(w.outlines ?? [], checkOutline(op.outline)) } as ExtraWork[K];
    }
    case "sitting": {
      const w = work as EssayWork;
      return { ...w, sittings: upsert(w.sittings ?? [], checkSitting(op.sitting)) } as ExtraWork[K];
    }
    case "attempt": {
      const w = work as EthicsWork;
      return { ...w, attempts: upsert(w.attempts ?? [], checkAttempt(op.attempt)) } as ExtraWork[K];
    }
    case "rate": {
      const w = work as MedicalWork;
      if (op.rating !== null && !RATINGS.includes(op.rating)) fail("Rate it Rusty, OK or Strong");
      const { rating: _r, ratedAt: _a, ...rest } = w;
      void _r;
      void _a;
      return (op.rating ? { ...rest, rating: op.rating, ratedAt: now } : rest) as ExtraWork[K];
    }
    case "drill": {
      const w = work as MedicalWork;
      return { ...w, drills: upsert(w.drills ?? [], checkDrill(op.drill)) } as ExtraWork[K];
    }
  }
}

// ---------- what the screens work out ----------

export interface OutlineVerdict {
  mark: "ok" | "partly" | "missing";
  text: string;
}

/** The sprint's check: a thesis, how many angles the paragraphs cover, the other side, and a closing. */
export function checkOutlineDraft(o: Pick<EssayOutline, "thesis" | "paras" | "closing">, angles: string[]) {
  const used = new Set(o.paras.filter((p) => p.angle && p.text.trim()).map((p) => p.angle!));
  const covered = angles.filter((a) => used.has(a));
  const missing = angles.filter((a) => !used.has(a));
  const out: OutlineVerdict[] = [];
  out.push(
    o.thesis.trim()
      ? { mark: "ok", text: "Your thesis takes a position." }
      : { mark: "missing", text: "No thesis yet. Write your answer to the topic in one line first." },
  );
  out.push({
    mark: covered.length >= Math.min(5, angles.length) ? "ok" : "partly",
    text:
      `${covered.length} of ${angles.length} angles covered.` +
      (missing.length ? ` Missing: ${missing.join(", ")}.` : ""),
  });
  out.push(
    used.has(OTHER_SIDE)
      ? { mark: "ok", text: "You argue the other side too." }
      : { mark: "missing", text: "No paragraph for the other side. Examiners look for balance." },
  );
  out.push(
    o.closing.trim()
      ? { mark: "ok", text: "You have a closing." }
      : { mark: "partly", text: "Add a closing that returns to your opening." },
  );
  return { verdicts: out, covered: covered.length, balance: used.has(OTHER_SIDE), closing: !!o.closing.trim() };
}

/** What each bench step needs before "Compare with mine" opens for it (steps 1–5). */
export function stepDone(step: number, a: BenchAttempt | undefined, options: number): boolean {
  if (!a) return false;
  switch (step) {
    case 1:
      return a.stakeholders.length + a.own.length > 0;
    case 2:
      return a.issues.length > 0;
    case 3:
      return a.verdicts.length >= options && a.verdicts.slice(0, options).every((v) => v !== null);
    case 4:
      return a.decision.trim().length > 0;
    case 5:
      return a.system.trim().length > 0;
    default:
      return false;
  }
}

/** Words in a typed answer. */
export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** The Claude column of the Medical Science table. */
export function medicalFlag(line: MedicalLine, work?: MedicalWork): { t: string; tone: "down" | "gold" | "up" } | null {
  if (line.note?.kind === "dated") return { t: "Syllabus dated", tone: "down" };
  if (line.note?.kind === "watch") return { t: "Check names", tone: "gold" };
  if (work?.drills.length) return { t: "Redraw due", tone: "up" };
  return null;
}

/** A diagram's drills, newest first. */
export const drillsOf = (work: MedicalWork | undefined, diagram: string) =>
  (work?.drills ?? []).filter((d) => d.diagram === diagram).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

// ---------- the Write flow's data (M8), read without knowing every field ----------

/** One marked answer, as far as these screens need it. */
export interface AnswerSummary {
  id: string;
  /** The note, essay topic, ethics case or syllabus line it answers, when the record says. */
  note?: string;
  essay?: string;
  ethics?: string;
  medical?: string;
  /** Out of 10, when marked. */
  score?: number;
  at?: string;
}

/** One Mains PYQ from the Write flow's question bank, as far as the notes table needs it. */
export interface QuestionSummary {
  note: string;
  year: number;
  text: string;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/**
 * Reads the Write flow's answer records (M8) loosely: the note or item each answers and its mark
 * out of 10. Fields are looked for under a few likely names; anything else is ignored.
 */
export function answerSummaries(raw: unknown[]): AnswerSummary[] {
  const out: AnswerSummary[] = [];
  for (const r of raw) {
    const a = obj(r);
    if (!a) continue;
    const q = obj(a.question) ?? {};
    const ref = obj(a.ref) ?? obj(a.for) ?? {};
    const marks = obj(a.marks) ?? obj(a.mark) ?? obj(a.marking) ?? {};
    const id = str(a.id);
    if (!id) continue;
    out.push({
      id,
      note: str(a.note) ?? str(a.noteId) ?? str(q.note) ?? str(q.noteId) ?? str(ref.note),
      essay: str(a.essay) ?? str(ref.essay) ?? str(q.essay),
      ethics: str(a.ethics) ?? str(ref.ethics) ?? str(q.ethics),
      medical: str(a.medical) ?? str(ref.medical) ?? str(q.medical),
      score: num(a.score) ?? num(marks.total) ?? num(marks.score) ?? num(a.total),
      at: str(a.at) ?? str(a.createdAt) ?? str(a.submittedAt) ?? str(a.date),
    });
  }
  return out;
}

/** Reads the Write flow's question bank (M8) loosely: Mains PYQs that name their note and year. */
export function questionSummaries(raw: unknown[]): QuestionSummary[] {
  const out: QuestionSummary[] = [];
  const add = (x: unknown) => {
    const q = obj(x);
    if (!q) return;
    const note = str(q.note) ?? str(q.noteId) ?? (Array.isArray(q.notes) ? str(q.notes[0]) : undefined);
    const year = num(q.year) ?? num(obj(q.source)?.year);
    const text = str(q.text) ?? str(q.question) ?? str(q.stem);
    if (note && year && text) out.push({ note, year, text });
  };
  for (const r of raw) {
    const b = obj(r);
    if (b && Array.isArray(b.questions)) b.questions.forEach(add);
    else if (Array.isArray(r)) r.forEach(add);
    else add(r);
  }
  return out;
}

/** Count and average mark of the answers that match. */
export function answerStats(list: AnswerSummary[], match: (a: AnswerSummary) => boolean) {
  const mine = list.filter(match);
  const scored = mine.filter((a) => a.score !== undefined);
  const avg = scored.length ? scored.reduce((n, a) => n + a.score!, 0) / scored.length : undefined;
  return { count: mine.length, avg: avg === undefined ? undefined : Math.round(avg * 10) / 10 };
}

// ---------- the M8 Write flow's links ----------

export const writeLink = (kind: ExtraKind, id: string) => `/mains/write?${kind}=${encodeURIComponent(id)}`;

// ---------- what a written note says about itself (the Mains Notes table) ----------

/**
 * A note's lead (its first paragraph) and its open checks: the unticked items under an "Open
 * checks" heading (docs/CONTENT_CONVENTIONS.md, "Sources and open checks").
 */
export function noteFacts(blocks: Block[]): { lead: string; open: string[]; closed: number } {
  let lead = "";
  const open: string[] = [];
  let closed = 0;
  let inChecks = 0; // the heading level of the open-checks section, 0 outside it
  for (const b of blocks) {
    if (b.type === "heading") {
      const level = Number(b.props?.level ?? 1);
      if (inChecks && level <= inChecks) inChecks = 0;
      if (/open checks/i.test(blockText(b))) inChecks = level;
      continue;
    }
    if (!lead && b.type === "paragraph" && blockText(b).trim()) lead = blockText(b).trim();
    if (inChecks && b.type === "checkListItem") {
      if (b.props?.checked) closed++;
      else if (blockText(b).trim()) open.push(blockText(b).trim());
    }
  }
  return { lead: lead.length > 420 ? lead.slice(0, 417).trimEnd() + "…" : lead, open, closed };
}

/** The heat tint for a PYQ count (0–3). */
export const heatLevel = (n: number) => (n >= 8 ? 3 : n >= 5 ? 2 : n >= 2 ? 1 : 0);
