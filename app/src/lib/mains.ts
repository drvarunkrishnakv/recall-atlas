// Mains answers: the questions you write on, the answers you write on paper and photograph, and
// Claude's marking. Pure, and shared by the app, the CLI and Claude's scheduled marking run
// (docs/routines/mark-answers.md).
//
//   mainsq/{paper}                     {json: QuestionSet}  one paper's questions; the CLI writes it
//   answers/{id}                       {json: MainsAnswer}  one answer: times, pages, self-score,
//                                                           transcript, marking, disputes, rewrites
//   Storage answers/{id}/page-{n}.jpg  the page photos (dev files: content/mains/photos/<id>/)
//
// An answer is a draft while you write and photograph it, waiting once you send it, and marked
// when Claude's next run has marked it (disputed while an "I disagree" waits for an answer).
// Marking is never instant: it happens on the next scheduled run.

// ---------- Papers and questions ----------

export const MAINS_PAPERS = ["GS1", "GS2", "GS3", "GS4", "Essay", "Med1", "Med2"] as const;
export type MainsPaper = (typeof MAINS_PAPERS)[number];
export const PAPER_LABEL: Record<MainsPaper, string> = {
  GS1: "GS1",
  GS2: "GS2",
  GS3: "GS3",
  GS4: "GS4",
  Essay: "Essay",
  Med1: "Medical Science I",
  Med2: "Medical Science II",
};
/** Short names for chips and table cells. */
export const PAPER_SHORT: Record<MainsPaper, string> = { ...PAPER_LABEL, Med1: "Med I", Med2: "Med II" };

export interface MainsQuestion {
  /** e.g. "gs2-2020-cdb9678b"; lower case, digits and dashes. */
  id: string;
  paper: MainsPaper;
  marks: number;
  /** The word limit. */
  words: number;
  /** True when the source gave no marks or word limit, so the defaults were used. */
  marksAssumed?: boolean;
  text: string;
  /** "It asks for": the parts of the question and what each one wants. */
  asksFor: string[];
  /** The GS subject, e.g. "Polity". */
  subject?: string;
  /** The syllabus topic or microtheme, e.g. "Parliament". */
  topic: string;
  /** The year it was asked (PYQs). */
  year?: number;
  source: "pyq" | "claude";
  /** The note it draws on, e.g. "P18". */
  note?: string;
}

/** One paper's questions, as stored. */
export interface QuestionSet {
  paper: MainsPaper;
  questions: MainsQuestion[];
}

// ---------- Answers ----------

export type AnswerStatus = "draft" | "waiting" | "marked" | "disputed";

/** Photo types the app accepts, and the file extension each is stored under. */
export const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type PhotoType = keyof typeof PHOTO_TYPES;
/** The largest photo the dev API and Storage accept (the app shrinks photos well below this). */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const MAX_PAGES = 3;
/** A stored photo's file name: `page-1.jpg`…`page-9.webp`, or `rewrite-1.jpg`… for rewrites. */
export const PHOTO_FILE = /^(page|rewrite)-[1-9]\.(jpg|png|webp)$/;

export interface AnswerPage {
  file: string;
  type: PhotoType;
  /** When it was (last) uploaded; also busts the image cache after a re-upload. */
  at: string;
}

/** What the answer was set as, kept with it so it survives a re-import of the questions. */
export interface QuestionRef {
  id: string;
  paper: MainsPaper;
  text: string;
  topic: string;
  year?: number;
  marks: number;
  words: number;
  note?: string;
}

export interface AnswerTimes {
  /** The optional plan before writing. */
  planMs: number;
  /** From the start of the timer to "I'm done". */
  writeMs: number;
  /** Time past the limit (0 when inside it). */
  overtimeMs: number;
  /** The time allowed (7 min for a 10-marker, 11 for a 15-marker). */
  limitMs: number;
}

export interface Transcript {
  /** What Claude read off the photos. */
  text: string;
  /** Words or phrases Claude wasn't sure of; the app highlights them. */
  unsure: string[];
  /** Your corrected version, when you fixed a misreading. */
  corrected?: string;
  correctedAt?: string;
}

export interface MainsAnswer {
  id: string;
  question: QuestionRef;
  status: AnswerStatus;
  createdAt: string;
  submittedAt?: string;
  /** Your 1-minute plan, one point per line. */
  plan: string[];
  times: AnswerTimes;
  /** The page photos, in page order (1–3). */
  pages: AnswerPage[];
  /** Your own score out of 10, given before you see the marks. */
  selfScore?: number;
  /** What you thought you missed. */
  selfMissed: string[];
  transcript?: Transcript;
  marking?: Marking;
  disputes: Dispute[];
  rewrites: Rewrite[];
}

// ---------- Marking ----------

/** The checklist out of 10 (agreed 2026-10-20). */
export const CHECKLIST = [
  { key: "demand", label: "Demand", max: 2 },
  { key: "structure", label: "Structure", max: 1.5 },
  { key: "dimensions", label: "Dimensions", max: 2 },
  { key: "evidence", label: "Evidence", max: 2 },
  { key: "current", label: "Current link", max: 1 },
  { key: "presentation", label: "Presentation", max: 1 },
  { key: "length", label: "Length", max: 0.5 },
] as const;
export type ChecklistKey = (typeof CHECKLIST)[number]["key"];
export const CHECKLIST_KEYS = CHECKLIST.map((c) => c.key) as ChecklistKey[];
export const ITEM: Record<ChecklistKey, { label: string; max: number }> = Object.fromEntries(
  CHECKLIST.map((c) => [c.key, { label: c.label, max: c.max }]),
) as Record<ChecklistKey, { label: string; max: number }>;

export interface ChecklistMark {
  key: ChecklistKey;
  got: number;
  why: string;
}

