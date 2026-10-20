import { describe, expect, it } from "vitest";
import {
  applyAnswerOp,
  calibration,
  CHECKLIST,
  clock,
  compareAttempts,
  draftAnswer,
  groupQuestions,
  headline,
  MainsError,
  marksLost,
  mergeQuestionSets,
  minutesFor,
  nextPhotoFile,
  previousAttempt,
  retryDue,
  statusOf,
  storagePath,
  suggestQuestions,
  tagStats,
  tagTimes,
  validateAnswer,
  validateQuestion,
  validateQuestionSet,
  wordCount,
  type AnswerOp,
  type MainsAnswer,
  type MainsQuestion,
  type Marking,
} from "./mains";

// Made-up questions: the shapes only.
const q1: MainsQuestion = {
  id: "gs2-2020-sample1",
  paper: "GS2",
  marks: 10,
  words: 150,
  text: "Should a sample office follow a sample convention? What would it change?",
  asksFor: ["Your view on the convention", "What it would change"],
  subject: "Polity",
  topic: "Sample office",
  year: 2020,
  source: "pyq",
  note: "P06",
};
const q2: MainsQuestion = {
  ...q1,
  id: "gs2-2021-sample2",
  year: 2021,
  note: undefined,
  text: "A second sample question?",
};
const q3: MainsQuestion = { ...q1, id: "gs3-2022-sample3", paper: "GS3", year: 2022, note: "P10", text: "A third?" };

const T0 = new Date("2026-09-01T09:00:00Z");
const page = (n: number, at = "2026-09-01T09:10:00Z") => ({ file: `page-${n}.jpg`, type: "image/jpeg" as const, at });
const iso = (d: string) => new Date(d).toISOString();

function marking(got: number[], extra: Partial<Marking> = {}): Omit<Marking, "score"> {
  return {
    checklist: CHECKLIST.map((c, i) => ({ key: c.key, got: got[i], why: `Sample reason for ${c.label}` })),
    comments: [{ page: 1, y: 0.3, kind: "fix", text: "Underline the headings." }],
    keep: ["Both parts answered."],
    fix: [{ item: "dimensions", gain: 1.5, text: "Add a second angle." }],
    outline: [{ h: "Intro", p: "Where the convention comes from." }],
    fromNotes: [{ fact: "A sample fact from a note.", note: "P06", item: "evidence" }],
    tags: [{ tag: "thin-dimensions", note: "Only one angle" }],
    run: "2026-09-01 evening",
    markedAt: "2026-09-01T19:00:00Z",
    ...extra,
  };
}
const transcript = { text: "Sample answer text with walkouts.", unsure: ["walkouts"] };

/** A sent and marked answer to `q`, at `day`. */
function markedAnswer(q: MainsQuestion, day: string, got: number[], extra: Partial<Marking> = {}, self = 6) {
  const now = new Date(day);
  let a: MainsAnswer = applyAnswerOp(null, { op: "create", answer: draftAnswer(q, now) });
  a = applyAnswerOp(a, { op: "addPage", page: page(1, iso(day)) });
  a = applyAnswerOp(a, { op: "submit", selfScore: self, selfMissed: [], at: iso(day) });
  return applyAnswerOp(a, { op: "mark", marking: marking(got, extra), transcript });
}

describe("the fixture", () => {
  const sets = import.meta.glob("../../fixtures/content/mains/questions/*.json", { eager: true, import: "default" });
  const answers = import.meta.glob("../../fixtures/content/mains/answers/*.json", { eager: true, import: "default" });
  it("holds valid questions and answers, each with the status its contents give", () => {
    expect(Object.keys(sets)).toHaveLength(2);
    expect(Object.values(sets).flatMap((s) => validateQuestionSet(s).questions)).toHaveLength(3);
    expect(Object.keys(answers)).toHaveLength(3);
    for (const x of Object.values(answers)) {
      const a = validateAnswer(x);
      expect(a.status).toBe(statusOf(a));
    }
  });
});

