import { describe, expect, it } from "vitest";
import {
  answerStats,
  answerSummaries,
  applyWorkOp,
  checkOutlineDraft,
  emptyWork,
  heatLevel,
  isContentId,
  isOfficial,
  MainsExtraError,
  medicalFlag,
  noteFacts,
  OTHER_SIDE,
  questionSummaries,
  stepDone,
  validateEssayTopic,
  validateEthicsCase,
  validateImport,
  validateMedicalLine,
  wordCount,
  writeLink,
  type BenchAttempt,
  type EssayOutline,
  type MedicalLine,
} from "./mains-extra";
import type { Block } from "./blocks";

// Synthetic records: the shapes only, no real topics, cases or questions.
const src = [{ label: "Sample source", url: "https://example.org/sample" }];
const angles = ["One", "Two", "Three", "Four", "Five", "Six"].map((k) => ({ k, v: `Sample angle ${k}` }));
const topic = {
  id: "sample-1",
  year: 2024,
  section: "A",
  n: 1,
  text: "A sample topic about a quiet river.",
  theme: "Sample theme",
  sources: src,
  decode: {
    asks: "What the sample asks.",
    keywords: ["river"],
    angles,
    notes: [{ id: "P06", why: "A sample point." }],
  },
};
const kase = {
  id: "sample-case-1",
  n: 1,
  by: "claude",
  title: "The sample case",
  setting: "Sample office",
  you: "Sample officer",
  clash: "One value vs another",
  values: ["Integrity"],
  text: ["A sample paragraph."],
  asks: ["What will you do?"],
  laws: [],
  key: {
    stakeholders: [
      { t: "Sample group", key: true },
      { t: "Another group", key: false },
    ],
    issues: [
      { k: "Integrity", v: "sample", central: true },
      { k: "Courage", v: "sample", central: false },
    ],
    options: [
      { t: "Option one", pro: "for", con: "against", verdict: "do" },
      { t: "Option two", pro: "for", con: "against", verdict: "never" },
    ],
    decision: "A sample decision.",
    system: "A sample fix.",
  },
};
const line = {
  id: "SA1",
  paper: "I",
  subject: "Sample Anatomy",
  order: 1,
  label: "A sample line",
  syllabus: "Sample syllabus wording.",
  pyqs: {
    count: 1,
    marks: 10,
    secondary: 1,
    last: 2025,
    items: [
      { id: "s-1", year: 2025, paper: "I", marks: 10, text: "Sample question one.", primary: true },
      { id: "s-2", year: 2024, paper: "I", marks: 10, text: "Sample question two.", primary: false },
    ],
  },
  diagrams: [{ id: "sample-diagram", t: "A sample diagram" }],
};
const now = "2026-10-21T08:00:00.000Z";