/** Examiner's comments, in pen colours: green for strong and good, red for to fix and missing. */
export const COMMENT_KINDS = ["strong", "good", "fix", "missing"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];
export const KIND_LABEL: Record<CommentKind, string> = {
  strong: "Strong",
  good: "Good",
  fix: "To fix",
  missing: "Missing",
};

/** A comment pinned to a place on a page photo. */
export interface PinnedComment {
  /** Which page (1 = the first photo). */
  page: number;
  /** How far down that page, from 0 (top) to 1 (bottom). */
  y: number;
  kind: CommentKind;
  text: string;
  /** The note it draws on, if any. */
  note?: string;
}

export interface FixItem {
  item: ChecklistKey;
  /** Marks it would have added. */
  gain: number;
  text: string;
}

export interface OutlinePoint {
  h: string;
  p: string;
}

/** "From your notes, you could have used…": a fact from one of your notes, and what it would lift. */
export interface FromNote {
  fact: string;
  note: string;
  item: ChecklistKey;
}

/** The weakest part, to rewrite on its own. */
export interface RewritePrompt {
  item: ChecklistKey;
  /** e.g. "Implications". */
  part: string;
  words: number;
  minutes: number;
  /** What the rewrite should do, in a line. */
  hint: string;
}

export interface Marking {
  /** The sum of the checklist (filled in when it is saved). */
  score: number;
  checklist: ChecklistMark[];
  comments: PinnedComment[];
  keep: string[];
  fix: FixItem[];
  /** A stronger outline, shown only when you ask for it. */
  outline: OutlinePoint[];
  fromNotes: FromNote[];
  tags: FixTagMark[];
  rewrite?: RewritePrompt;
  /** Which scheduled run marked it, e.g. "2026-10-21 evening". */
  run: string;
  markedAt: string;
}

/** Recurring weaknesses, each tied to the checklist item it costs. */
export const FIX_TAGS = {
  "missed-demand": {
    label: "Missed the demand",
    item: "demand",
    what: "Part of the question went unanswered.",
    drill: "Underline the directive words in 5 PYQs and say what each part asks.",
  },
  "thin-dimensions": {
    label: "Thin dimensions",
    item: "dimensions",
    what: "One or two angles where the question needs four or five.",
    drill: "Plan only: 3 PYQs, 1 minute each. List five angles and write nothing else.",
  },
  "no-example": {
    label: "No example",
    item: "evidence",
    what: "A claim with no named case, place or scheme.",
    drill: "For 3 PYQs, find one example each in your notes.",
  },
  "no-figures": {
    label: "No figures",
    item: "evidence",
    what: "No number where a number exists.",
    drill: "For 3 PYQs, find one figure each in your notes.",
  },
  "weak-intro": {
    label: "Weak introduction",
    item: "structure",
    what: "The opening repeats the question instead of setting it up.",
    drill: "Write only the first two lines for 3 PYQs: a fact, a definition or the context.",
  },
  "weak-conclusion": {
    label: "Weak conclusion",
    item: "structure",
    what: "The answer stops instead of ending.",
    drill: "Write only the conclusion for 3 old answers, two lines each.",
  },
  "no-current-link": {
    label: "No current link",
    item: "current",
    what: "Nothing from the last two years.",
    drill: "For 3 PYQs, find one development from the last two years in your notes.",
  },
  "no-diagram": {
    label: "No diagram",
    item: "presentation",
    what: "A table or diagram would have said it faster.",
    drill: "Turn the key points of 2 answers into a quick table.",
  },
  "hard-to-scan": {
    label: "Hard to scan",
    item: "presentation",
    what: "No headings or underlining, so the examiner has to hunt for your points.",
    drill: "Add headings to 2 old answers so each point can be found at a glance.",
  },
  "too-short": {
    label: "Too short",
    item: "length",
    what: "Well under the word limit.",
    drill: "One PYQ, 150 words in 7 minutes. Count before you send.",
  },
  "too-long": {
    label: "Too long",
    item: "length",
    what: "Well over the word limit, which takes time from the next question.",
    drill: "One PYQ in 150 words. Cut your plan to four points first.",
  },
} as const satisfies Record<string, { label: string; item: ChecklistKey; what: string; drill: string }>;
export type FixTagId = keyof typeof FIX_TAGS;
export const FIX_TAG_IDS = Object.keys(FIX_TAGS) as FixTagId[];

export interface FixTagMark {
  tag: FixTagId;
  /** What it was this time, e.g. "Only the UK model; no Deputy Speaker". */
  note: string;
  /** Marks it cost, when the marker gives it; otherwise the shortfall on its checklist item. */
  lost?: number;
}

export type DisputeItem = ChecklistKey | "transcript";
export interface Dispute {
  id: string;
  /** The checklist item you disagree with, or "transcript" for a corrected reading. */
  item: DisputeItem;
  text: string;
  at: string;
  status: "open" | "changed" | "kept";
  /** Claude's answer after looking again. */
  reply?: string;
  /** The item whose mark changed (the disputed one, or the one a corrected reading moved). */
  changedItem?: ChecklistKey;
  from?: number;
  to?: number;
  resolvedAt?: string;
}

/** A rewrite of one part, marked on its own and logged beside the original; the score stays. */
export interface Rewrite {
  id: string;
  at: string;
  item: ChecklistKey;
  part: string;
  page: AnswerPage;
  ms: number;
  status: "waiting" | "marked";
  verdict?: string;
  better?: boolean;
  markedAt?: string;
  run?: string;
}

/** What you can say you missed, before you see the marks. */
export const SELF_MISSED = ["The demand", "Dimensions", "Evidence", "Structure", "Way forward", "Length"] as const;

// ---------- Changes ----------