describe("questions", () => {
  it("accepts a well-formed question and set", () => {
    expect(validateQuestion(q1)).toEqual(q1);
    expect(validateQuestionSet({ paper: "GS2", questions: [q1, q2] }).questions).toHaveLength(2);
  });

  it("refuses bad questions", () => {
    expect(() => validateQuestion({ ...q1, id: "Bad Id" })).toThrow(MainsError);
    expect(() => validateQuestion({ ...q1, paper: "GS5" })).toThrow(/paper/);
    expect(() => validateQuestion({ ...q1, year: undefined })).toThrow(/year/);
    expect(() => validateQuestion({ ...q1, source: "claude", year: undefined })).not.toThrow();
    expect(() => validateQuestion({ ...q1, asksFor: "both" })).toThrow(/asks for/);
    expect(() => validateQuestion({ ...q1, words: 5 })).toThrow(/word limit/);
    expect(() => validateQuestionSet({ paper: "GS3", questions: [q1] })).toThrow(/GS2/);
    expect(() => validateQuestionSet({ paper: "GS2", questions: [q1, q1] })).toThrow(/twice/);
  });

  it("groups by paper and merges by id", () => {
    const sets = groupQuestions([q3, q1, q2]);
    expect(sets.map((s) => [s.paper, s.questions.length])).toEqual([
      ["GS2", 2],
      ["GS3", 1],
    ]);
    const merged = mergeQuestionSets(sets, [{ paper: "GS2", questions: [{ ...q1, marks: 15, words: 250 }] }]);
    expect(merged.find((s) => s.paper === "GS2")!.questions.find((q) => q.id === q1.id)!.marks).toBe(15);
    expect(merged.find((s) => s.paper === "GS2")!.questions).toHaveLength(2);
  });
});