describe("content checks", () => {
  it("accepts good records and refuses `mine-` ids", () => {
    expect(validateEssayTopic(topic).id).toBe("sample-1");
    expect(validateEthicsCase(kase).title).toBe("The sample case");
    expect(validateMedicalLine(line).pyqs?.count).toBe(1);
    expect(isContentId("mine-sample-1")).toBe(false);
    expect(() => validateEssayTopic({ ...topic, id: "mine-x" })).toThrow(MainsExtraError);
  });

  it("needs six distinct angles and a checked source for an essay", () => {
    expect(() => validateEssayTopic({ ...topic, decode: { ...topic.decode, angles: angles.slice(0, 5) } })).toThrow(
      /six angles/,
    );
    expect(() =>
      validateEssayTopic({ ...topic, decode: { ...topic.decode, angles: [...angles.slice(0, 5), angles[0]] } }),
    ).toThrow(/repeat/);
    expect(() => validateEssayTopic({ ...topic, sources: [] })).toThrow(/checked/);
  });

  it("refuses a case that cites a law without an official source", () => {
    expect(() =>
      validateEthicsCase({
        ...kase,
        laws: [{ cite: "Sample Act", source: { label: "Blog", url: "https://example.com" } }],
      }),
    ).toThrow(/official source/);
    expect(
      validateEthicsCase({
        ...kase,
        laws: [{ cite: "Sample Act", source: { label: "India Code", url: "https://www.indiacode.nic.in/x" } }],
      }).laws,
    ).toHaveLength(1);
    expect(() => validateEthicsCase({ ...kase, text: undefined })).toThrow(/full case/);
  });

  it("checks a line's PYQ count and its note's sources", () => {
    expect(() => validateMedicalLine({ ...line, pyqs: { ...line.pyqs, count: 2 } })).toThrow(/count/);
    const note = { kind: "dated", text: "Sample note.", checked: true, sources: src };
    expect(() => validateMedicalLine({ ...line, note })).toThrow(/official source/);
    const ok = { ...note, sources: [{ label: "Ministry", url: "https://sample.gov.in/page" }] };
    expect(validateMedicalLine({ ...line, note: ok }).note?.checked).toBe(true);
    expect(validateMedicalLine({ ...line, note: { ...note, checked: false } }).note?.checked).toBe(false);
  });

  it("checks a whole import and finds repeated ids", () => {
    const v = validateImport({ essay: [topic], ethics: [kase], medical: [line] });
    expect([v.essay.length, v.ethics.length, v.medical.length]).toEqual([1, 1, 1]);
    expect(() => validateImport({ essay: [topic, topic] })).toThrow(/twice/);
  });

  it("knows an official site", () => {
    expect(isOfficial("https://nhm.gov.in/x")).toBe(true);
    expect(isOfficial("https://www.un.org/sdgs")).toBe(true);
    expect(isOfficial("https://example.org/x")).toBe(false);
    expect(isOfficial("not a url")).toBe(false);
  });
});

const outline = (over: Partial<EssayOutline> = {}): EssayOutline => ({
  id: "o1",
  at: now,
  ms: 60_000,
  thesis: "",
  opening: "",
  paras: Array.from({ length: 7 }, () => ({ angle: null, text: "" })),
  closing: "",
  ...over,
});