/** Changes the app makes. */
export type AppAnswerOp =
  | { op: "create"; answer: MainsAnswer }
  | { op: "addPage"; page: AnswerPage }
  /** Reorder or remove pages: the files to keep, in order. */
  | { op: "pages"; files: string[] }
  | { op: "draft"; plan: string[]; times: AnswerTimes; marks?: number; words?: number }
  | { op: "submit"; selfScore: number; selfMissed: string[]; at: string }
  | { op: "transcript"; text: string; at: string; disputeId: string }
  | { op: "dispute"; dispute: { id: string; item: DisputeItem; text: string; at: string } }
  | { op: "rewrite"; rewrite: Omit<Rewrite, "status" | "verdict" | "better" | "markedAt" | "run"> };

/** Changes only Claude's CLI makes. */
export type ClaudeAnswerOp =
  | { op: "mark"; marking: Omit<Marking, "score"> & { score?: number }; transcript: Transcript; again?: boolean }
  | {
      op: "resolve";
      disputeId: string;
      outcome: "changed" | "kept";
      reason: string;
      points?: number;
      /** For a corrected reading: the item whose mark changes. */
      item?: ChecklistKey;
      at: string;
    }
  | { op: "markRewrite"; rewriteId: string; verdict: string; better: boolean; run: string; at: string };

export type AnswerOp = AppAnswerOp | ClaudeAnswerOp;
export const APP_OPS: readonly AppAnswerOp["op"][] = [
  "create",
  "addPage",
  "pages",
  "draft",
  "submit",
  "transcript",
  "dispute",
  "rewrite",
];

export class MainsError extends Error {}

function fail(what: string): never {
  throw new MainsError(what);
}

const QID = /^[a-z0-9][a-z0-9-]{0,80}$/;
const AID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const NOTE = /^[A-Za-z0-9][A-Za-z0-9-]{0,80}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_MS = 6 * 60 * 60 * 1000;

const isText = (v: unknown, max = 5000): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const isTexts = (v: unknown, n: number, max: number): v is string[] =>
  Array.isArray(v) && v.length <= n && v.every((s) => isText(s, max));
const isIso = (v: unknown): v is string => typeof v === "string" && ISO.test(v) && !Number.isNaN(Date.parse(v));
const isMs = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_MS;
/** Marks come in quarters at the finest. */
const isMarks = (v: unknown, max: number) =>
  typeof v === "number" && v >= 0 && v <= max && Number.isInteger(Math.round(v * 4 * 1e6) / 1e6);
const isKey = (v: unknown): v is ChecklistKey => CHECKLIST_KEYS.includes(v as ChecklistKey);
export const isAnswerId = (v: unknown): v is string => typeof v === "string" && AID.test(v);
export const isPaper = (v: unknown): v is MainsPaper => MAINS_PAPERS.includes(v as MainsPaper);

/** Checks a question (read from a set or about to be imported) and returns it typed. */
export function validateQuestion(x: unknown): MainsQuestion {
  const q = x as Partial<Record<string, unknown>> | null;
  if (!q || typeof q !== "object") fail("Not a question");
  if (typeof q.id !== "string" || !QID.test(q.id)) fail(`Bad question id ${String(q.id)}`);
  if (!isPaper(q.paper)) fail(`Bad paper on ${q.id}`);
  if (typeof q.marks !== "number" || !(q.marks > 0) || q.marks > 250) fail(`Bad marks on ${q.id}`);
  if (!Number.isInteger(q.words) || (q.words as number) < 20 || (q.words as number) > 3000)
    fail(`Bad word limit on ${q.id}`);
  if (q.marksAssumed !== undefined && typeof q.marksAssumed !== "boolean") fail(`Bad marksAssumed on ${q.id}`);
  if (!isText(q.text, 4000)) fail(`No question text on ${q.id}`);
  if (!isTexts(q.asksFor, 8, 300)) fail(`Bad "It asks for" on ${q.id}`);
  if (q.subject !== undefined && !isText(q.subject, 80)) fail(`Bad subject on ${q.id}`);
  if (!isText(q.topic, 160)) fail(`No topic on ${q.id}`);
  if (q.source !== "pyq" && q.source !== "claude") fail(`Bad source on ${q.id}`);
  if (q.year !== undefined && (!Number.isInteger(q.year) || (q.year as number) < 1979 || (q.year as number) > 2100))
    fail(`Bad year on ${q.id}`);
  if (q.source === "pyq" && q.year === undefined) fail(`A PYQ needs its year (${q.id})`);
  if (q.note !== undefined && (typeof q.note !== "string" || !NOTE.test(q.note))) fail(`Bad note on ${q.id}`);
  return q as unknown as MainsQuestion;
}

/** Checks a paper's set: every question valid, on that paper, and listed once. */
export function validateQuestionSet(x: unknown): QuestionSet {
  const s = x as Partial<Record<string, unknown>> | null;
  if (!s || typeof s !== "object" || !isPaper(s.paper)) fail("Not a question set");
  if (!Array.isArray(s.questions)) fail(`Set ${s.paper} has no questions`);
  const seen = new Set<string>();
  for (const x of s.questions as unknown[]) {
    const q = validateQuestion(x);
    if (q.paper !== s.paper) fail(`Question ${q.id} is ${q.paper}, but it is in the ${s.paper} set`);
    if (seen.has(q.id)) fail(`Question ${q.id} appears twice`);
    seen.add(q.id);
  }
  return s as unknown as QuestionSet;
}

/** Groups questions into one set per paper (for `mains-import`), checking each. */
export function groupQuestions(questions: unknown[]): QuestionSet[] {
  const by = new Map<MainsPaper, MainsQuestion[]>();
  for (const x of questions) {
    const q = validateQuestion(x);
    by.set(q.paper, [...(by.get(q.paper) ?? []), q]);
  }
  return MAINS_PAPERS.filter((p) => by.has(p)).map((paper) => validateQuestionSet({ paper, questions: by.get(paper) }));
}