describe("answers", () => {
  it("goes from draft to waiting to marked, with the score as the checklist's sum", () => {
    let a = applyAnswerOp(null, { op: "create", answer: draftAnswer(q1, T0) });
    expect(a.status).toBe("draft");
    expect(a.times.limitMs).toBe(7 * 60_000);
    expect(applyAnswerOp(a, { op: "create", answer: draftAnswer(q2, T0) })).toBe(a); // already there
    expect(() => applyAnswerOp(a, { op: "submit", selfScore: 6, selfMissed: [], at: iso("2026-09-01") })).toThrow(
      /page photo/,
    );
    a = applyAnswerOp(a, { op: "addPage", page: page(1) });
    a = applyAnswerOp(a, { op: "addPage", page: page(2) });
    a = applyAnswerOp(a, { op: "addPage", page: { ...page(2), at: "2026-09-01T09:12:00Z" } }); // re-upload replaces
    expect(a.pages.map((p) => p.file)).toEqual(["page-1.jpg", "page-2.jpg"]);
    a = applyAnswerOp(a, { op: "pages", files: ["page-2.jpg", "page-1.jpg"] });
    expect(a.pages[0].file).toBe("page-2.jpg");
    a = applyAnswerOp(a, { op: "pages", files: ["page-2.jpg"] });
    expect(a.pages).toHaveLength(1);
    expect(() => applyAnswerOp(a, { op: "pages", files: ["page-9.jpg"] })).toThrow(/No page/);
    a = applyAnswerOp(a, {
      op: "draft",
      plan: ["UK convention", "neutrality"],
      times: { planMs: 40_000, writeMs: 452_000, overtimeMs: 32_000, limitMs: 420_000 },
      marks: 15,
      words: 250,
    });
    expect(a.question.marks).toBe(15);
    a = applyAnswerOp(a, { op: "submit", selfScore: 6, selfMissed: ["Dimensions"], at: "2026-09-01T09:20:00Z" });
    expect(a.status).toBe("waiting");
    expect(() => applyAnswerOp(a, { op: "addPage", page: page(3) })).toThrow(/sent/);
    a = applyAnswerOp(a, { op: "mark", marking: marking([1.5, 1.5, 0.5, 1.5, 1, 0.5, 0]), transcript });
    expect(a.status).toBe("marked");
    expect(a.marking!.score).toBe(6.5);
    expect(() => applyAnswerOp(a, { op: "mark", marking: marking([2, 1.5, 2, 2, 1, 1, 0.5]), transcript })).toThrow(
      /Already marked/,
    );
    expect(validateAnswer(a)).toEqual(a);
  });

  it("checks a marking against the checklist and the pages", () => {
    const a = markedAnswer(q1, "2026-09-01T09:00:00Z", [2, 1.5, 2, 2, 1, 1, 0.5]);
    const again = (m: Omit<Marking, "score"> & { score?: number }): AnswerOp => ({
      op: "mark",
      marking: m,
      transcript,
      again: true,
    });
    expect(applyAnswerOp(a, again(marking([2, 1.5, 2, 2, 1, 1, 0.5]))).marking!.score).toBe(10);
    expect(() => applyAnswerOp(a, again(marking([2.5, 1.5, 2, 2, 1, 1, 0.5])))).toThrow(/Demand/);
    expect(() => applyAnswerOp(a, again(marking([1.3, 1.5, 2, 2, 1, 1, 0.5])))).toThrow(/quarters/);
    expect(() => applyAnswerOp(a, again({ ...marking([2, 1.5, 2, 2, 1, 1, 0.5]), score: 9 }))).toThrow(/sum/);
    const twoPages = marking([1, 1, 1, 1, 1, 1, 0], { comments: [{ page: 2, y: 0.5, kind: "good", text: "x" }] });
    expect(() => applyAnswerOp(a, again(twoPages))).toThrow(/page 2/);
    const badTag = marking([1, 1, 1, 1, 1, 1, 0], { tags: [{ tag: "sloppy" as never, note: "x" }] });
    expect(() => applyAnswerOp(a, again(badTag))).toThrow(/Unknown fix tag/);
  });

  it("logs a dispute, and resolves it changed (the score moves) or kept", () => {
    let a = markedAnswer(q1, "2026-09-01T09:00:00Z", [1.5, 1.5, 0.5, 1.5, 1, 0.5, 0]);
    const dispute = (id: string, item: "demand" | "dimensions") =>
      ({
        op: "dispute",
        dispute: { id, item, text: "My view is in the way forward.", at: iso("2026-09-02") },
      }) as const;
    a = applyAnswerOp(a, dispute("d-1", "demand"));
    expect(a.status).toBe("disputed");
    expect(applyAnswerOp(a, dispute("d-1", "demand"))).toBe(a); // the same one again
    expect(() => applyAnswerOp(a, dispute("d-2", "demand"))).toThrow(/already waits/);
    a = applyAnswerOp(a, dispute("d-3", "dimensions"));
    a = applyAnswerOp(a, {
      op: "resolve",
      disputeId: "d-1",
      outcome: "changed",
      reason: "Your way forward states a clear yes.",
      points: 2,
      at: iso("2026-09-02"),
    });
    expect(a.marking!.score).toBe(7);
    expect(a.disputes[0]).toMatchObject({ status: "changed", from: 1.5, to: 2, changedItem: "demand" });
    expect(a.status).toBe("disputed"); // d-3 still open
    expect(() =>
      applyAnswerOp(a, {
        op: "resolve",
        disputeId: "d-3",
        outcome: "kept",
        reason: "x",
        points: 1,
        at: iso("2026-09-02"),
      }),
    ).toThrow(/kept/);
    a = applyAnswerOp(a, {
      op: "resolve",
      disputeId: "d-3",
      outcome: "kept",
      reason: "Still one angle.",
      at: iso("2026-09-02"),
    });
    expect(a.status).toBe("marked");
    expect(a.marking!.score).toBe(7);
  });

  it("a corrected reading after marking asks Claude to look again", () => {
    let a = markedAnswer(q1, "2026-09-01T09:00:00Z", [1.5, 1.5, 0.5, 1.5, 1, 0.5, 0]);
    a = applyAnswerOp(a, {
      op: "transcript",
      text: "Sample answer text with walk-outs.",
      at: iso("2026-09-02"),
      disputeId: "t-1",
    });
    expect(a.transcript!.corrected).toContain("walk-outs");
    expect(a.disputes[0]).toMatchObject({ item: "transcript", status: "open" });
    expect(() =>
      applyAnswerOp(a, {
        op: "resolve",
        disputeId: "t-1",
        outcome: "changed",
        reason: "x",
        points: 1,
        at: iso("2026-09-02"),
      }),
    ).toThrow(/--item/);
    a = applyAnswerOp(a, {
      op: "resolve",
      disputeId: "t-1",
      outcome: "changed",
      reason: "The word was right; Evidence goes up.",
      points: 2,
      item: "evidence",
      at: iso("2026-09-02"),
    });
    expect(a.marking!.score).toBe(7);
    // A re-mark keeps your corrected reading.
    a = applyAnswerOp(a, { op: "mark", marking: marking([2, 1.5, 2, 2, 1, 1, 0.5]), transcript, again: true });
    expect(a.transcript!.corrected).toContain("walk-outs");
  });

  it("logs a rewrite beside the original; the score stays", () => {
    let a = markedAnswer(q1, "2026-09-01T09:00:00Z", [1.5, 1.5, 0.5, 1.5, 1, 0.5, 0]);
    const rw = { id: "r-1", at: iso("2026-09-02"), item: "dimensions" as const, part: "Implications", ms: 170_000 };
    expect(() => applyAnswerOp(a, { op: "rewrite", rewrite: { ...rw, page: page(1) } })).toThrow(/rewrite file/);
    a = applyAnswerOp(a, {
      op: "rewrite",
      rewrite: { ...rw, page: { file: "rewrite-1.jpg", type: "image/jpeg", at: iso("2026-09-02") } },
    });
    expect(a.rewrites[0].status).toBe("waiting");
    a = applyAnswerOp(a, {
      op: "markRewrite",
      rewriteId: "r-1",
      verdict: "Now two angles.",
      better: true,
      run: "2026-09-02 morning",
      at: iso("2026-09-02"),
    });
    expect(a.rewrites[0]).toMatchObject({ status: "marked", better: true });
    expect(a.marking!.score).toBe(6.5);
  });

  it("refuses a malformed answer", () => {
    const a = draftAnswer(q1, T0);
    expect(() => validateAnswer({ ...a, pages: [page(1), page(1)] })).toThrow(/twice/);
    expect(() => validateAnswer({ ...a, pages: [{ ...page(1), file: "../x.jpg" }] })).toThrow(/file/);
    expect(() => validateAnswer({ ...a, pages: [{ ...page(1), type: "image/png" }] })).toThrow(/match/);
    expect(() => validateAnswer({ ...a, selfScore: 11 })).toThrow(/out of 10/);
    expect(() => applyAnswerOp(null, { op: "create", answer: { ...a, submittedAt: iso("2026-09-01") } })).toThrow(
      /draft/,
    );
    expect(statusOf({ submittedAt: undefined, disputes: [] })).toBe("draft");
  });
});