describe("your records", () => {
  it("saves your own decoding once and keeps its first time", () => {
    const w1 = applyWorkOp("essay", emptyWork("essay"), { op: "try", text: "My angles" }, now);
    const w2 = applyWorkOp("essay", w1, { op: "try", text: "My angles, more" }, "2026-10-22T08:00:00.000Z");
    expect(w2.tried).toEqual({ text: "My angles, more", at: now });
    expect(() => applyWorkOp("essay", w1, { op: "try", text: "  " })).toThrow(/own angles/);
  });

  it("adds an outline, and a retried save replaces it", () => {
    const w1 = applyWorkOp("essay", emptyWork("essay"), { op: "outline", outline: outline({ thesis: "A" }) });
    const w2 = applyWorkOp("essay", w1, { op: "outline", outline: outline({ thesis: "B" }) });
    expect(w2.outlines).toHaveLength(1);
    expect(w2.outlines[0].thesis).toBe("B");
    expect(() =>
      applyWorkOp("essay", w1, { op: "outline", outline: outline({ paras: [{ angle: null, text: "" }] }) }),
    ).toThrow(/7 paragraphs/);
  });

  it("refuses an op that belongs to another kind", () => {
    expect(() => applyWorkOp("medical", emptyWork("medical"), { op: "try", text: "x" })).toThrow(/doesn't apply/);
  });

  it("rates a line and clears the rating", () => {
    const w = applyWorkOp("medical", emptyWork("medical"), { op: "rate", rating: "rusty" }, now);
    expect(w).toEqual({ drills: [], rating: "rusty", ratedAt: now });
    expect(applyWorkOp("medical", w, { op: "rate", rating: null })).toEqual({ drills: [] });
    expect(() => applyWorkOp("medical", w, { op: "rate", rating: "great" as never })).toThrow(/Rusty/);
  });

  it("logs a diagram drill's time", () => {
    const w = applyWorkOp("medical", emptyWork("medical"), {
      op: "drill",
      drill: { id: "d1", diagram: "sample-diagram", at: now, ms: 185_000 },
    });
    expect(w.drills[0].ms).toBe(185_000);
    expect(medicalFlag(line as MedicalLine, w)?.t).toBe("Redraw due");
  });

  it("keeps a bench attempt", () => {
    const a: BenchAttempt = {
      id: "a1",
      at: now,
      updated: now,
      stakeholders: ["Sample group"],
      own: [],
      issues: [],
      verdicts: [null, null],
      decision: "",
      system: "",
      answer: "",
    };
    const w = applyWorkOp("ethics", emptyWork("ethics"), { op: "attempt", attempt: a });
    expect(w.attempts).toHaveLength(1);
    expect(stepDone(1, a, 2)).toBe(true);
    expect(stepDone(2, a, 2)).toBe(false);
    expect(stepDone(3, { ...a, verdicts: ["do", null] }, 2)).toBe(false);
    expect(stepDone(3, { ...a, verdicts: ["do", "never"] }, 2)).toBe(true);
    expect(stepDone(1, undefined, 2)).toBe(false);
  });
});

describe("what the screens work out", () => {
  it("checks an outline for angles, balance and a closing", () => {
    const names = angles.map((a) => a.k);
    const empty = checkOutlineDraft(outline(), names);
    expect(empty.verdicts.map((v) => v.mark)).toEqual(["missing", "partly", "missing", "partly"]);
    const full = checkOutlineDraft(
      outline({
        thesis: "Yes",
        closing: "Back to the start",
        paras: [...names.slice(0, 6), OTHER_SIDE].map((angle) => ({ angle, text: "a point" })),
      }),
      names,
    );
    expect(full.covered).toBe(6);
    expect(full.balance).toBe(true);
    expect(full.verdicts.every((v) => v.mark === "ok")).toBe(true);
    // A tag on an empty paragraph doesn't count.
    expect(
      checkOutlineDraft(outline({ paras: [{ angle: "One", text: "" }, ...outline().paras.slice(1)] }), names).covered,
    ).toBe(0);
  });

  it("finds a note's lead and its open checks", () => {
    const blocks: Block[] = [
      { type: "paragraph", content: [{ type: "text", text: "The lead." }] },
      { type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Sources and open checks" }] },
      { type: "heading", props: { level: 3 }, content: [{ type: "text", text: "Open checks" }] },
      { type: "checkListItem", props: { checked: false }, content: [{ type: "text", text: "Check one" }] },
      { type: "checkListItem", props: { checked: true }, content: [{ type: "text", text: "Done one" }] },
      { type: "heading", props: { level: 3 }, content: [{ type: "text", text: "Sources" }] },
      { type: "checkListItem", props: { checked: false }, content: [{ type: "text", text: "Not a check" }] },
    ];
    expect(noteFacts(blocks)).toEqual({ lead: "The lead.", open: ["Check one"], closed: 1 });
    expect(noteFacts([])).toEqual({ lead: "", open: [], closed: 0 });
  });

  it("reads the Write flow's records loosely", () => {
    const a = answerSummaries([
      { id: "x1", note: "P06", score: 6.5 },
      { id: "x2", question: { note: "P06" }, marks: { total: 7.5 } },
      { id: "x3", ref: { essay: "2024-1" } },
      // The Write flow's own shape (M8): the question it answers, and the marking.
      { id: "x4", question: { id: "q1", note: "P06" }, marking: { score: 5.5 }, createdAt: "2026-10-21T08:00:00Z" },
      { nothing: true },
    ]);
    expect(a).toHaveLength(4);
    expect(answerStats(a, (x) => x.note === "P06")).toEqual({ count: 3, avg: 6.5 });
    expect(answerStats(a, (x) => x.essay === "2024-1")).toEqual({ count: 1, avg: undefined });
    const q = questionSummaries([{ questions: [{ note: "P06", year: 2023, text: "Q" }, { year: 2020 }] }]);
    expect(q).toEqual([{ note: "P06", year: 2023, text: "Q" }]);
  });

  it("small helpers", () => {
    expect(wordCount("  one two  three ")).toBe(3);
    expect(wordCount("")).toBe(0);
    expect([0, 2, 5, 8].map(heatLevel)).toEqual([0, 1, 2, 3]);
    expect(writeLink("medical", "AN1")).toBe("/mains/write?medical=AN1");
    expect(writeLink("essay", "2024-1")).toBe("/mains/write?essay=2024-1");
  });
});