/** Adds or updates questions by id in existing sets (an import without --replace). */
export function mergeQuestionSets(current: QuestionSet[], incoming: QuestionSet[]): QuestionSet[] {
  const out = new Map(current.map((s) => [s.paper, s]));
  for (const s of incoming) {
    const now = new Map((out.get(s.paper)?.questions ?? []).map((q) => [q.id, q]));
    for (const q of s.questions) now.set(q.id, q);
    out.set(s.paper, { paper: s.paper, questions: [...now.values()] });
  }
  return MAINS_PAPERS.filter((p) => out.has(p)).map((p) => out.get(p)!);
}

function checkPage(p: unknown, what = "page"): AnswerPage {
  const page = p as Partial<Record<string, unknown>> | null;
  if (!page || typeof page.file !== "string" || !PHOTO_FILE.test(page.file)) fail(`Bad ${what} file`);
  if (!Object.hasOwn(PHOTO_TYPES, String(page.type))) fail(`Bad ${what} type`);
  if (!page.file.endsWith("." + PHOTO_TYPES[page.type as PhotoType])) fail(`The ${what} file doesn't match its type`);
  if (!isIso(page.at)) fail(`Bad ${what} time`);
  return page as unknown as AnswerPage;
}

function checkTimes(t: unknown): AnswerTimes {
  const times = t as Partial<Record<string, unknown>> | null;
  if (!times || ![times.planMs, times.writeMs, times.overtimeMs, times.limitMs].every(isMs)) fail("Bad times");
  return times as unknown as AnswerTimes;
}

function checkRef(r: unknown): QuestionRef {
  const q = r as Partial<Record<string, unknown>> | null;
  if (!q || typeof q.id !== "string" || !QID.test(q.id)) fail("Bad question on the answer");
  if (!isPaper(q.paper) || !isText(q.text, 4000) || !isText(q.topic, 160)) fail("Bad question on the answer");
  if (typeof q.marks !== "number" || !(q.marks > 0) || q.marks > 250) fail("Bad marks on the answer");
  if (!Number.isInteger(q.words) || (q.words as number) < 20 || (q.words as number) > 3000)
    fail("Bad word limit on the answer");
  if (q.year !== undefined && !Number.isInteger(q.year)) fail("Bad year on the answer");
  if (q.note !== undefined && (typeof q.note !== "string" || !NOTE.test(q.note))) fail("Bad note on the answer");
  return q as unknown as QuestionRef;
}

const isScore = (v: unknown) => isMarks(v, 10) && Number.isInteger((v as number) * 2);

/** Checks a whole answer, as read from a file or Firestore, or created by the app. */
export function validateAnswer(x: unknown): MainsAnswer {
  const a = x as Partial<Record<string, unknown>> | null;
  if (!a || typeof a !== "object") fail("Not an answer");
  if (!isAnswerId(a.id)) fail("Bad answer id");
  checkRef(a.question);
  if (!["draft", "waiting", "marked", "disputed"].includes(a.status as string)) fail("Bad status");
  if (!isIso(a.createdAt)) fail("Bad creation time");
  if (a.submittedAt !== undefined && !isIso(a.submittedAt)) fail("Bad sending time");
  if (!isTexts(a.plan, 12, 200)) fail("Bad plan");
  checkTimes(a.times);
  if (!Array.isArray(a.pages) || a.pages.length > MAX_PAGES) fail(`An answer has 1 to ${MAX_PAGES} pages`);
  (a.pages as unknown[]).forEach((p) => checkPage(p));
  if (new Set((a.pages as AnswerPage[]).map((p) => p.file)).size !== a.pages.length) fail("A page appears twice");
  if (a.selfScore !== undefined && !isScore(a.selfScore)) fail("Your score is out of 10, in halves");
  if (!isTexts(a.selfMissed, 10, 80)) fail("Bad 'missed' list");
  if (a.transcript !== undefined) checkTranscript(a.transcript);
  if (a.marking !== undefined) checkMarking(a.marking, (a.pages as unknown[]).length);
  if (!Array.isArray(a.disputes) || !Array.isArray(a.rewrites)) fail("Bad disputes or rewrites");
  for (const d of a.disputes as Partial<Dispute>[]) {
    if (!isAnswerId(d?.id) || !(isKey(d.item) || d.item === "transcript") || !isText(d.text, 1000) || !isIso(d.at))
      fail("Bad dispute");
    if (!["open", "changed", "kept"].includes(d.status as string)) fail("Bad dispute status");
  }
  for (const r of a.rewrites as Partial<Rewrite>[]) {
    if (!isAnswerId(r?.id) || !isIso(r.at) || !isKey(r.item) || !isText(r.part, 80) || !isMs(r.ms)) fail("Bad rewrite");
    checkPage(r.page, "rewrite");
    if (r.status !== "waiting" && r.status !== "marked") fail("Bad rewrite status");
  }
  return a as unknown as MainsAnswer;
}

function checkTranscript(t: unknown): Transcript {
  const tr = t as Partial<Record<string, unknown>> | null;
  if (!tr || !isText(tr.text, 20000)) fail("A transcript needs its text");
  if (!Array.isArray(tr.unsure) || tr.unsure.length > 40 || !tr.unsure.every((w) => isText(w, 80)))
    fail("Bad unsure words");
  if (tr.corrected !== undefined && !isText(tr.corrected, 20000)) fail("Bad corrected transcript");
  return tr as unknown as Transcript;
}