describe("time, files and ids", () => {
  it("gives 7 minutes for 10 marks and 11 for 15", () => {
    expect(minutesFor(10)).toBe(7);
    expect(minutesFor(15)).toBe(11);
    expect(minutesFor(20)).toBe(15);
    expect(minutesFor(125, "Essay")).toBe(90);
    expect(clock(432_000)).toBe("7:12");
    expect(clock(-40_000)).toBe("+0:40");
  });

  it("names photo files safely", () => {
    expect(nextPhotoFile(["page-1.jpg", "page-3.png"], "image/jpeg")).toBe("page-2.jpg");
    expect(nextPhotoFile([], "image/webp", "rewrite")).toBe("rewrite-1.webp");
    expect(storagePath("a-20260901-abcd", "page-1.jpg")).toBe("answers/a-20260901-abcd/page-1.jpg");
    expect(() => storagePath("a-1", "../../x.jpg")).toThrow();
    expect(() => storagePath("../a", "page-1.jpg")).toThrow();
    expect(draftAnswer(q1).id).toMatch(/^a-\d{8}-[a-z0-9]{8}$/);
    expect(wordCount("The Speaker’s role, in 2020: neutral.")).toBe(6);
  });
});

describe("feedback", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const sep1 = markedAnswer(q1, "2026-09-05T09:00:00Z", [1, 1.5, 0.5, 1, 0, 0.5, 0], {}, 6); // 4.5
  const sep2 = markedAnswer(q2, "2026-09-10T09:00:00Z", [1, 1, 0.5, 1, 1, 0.5, 0], {
    tags: [
      { tag: "thin-dimensions", note: "One angle" },
      { tag: "no-current-link", note: "Nothing recent" },
    ],
  }); // 5
  const oct1 = markedAnswer(q1, "2026-10-12T09:00:00Z", [2, 1.5, 1, 1.5, 1, 0.5, 0], {
    tags: [{ tag: "too-short", note: "100 of 150 words" }],
  }); // 7.5
  const all = [sep1, sep2, oct1];

  it("compares with the previous attempt at the same question", () => {
    expect(previousAttempt(oct1, all)?.id).toBe(sep1.id);
    const { fixed, repeated } = compareAttempts(sep1, oct1);
    expect(fixed.map((f) => f.key)).toEqual(["demand", "dimensions", "evidence", "current"]);
    expect(repeated.map((r) => r.key)).toEqual(["presentation", "length"]);
    expect(calibration(6, 7.5)?.label).toBe("You said 6: a bit harsh");
    expect(calibration(7, 7.5)).toEqual({ label: "You said 7: close", close: true });
  });

  it("flags a retry: a low score four or more weeks ago, not tried since", () => {
    expect(retryDue(sep2, all, now)).toBe(true);
    expect(retryDue(sep1, all, now)).toBe(false); // tried again in October
    expect(retryDue(sep2, all, new Date("2026-09-20T00:00:00Z"))).toBe(false); // too soon
    expect(retryDue(oct1, all, now)).toBe(false); // not low
  });

  it("counts each fix tag, the marks it cost and its change against last month", () => {
    const stats = tagStats(all, now);
    const thin = stats.find((s) => s.tag === "thin-dimensions")!;
    expect(thin.count).toBe(2); // sep1 (default tag) and sep2
    expect(thin.lost).toBe(3); // 1.5 + 1.5 short on Dimensions
    expect(thin.trend).toBe("Fixed"); // both in September, none in October
    expect(stats.find((s) => s.tag === "too-short")!.trend).toBe("New");
    expect(stats[0].tag).toBe("thin-dimensions"); // costliest first
    expect(marksLost(sep2, "no-current-link")).toBe(0);
    expect(tagTimes(sep2, "thin-dimensions", all)).toBe(2);
  });

  it("works out the headline numbers", () => {
    const h = headline(all, now);
    expect(h.thisMonth).toMatchObject({ name: "October", avg: 7.5, n: 1 });
    expect(h.lastMonth).toMatchObject({ name: "September", avg: 4.75, n: 2 });
    expect(h.selfOff.thisMonth).toBe(-1.5);
    expect(h.costliest?.tag).toBe("thin-dimensions");
    expect(h.disputes).toEqual({ changed: 0, kept: 0, open: 0 });
  });

  it("suggests retries first, then new questions with a written note", () => {
    const list = suggestQuestions([q1, q2, q3], all, { written: new Set(["P10"]), now });
    expect(list.map((s) => [s.question.id, s.why])).toEqual([
      ["gs2-2021-sample2", "retry"],
      ["gs3-2022-sample3", "new"],
      ["gs2-2020-sample1", "again"],
    ]);
    expect(suggestQuestions([q1, q2, q3], all, { paper: "GS3", now }).map((s) => s.question.id)).toEqual([q3.id]);
  });
});