/** Checks a marking against the checklist and an answer's page count; fills in the score. */
export function checkMarking(m: unknown, pages: number): Marking {
  const mk = m as Partial<Record<string, unknown>> | null;
  if (!mk || typeof mk !== "object") fail("Not a marking");
  const list = mk.checklist as Partial<ChecklistMark>[];
  if (!Array.isArray(list) || list.length !== CHECKLIST.length) fail("The checklist needs all 7 items, in order");
  list.forEach((c, i) => {
    const want = CHECKLIST[i];
    if (c?.key !== want.key) fail(`Checklist item ${i + 1} should be ${want.key}`);
    if (!isMarks(c.got, want.max)) fail(`${want.label}: marks must be 0–${want.max}, in quarters`);
    if (!isText(c.why, 500)) fail(`${want.label}: say why`);
  });
  const sum = Math.round(list.reduce((n, c) => n + (c.got as number), 0) * 100) / 100;
  if (mk.score !== undefined && Math.abs((mk.score as number) - sum) > 0.001)
    fail(`The score (${String(mk.score)}) isn't the checklist's sum (${sum})`);
  const comments = mk.comments as Partial<PinnedComment>[];
  if (!Array.isArray(comments) || comments.length > 30) fail("Bad comments");
  for (const c of comments) {
    if (!Number.isInteger(c?.page) || (c.page as number) < 1 || (c.page as number) > Math.max(pages, 1))
      fail(`A comment is pinned to page ${String(c?.page)}, but the answer has ${pages}`);
    if (typeof c.y !== "number" || c.y < 0 || c.y > 1) fail("A comment's y must be 0–1");
    if (!COMMENT_KINDS.includes(c.kind as CommentKind)) fail("Bad comment kind");
    if (!isText(c.text, 600)) fail("A comment needs its text");
    if (c.note !== undefined && (typeof c.note !== "string" || !NOTE.test(c.note))) fail("Bad note on a comment");
  }
  if (!isTexts(mk.keep, 8, 400)) fail("Bad keep list");
  const fix = mk.fix as Partial<FixItem>[];
  if (!Array.isArray(fix) || fix.length > 8) fail("Bad fix list");
  for (const f of fix)
    if (!isKey(f?.item) || !isMarks(f.gain, ITEM[f.item].max) || !isText(f.text, 400)) fail("Bad fix item");
  const outline = mk.outline as Partial<OutlinePoint>[];
  if (!Array.isArray(outline) || outline.length > 12 || !outline.every((o) => isText(o?.h, 80) && isText(o.p, 600)))
    fail("Bad outline");
  const notes = mk.fromNotes as Partial<FromNote>[];
  if (!Array.isArray(notes) || notes.length > 10) fail("Bad 'from your notes' list");
  for (const n of notes)
    if (!isText(n?.fact, 400) || typeof n.note !== "string" || !NOTE.test(n.note) || !isKey(n.item))
      fail("Each 'from your notes' item needs a fact, a note id and the checklist item it lifts");
  const tags = mk.tags as Partial<FixTagMark>[];
  if (!Array.isArray(tags) || tags.length > 6) fail("Bad fix tags");
  for (const t of tags) {
    if (!Object.hasOwn(FIX_TAGS, String(t?.tag))) fail(`Unknown fix tag ${String(t?.tag)}`);
    if (!isText(t.note, 300)) fail(`Tag ${String(t.tag)} needs a note`);
    if (t.lost !== undefined && !isMarks(t.lost, 10)) fail(`Bad marks lost on ${String(t.tag)}`);
  }
  if (new Set(tags.map((t) => t.tag)).size !== tags.length) fail("A fix tag appears twice");
  if (mk.rewrite !== undefined) {
    const r = mk.rewrite as Partial<RewritePrompt>;
    if (!isKey(r?.item) || !isText(r.part, 80) || !isText(r.hint, 400)) fail("Bad rewrite prompt");
    if (!Number.isInteger(r.words) || (r.words as number) < 10 || (r.words as number) > 400) fail("Bad rewrite length");
    if (!Number.isInteger(r.minutes) || (r.minutes as number) < 1 || (r.minutes as number) > 15)
      fail("Bad rewrite time");
  }
  if (!isText(mk.run, 60)) fail("Say which run marked it");
  if (!isIso(mk.markedAt)) fail("Bad marking time");
  return { ...(mk as unknown as Marking), score: sum };
}

/** What an answer's status follows from. */
export function statusOf(a: Pick<MainsAnswer, "submittedAt" | "marking" | "disputes">): AnswerStatus {
  if (!a.submittedAt) return "draft";
  if (!a.marking) return "waiting";
  return a.disputes.some((d) => d.status === "open") ? "disputed" : "marked";
}

const withStatus = (a: MainsAnswer): MainsAnswer => ({ ...a, status: statusOf(a) });
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Applies one change to an answer (null when it doesn't exist yet). Repeating a change that is
 * already there (the same page, dispute or rewrite id) does nothing, so a retried save can't
 * add it twice.
 */
export function applyAnswerOp(a: MainsAnswer | null, op: AnswerOp): MainsAnswer {
  if (op.op === "create") {
    if (a) return a;
    const fresh = validateAnswer(op.answer);
    if (
      fresh.status !== "draft" ||
      fresh.submittedAt ||
      fresh.marking ||
      fresh.disputes.length ||
      fresh.rewrites.length
    )
      fail("A new answer starts as a draft");
    return fresh;
  }
  if (!a) fail("No such answer");
  const draftOnly = () => a.status === "draft" || fail("This answer has been sent; its pages can't change now");
  const markedOnly = () => a.marking || fail("This answer hasn't been marked yet");
  switch (op.op) {
    case "addPage": {
      draftOnly();
      const page = checkPage(op.page);
      const at = a.pages.findIndex((p) => p.file === page.file);
      if (at >= 0) return { ...a, pages: a.pages.map((p, i) => (i === at ? page : p)) };
      if (a.pages.length >= MAX_PAGES) fail(`Up to ${MAX_PAGES} pages`);
      return { ...a, pages: [...a.pages, page] };
    }
    case "pages": {
      draftOnly();
      if (!Array.isArray(op.files) || new Set(op.files).size !== op.files.length) fail("Bad page order");
      const pages = op.files.map((f) => a.pages.find((p) => p.file === f) ?? fail(`No page ${f}`));
      return { ...a, pages };
    }
    case "draft": {
      draftOnly();
      if (!isTexts(op.plan, 12, 200)) fail("Bad plan");
      const next: MainsAnswer = { ...a, plan: op.plan, times: checkTimes(op.times) };
      if (op.marks !== undefined || op.words !== undefined) {
        next.question = checkRef({
          ...a.question,
          marks: op.marks ?? a.question.marks,
          words: op.words ?? a.question.words,
        });
      }
      return next;
    }
    case "submit": {
      if (a.status !== "draft") return a;
      if (!a.pages.length) fail("Add at least one page photo first");
      if (!isScore(op.selfScore)) fail("Your score is out of 10, in halves");
      if (!isTexts(op.selfMissed, 10, 80)) fail("Bad 'missed' list");
      if (!isIso(op.at)) fail("Bad time");
      return withStatus({ ...a, selfScore: op.selfScore, selfMissed: op.selfMissed, submittedAt: op.at });
    }
    case "transcript": {
      if (!a.transcript) fail("There is no transcript to correct yet");
      if (!isText(op.text, 20000) || !isIso(op.at) || !isAnswerId(op.disputeId)) fail("Bad correction");
      const next = { ...a, transcript: { ...a.transcript, corrected: op.text, correctedAt: op.at } };
      // After marking, a corrected reading asks Claude to look again at the marks it might move.
      if (
        a.marking &&
        !a.disputes.some((d) => d.id === op.disputeId || (d.item === "transcript" && d.status === "open"))
      )
        next.disputes = [
          ...a.disputes,
          { id: op.disputeId, item: "transcript", text: "I corrected the transcription.", at: op.at, status: "open" },
        ];
      return withStatus(next);
    }
    case "dispute": {
      markedOnly();
      const d = op.dispute;
      if (a.disputes.some((x) => x.id === d?.id)) return a;
      if (!isAnswerId(d?.id) || !(isKey(d.item) || d.item === "transcript") || !isText(d.text, 1000) || !isIso(d.at))
        fail("Say which item and why");
      if (a.disputes.some((x) => x.item === d.item && x.status === "open"))
        fail("That item already waits for Claude to look again");
      return withStatus({ ...a, disputes: [...a.disputes, { ...d, status: "open" }] });
    }
    case "rewrite": {
      markedOnly();
      const r = op.rewrite;
      if (a.rewrites.some((x) => x.id === r?.id)) return a;
      if (a.rewrites.length >= 5) fail("Up to 5 rewrites per answer");
      if (!isAnswerId(r?.id) || !isIso(r.at) || !isKey(r.item) || !isText(r.part, 80) || !isMs(r.ms))
        fail("Bad rewrite");
      if (!/^rewrite-/.test(r.page?.file ?? "")) fail("A rewrite's photo is a rewrite file");
      checkPage(r.page, "rewrite");
      return {
        ...a,
        rewrites: [
          ...a.rewrites,
          { id: r.id, at: r.at, item: r.item, part: r.part, page: r.page, ms: r.ms, status: "waiting" },
        ],
      };
    }
    case "mark": {
      if (a.status === "draft") fail("This answer hasn't been sent yet");
      if (a.marking && !op.again) fail("Already marked; pass again to mark it afresh");
      const marking = checkMarking(op.marking, a.pages.length);
      const t = checkTranscript(op.transcript);
      const transcript: Transcript = {
        text: t.text,
        unsure: t.unsure,
        ...(a.transcript?.corrected
          ? { corrected: a.transcript.corrected, correctedAt: a.transcript.correctedAt }
          : {}),
      };
      return withStatus({ ...a, marking, transcript });
    }
    case "resolve": {
      markedOnly();
      const d = a.disputes.find((x) => x.id === op.disputeId) ?? fail(`No dispute ${op.disputeId}`);
      if (d.status !== "open") fail("That dispute has been answered already");
      if (!isText(op.reason, 1000) || !isIso(op.at)) fail("Give the reason");
      const marking = a.marking!;
      let resolved: Dispute = { ...d, status: op.outcome, reply: op.reason, resolvedAt: op.at };
      let next = marking;
      if (op.outcome === "changed") {
        const key = d.item === "transcript" ? op.item : d.item;
        if (!isKey(key)) fail("Say which checklist item changes (--item)");
        if (!isMarks(op.points, ITEM[key].max)) fail(`${ITEM[key].label} is out of ${ITEM[key].max}, in quarters`);
        const cur = marking.checklist.find((c) => c.key === key)!;
        const checklist = marking.checklist.map((c) => (c.key === key ? { ...c, got: op.points! } : c));
        next = { ...marking, checklist, score: round2(checklist.reduce((n, c) => n + c.got, 0)) };
        resolved = { ...resolved, changedItem: key, from: cur.got, to: op.points };
      } else if (op.outcome === "kept") {
        if (op.points !== undefined) fail("A kept mark has no new points");
      } else fail("The outcome is changed or kept");
      return withStatus({ ...a, marking: next, disputes: a.disputes.map((x) => (x.id === d.id ? resolved : x)) });
    }
    case "markRewrite": {
      const r = a.rewrites.find((x) => x.id === op.rewriteId) ?? fail(`No rewrite ${op.rewriteId}`);
      if (!isText(op.verdict, 1000) || typeof op.better !== "boolean" || !isText(op.run, 60) || !isIso(op.at))
        fail("A rewrite's marking needs a verdict, better or not, and the run");
      const done: Rewrite = {
        ...r,
        status: "marked",
        verdict: op.verdict,
        better: op.better,
        run: op.run,
        markedAt: op.at,
      };
      return { ...a, rewrites: a.rewrites.map((x) => (x.id === r.id ? done : x)) };
    }
    default:
      fail("Unknown change");
  }
}

// ---------- Time, length and files ----------

/** Minutes allowed: 7 for a 10-marker and 11 for a 15-marker, scaled for others; an essay gets 90. */
export function minutesFor(marks: number, paper?: MainsPaper): number {
  if (paper === "Essay") return 90;
  return Math.max(2, Math.round(7 + (marks - 10) * 0.8));
}

/** The usual word limit for a mark value, when a question doesn't give one. */
export const wordsFor = (marks: number) => (marks <= 10 ? 150 : marks <= 12.5 ? 200 : 250);

export const wordCount = (text: string) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length;

/** The next free page file for a new photo. */
export function nextPhotoFile(taken: string[], type: PhotoType, kind: "page" | "rewrite" = "page"): string {
  for (let n = 1; n <= 9; n++) {
    const name = `${kind}-${n}.${PHOTO_TYPES[type]}`;
    if (!taken.some((f) => f.startsWith(`${kind}-${n}.`))) return name;
  }
  fail("No room for another photo");
}

/** Where a photo lives in Firebase Storage. */
export const storagePath = (answerId: string, file: string) => {
  if (!isAnswerId(answerId) || !PHOTO_FILE.test(file)) fail("Bad photo path");
  return `answers/${answerId}/${file}`;
};

export const photoTypeOf = (file: string): PhotoType =>
  (Object.entries(PHOTO_TYPES).find(([, ext]) => file.endsWith("." + ext))?.[0] as PhotoType) ?? fail("Bad photo file");

/** A new id: `a-YYYYMMDD-xxxxxx` for answers, `d-…` for disputes, `r-…` for rewrites. */
export function newId(prefix: "a" | "d" | "r" | "t", now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}-${day}-${[...bytes].map((b) => b.toString(36).padStart(2, "0")).join("")}`;
}

/** A fresh draft answer for a question. */
export function draftAnswer(q: MainsQuestion, now = new Date(), marks = q.marks, words = q.words): MainsAnswer {
  return {
    id: newId("a", now),
    question: {
      id: q.id,
      paper: q.paper,
      text: q.text,
      topic: q.topic,
      ...(q.year !== undefined ? { year: q.year } : {}),
      marks,
      words,
      ...(q.note ? { note: q.note } : {}),
    },
    status: "draft",
    createdAt: now.toISOString(),
    plan: [],
    times: { planMs: 0, writeMs: 0, overtimeMs: 0, limitMs: minutesFor(marks, q.paper) * 60_000 },
    pages: [],
    selfMissed: [],
    disputes: [],
    rewrites: [],
  };
}

/** "7:12", or "+0:40" past the limit. */
export function clock(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000);
  return `${ms < 0 ? "+" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------- Feedback ----------

export const fmtMarks = (n: number) => String(Math.round(n * 100) / 100);

/** How your own score compares with the marking. */
export function calibration(self: number | undefined, score: number): { label: string; close: boolean } | null {
  if (self === undefined) return null;
  const diff = self - score;
  if (Math.abs(diff) < 1) return { label: `You said ${fmtMarks(self)}: close`, close: true };
  return { label: `You said ${fmtMarks(self)}: ${diff > 0 ? "a bit generous" : "a bit harsh"}`, close: false };
}

const when = (a: MainsAnswer) => Date.parse(a.submittedAt ?? a.createdAt);
export const marked = (all: MainsAnswer[]) => all.filter((a) => a.marking);

/** Your other answers to the same question, oldest first (this one included). */
export const attemptsAt = (a: MainsAnswer, all: MainsAnswer[]) =>
  all.filter((x) => x.question.id === a.question.id && x.status !== "draft").sort((x, y) => when(x) - when(y));

/** The last marked answer to the same question before this one. */
export function previousAttempt(a: MainsAnswer, all: MainsAnswer[]): MainsAnswer | null {
  const before = marked(attemptsAt(a, all)).filter((x) => x.id !== a.id && when(x) < when(a));
  return before[before.length - 1] ?? null;
}

/** What got better since the previous attempt, and which gaps showed both times. */
export function compareAttempts(prev: MainsAnswer, cur: MainsAnswer) {
  const fixed: { key: ChecklistKey; label: string; from: number; to: number }[] = [];
  const repeated: { key: ChecklistKey; label: string; got: number; max: number }[] = [];
  if (!prev.marking || !cur.marking) return { fixed, repeated };
  for (const c of cur.marking.checklist) {
    const p = prev.marking.checklist.find((x) => x.key === c.key);
    if (!p) continue;
    const { label, max } = ITEM[c.key];
    if (c.got > p.got) fixed.push({ key: c.key, label, from: p.got, to: c.got });
    else if (c.got < max && p.got < max) repeated.push({ key: c.key, label, got: c.got, max });
  }
  return { fixed, repeated };
}

/** A score this low is worth another go after a while. */
export const RETRY_BELOW = 5.5;
export const RETRY_AFTER_DAYS = 28;

/** "Retry due": a low score four or more weeks ago, with no later attempt at the question. */
export function retryDue(a: MainsAnswer, all: MainsAnswer[], now = new Date()): boolean {
  if (!a.marking || a.marking.score >= RETRY_BELOW) return false;
  if (now.getTime() - when(a) < RETRY_AFTER_DAYS * 864e5) return false;
  return !all.some(
    (x) => x.id !== a.id && x.question.id === a.question.id && x.status !== "draft" && when(x) > when(a),
  );
}

/** Marks a fix tag cost on one answer: the marker's figure, or the shortfall on its checklist item. */
export function marksLost(a: MainsAnswer, tag: FixTagId): number {
  const t = a.marking?.tags.find((x) => x.tag === tag);
  if (!a.marking || !t) return 0;
  if (t.lost !== undefined) return t.lost;
  const item = FIX_TAGS[tag].item;
  const got = a.marking.checklist.find((c) => c.key === item)?.got ?? 0;
  return Math.max(0, ITEM[item].max - got);
}

/** `YYYY-MM` in local time. */
export const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const lastMonthOf = (d: Date) => monthOf(new Date(d.getFullYear(), d.getMonth() - 1, 1));
export const monthName = (month: string) =>
  new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("en-GB", { month: "long" });

export type Trend = "New" | "Fixed" | "Better" | "Worse" | "Same";

export interface TagStat {
  tag: FixTagId;
  label: string;
  item: ChecklistKey;
  what: string;
  drill: string;
  /** Answers carrying the tag. */
  count: number;
  lost: number;
  trend: Trend;
  /** Each answer with the tag, newest first, with what it was that time. */
  hits: { answer: MainsAnswer; note: string }[];
}

/** Each fix tag's count, marks lost and change against last month, costliest first. */
export function tagStats(all: MainsAnswer[], now = new Date()): TagStat[] {
  const done = marked(all).sort((a, b) => when(b) - when(a));
  const thisMonth = monthOf(now);
  const lastMonth = lastMonthOf(now);
  const inMonth = (m: string) => done.filter((a) => monthOf(new Date(when(a))) === m);
  const cur = inMonth(thisMonth);
  const prev = inMonth(lastMonth);
  const share = (list: MainsAnswer[], tag: FixTagId) =>
    list.length ? list.filter((a) => a.marking!.tags.some((t) => t.tag === tag)).length / list.length : null;
  const out: TagStat[] = [];
  for (const tag of FIX_TAG_IDS) {
    const hits = done.flatMap((a) => {
      const t = a.marking!.tags.find((x) => x.tag === tag);
      return t ? [{ answer: a, note: t.note }] : [];
    });
    if (!hits.length) continue;
    const a = share(cur, tag);
    const b = share(prev, tag);
    let trend: Trend = "Same";
    if (a !== null && a > 0 && !b) trend = "New";
    else if (a !== null && b !== null && b > 0 && a === 0) trend = "Fixed";
    else if (a !== null && b !== null && a < b - 0.1) trend = "Better";
    else if (a !== null && b !== null && a > b + 0.1) trend = "Worse";
    const def = FIX_TAGS[tag];
    out.push({
      tag,
      label: def.label,
      item: def.item,
      what: def.what,
      drill: def.drill,
      count: hits.length,
      lost: round2(hits.reduce((n, h) => n + marksLost(h.answer, tag), 0)),
      trend,
      hits,
    });
  }
  return out.sort((x, y) => y.lost - x.lost || y.count - x.count);
}

const mean = (xs: number[]) => (xs.length ? round2(xs.reduce((n, x) => n + x, 0) / xs.length) : null);

/** The Feedback tab's headline numbers. */
export function headline(all: MainsAnswer[], now = new Date()) {
  const done = marked(all);
  const month = (m: string) => done.filter((a) => monthOf(new Date(when(a))) === m);
  const cur = month(monthOf(now));
  const prev = month(lastMonthOf(now));
  const avg = (list: MainsAnswer[]) => mean(list.map((a) => a.marking!.score));
  const off = (list: MainsAnswer[]) =>
    mean(list.filter((a) => a.selfScore !== undefined).map((a) => a.selfScore! - a.marking!.score));
  const disputes = done.flatMap((a) => a.disputes);
  return {
    thisMonth: { name: monthName(monthOf(now)), avg: avg(cur), n: cur.length },
    lastMonth: { name: monthName(lastMonthOf(now)), avg: avg(prev), n: prev.length },
    /** Your self-score minus the mark, on average: above 0 is generous. */
    selfOff: { thisMonth: off(cur), lastMonth: off(prev), all: off(done) },
    costliest: tagStats(all, now)[0] ?? null,
    disputes: {
      changed: disputes.filter((d) => d.status === "changed").length,
      kept: disputes.filter((d) => d.status === "kept").length,
      open: disputes.filter((d) => d.status === "open").length,
    },
  };
}

/** How many times a tag had come up by this answer (this one included). */
export function tagTimes(a: MainsAnswer, tag: FixTagId, all: MainsAnswer[]): number {
  return marked(all).filter((x) => when(x) <= when(a) && x.marking!.tags.some((t) => t.tag === tag)).length;
}

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

// ---------- Picking a question ----------

/** A small, stable hash, to vary the suggestions from day to day. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface Suggestion {
  question: MainsQuestion;
  why: "retry" | "new" | "again";
  /** For a retry: the low-scoring answer it follows. */
  last?: MainsAnswer;
}

/**
 * Questions to write next: retries due first, then questions you haven't answered (those with a
 * written note first, then by a daily shuffle), then the rest.
 */
export function suggestQuestions(
  questions: MainsQuestion[],
  answers: MainsAnswer[],
  opts: { paper?: MainsPaper | null; written?: Set<string>; now?: Date } = {},
): Suggestion[] {
  const now = opts.now ?? new Date();
  const day = now.toLocaleDateString("en-CA");
  const pool = questions.filter((q) => !opts.paper || q.paper === opts.paper);
  const byId = new Map(pool.map((q) => [q.id, q]));
  const retries = answers
    .filter((a) => byId.has(a.question.id) && retryDue(a, answers, now))
    .sort((a, b) => when(a) - when(b))
    .map((a) => ({ question: byId.get(a.question.id)!, why: "retry" as const, last: a }));
  const tried = new Set(answers.filter((a) => a.status !== "draft").map((a) => a.question.id));
  const fresh = pool
    .filter((q) => !tried.has(q.id))
    .sort(
      (a, b) =>
        Number(!!opts.written?.has(b.note ?? "")) - Number(!!opts.written?.has(a.note ?? "")) ||
        hash(a.id + day) - hash(b.id + day),
    )
    .map((question) => ({ question, why: "new" as const }));
  const seen = new Set([...retries, ...fresh].map((s) => s.question.id));
  const again = pool.filter((q) => !seen.has(q.id)).map((question) => ({ question, why: "again" as const }));
  return [...retries, ...fresh, ...again];
}
