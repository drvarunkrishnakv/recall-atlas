import { describe, expect, it } from "vitest";
import { applyAnswerOp, CHECKLIST, draftAnswer, type MainsAnswer, type MainsPaper, type MainsQuestion } from "./mains";
import {
  answerTarget,
  byMonth,
  byWeek,
  checklistKept,
  costliestItem,
  fromClaude,
  fullPapers,
  gapText,
  groupOf,
  lastFeedback,
  mainsStory,
  mainsWeekFacts,
  marksOpen,
  noteChanges,
  paperStats,
  prediction,
  sentOn,
  targetText,
  weekEnds,
  weeksOfAnswers,
  WRITTEN_MARKS,
} from "./mains-analytics";
import type { Proposal } from "./proposals";
import type { StoredThread } from "./threads";

// Made-up answers: the shapes only. Times are at midday UTC so the local day is the same day in
// any time zone the tests run in.
const question = (paper: MainsPaper, n: number, marks = 10): MainsQuestion => ({
  id: `${paper.toLowerCase()}-2020-sample${n}`,
  paper,
  marks,
  words: marks === 10 ? 150 : 250,
  text: `Sample question ${n}?`,
  asksFor: ["Sample part"],
  topic: "Sample topic",
  year: 2020,
  source: "pyq",
});

let seq = 0;
/** A sent answer (marked when `got` is given) to a new question on `paper`, written on `day`. */
function answer(
  paper: MainsPaper,
  day: string,
  opts: {
    got?: number[];
    self?: number;
    writeMs?: number;
    overtimeMs?: number;
    marks?: number;
    markedAt?: string;
  } = {},
): MainsAnswer {
  const at = `${day}T12:00:00.000Z`;
  const q = question(paper, ++seq, opts.marks);
  let a = applyAnswerOp(null, { op: "create", answer: { ...draftAnswer(q, new Date(at)), id: `a-test-${seq}` } });
  a = applyAnswerOp(a, {
    op: "draft",
    plan: [],
    times: {
      planMs: 0,
      writeMs: opts.writeMs ?? 0,
      overtimeMs: opts.overtimeMs ?? 0,
      limitMs: a.times.limitMs,
    },
  });
  a = applyAnswerOp(a, { op: "addPage", page: { file: "page-1.jpg", type: "image/jpeg", at } });
  a = applyAnswerOp(a, { op: "submit", selfScore: opts.self ?? 6, selfMissed: [], at });
  if (!opts.got) return a;
  return applyAnswerOp(a, {
    op: "mark",
    marking: {
      checklist: CHECKLIST.map((c, i) => ({ key: c.key, got: opts.got![i], why: "Sample reason" })),
      comments: [],
      keep: ["Sample keep"],
      fix: [],
      outline: [],
      fromNotes: [],
      tags: [],
      run: `${day} evening`,
      markedAt: opts.markedAt ?? `${day}T15:00:00.000Z`,
    },
    transcript: { text: "Sample transcript", unsure: [] },
  });
}

// Checklist marks adding up to a score: demand 2, structure 1.5, dimensions 2, evidence 2,
// current 1, presentation 1, length 0.5.
const FULL = [2, 1.5, 2, 2, 1, 1, 0.5]; // 10
const SIX = [1.5, 1.5, 0.5, 1, 0.5, 0.5, 0.5]; // 6
const FIVE = [1.5, 1, 0.5, 1, 0, 0.5, 0.5]; // 5
const SEVEN = [2, 1.5, 1, 1, 0.5, 0.5, 0.5]; // 7
const NOW = new Date("2026-10-21T12:00:00Z");

describe("papers", () => {
  it("adds up to UPSC's 1,750 written marks, with Medical Science's two papers as one 500-mark tile", () => {
    expect(WRITTEN_MARKS).toBe(1750);
    expect(groupOf("Med2").key).toBe("medical");
    expect(groupOf("Med1").marks).toBe(500);
  });

  it("averages each paper's marked answers and counts the ones waiting", () => {
    const all = [answer("GS2", "2026-09-10", { got: FIVE }), answer("GS2", "2026-10-10", { got: SEVEN })];
    all.push(answer("GS3", "2026-10-20"));
    const stats = paperStats(all);
    expect(stats.map((s) => s.group.key)).toEqual(["gs1", "gs2", "gs3", "gs4", "essay", "medical"]);
    expect(stats[1]).toMatchObject({ marked: 2, waiting: 0, avg: 6, open: 100 });
    expect(stats[2]).toMatchObject({ marked: 0, waiting: 1, avg: null, open: 250 });
  });

  it("ranks the marks still open; unstarted papers count in full, so Medical Science leads", () => {
    const open = marksOpen([answer("GS2", "2026-10-10", { got: SEVEN })]);
    expect(open[0]).toMatchObject({ open: 500 });
    expect(open[0].group.name).toBe("Medical Science");
    expect(open.at(-1)).toMatchObject({ open: 75, avg: 7 });
    expect(open.at(-1)!.group.name).toBe("GS2");
  });

  it("ignores drafts", () => {
    const draft = applyAnswerOp(null, { op: "create", answer: draftAnswer(question("GS1", 99), NOW) });
    expect(paperStats([draft])[0]).toMatchObject({ marked: 0, waiting: 0, open: 250 });
  });
});

describe("weeks, the checklist and months", () => {
  it("counts answers and averages scores per week, labelled by the week's first day", () => {
    const all = [
      answer("GS1", "2026-10-02", { got: FIVE }),
      answer("GS2", "2026-10-16", { got: SEVEN }),
      answer("GS2", "2026-10-19", { got: FIVE }),
      answer("GS3", "2026-10-20"),
    ];
    const weeks = byWeek(all, weekEnds(NOW, 3));
    expect(weeks.map((w) => w.from)).toEqual(["2026-10-01", "2026-10-08", "2026-10-15"]);
    expect(weeks.map((w) => w.sent)).toEqual([1, 0, 3]);
    expect(weeks.map((w) => w.avg)).toEqual([5, null, 6]);
    expect(weeks[2].marked).toBe(2);
    expect(weeksOfAnswers(all, NOW)).toBe(3);
    expect(weeksOfAnswers([], NOW)).toBe(1);
  });

  it("works out the share of each checklist item kept and what it cost", () => {
    const items = checklistKept([
      answer("GS1", "2026-10-02", { got: FIVE }),
      answer("GS1", "2026-10-03", { got: SEVEN }),
    ]);
    const dims = items.find((i) => i.key === "dimensions")!;
    expect(dims).toMatchObject({ label: "Dimensions", max: 2, lost: 2.5, short: 2 });
    expect(dims.kept).toBeCloseTo(1.5 / 4);
    expect(items.find((i) => i.key === "length")).toMatchObject({ kept: 1, lost: 0, short: 0 });
    expect(costliestItem(items)!.key).toBe("dimensions");
    expect(costliestItem(checklistKept([answer("GS1", "2026-10-02", { got: FULL })]))).toBeNull();
  });

  it("groups by month: self-score gap, time per 10-marker and answers that ran over", () => {
    const all = [
      answer("GS1", "2026-09-10", { got: FIVE, self: 6, writeMs: 460_000, overtimeMs: 40_000 }),
      answer("GS1", "2026-09-20", { got: SIX, self: 6.5, writeMs: 440_000, overtimeMs: 20_000 }),
      answer("GS2", "2026-10-05", { got: SEVEN, self: 7, writeMs: 400_000 }),
      answer("GS2", "2026-10-06", { got: SIX, self: 6.5, writeMs: 640_000, marks: 15 }),
      answer("GS3", "2026-10-20", { self: 8, writeMs: 410_000 }),
    ];
    const months = byMonth(all);
    expect(months.map((m) => [m.month, m.short, m.sent])).toEqual([
      ["2026-09", "Sep", 2],
      ["2026-10", "Oct", 3],
    ]);
    expect(months[0]).toMatchObject({ selfGap: 0.75, selfN: 2, tenMs: 450_000, tenN: 2, over: 2, timed: 2 });
    // The waiting answer has no mark yet, so only two answers give October's gap; the 15-marker isn't timed as a 10-marker.
    expect(months[1]).toMatchObject({ selfGap: 0.25, selfN: 2, tenMs: 405_000, tenN: 2, over: 0, timed: 3 });
    expect(gapText(0.75)).toBe("0.8 too high");
    expect(gapText(-0.3)).toBe("0.3 too low");
    expect(gapText(0.01)).toBe("spot on");
  });
});

describe("full papers and the predicted score", () => {
  /** A full GS paper on one day: ten 10-markers and ten 15-markers, 250 marks. */
  const sitting = (paper: MainsPaper, day: string, got?: number[]) => [
    ...Array.from({ length: 10 }, () => answer(paper, day, { got, marks: 10 })),
    ...Array.from({ length: 10 }, () => answer(paper, day, { got, marks: 15 })),
  ];

  it("counts a full paper only when one day's answers on a paper carry 250 marks", () => {
    expect(fullPapers(sitting("GS1", "2026-10-10").slice(0, 19))).toHaveLength(0);
    expect(fullPapers(sitting("GS1", "2026-10-10"))).toMatchObject([{ paper: "GS1", day: "2026-10-10", marks: 250 }]);
  });

  it("predicts nothing until two full papers are marked", () => {
    expect(prediction([answer("GS1", "2026-10-01", { got: SIX })])).toEqual({ sat: 0, needed: 2, total: null });
    const one = sitting("GS1", "2026-10-10", SIX);
    expect(prediction(one).total).toBeNull();
    const waiting = [...one, ...sitting("GS2", "2026-10-12")];
    expect(prediction(waiting)).toEqual({ sat: 2, needed: 2, total: null });
    // 60% on one, 70% on the other: 65% of 1,750 is 1,137.5, so about 1,140.
    expect(prediction([...one, ...sitting("GS2", "2026-10-12", SEVEN)])).toEqual({ sat: 2, needed: 2, total: 1140 });
  });
});

describe("the daily answer target", () => {
  it("is 1–2 a day until Prelims, rises a step a week after it, and holds at 5–6 until Mains", () => {
    expect(answerTarget("2026-10-21")).toEqual({ low: 1, high: 2, phase: "prelims" });
    expect(answerTarget("2027-05-23")).toEqual({ low: 1, high: 2, phase: "prelims" });
    expect(answerTarget("2027-05-24")).toEqual({ low: 2, high: 3, phase: "ramp" });
    expect(answerTarget("2027-05-31")).toEqual({ low: 3, high: 4, phase: "ramp" });
    expect(answerTarget("2027-06-07")).toEqual({ low: 4, high: 5, phase: "ramp" });
    expect(answerTarget("2027-06-14")).toEqual({ low: 5, high: 6, phase: "mains" });
    expect(answerTarget("2027-08-19")).toEqual({ low: 5, high: 6, phase: "mains" });
    expect(answerTarget("2027-08-20")).toEqual({ low: 0, high: 0, phase: "exam" });
    expect(targetText(answerTarget("2026-10-21"))).toBe("1–2 a day");
  });

  it("counts the answers sent on a day", () => {
    const all = [answer("GS1", "2026-10-21"), answer("GS1", "2026-10-21", { got: SIX }), answer("GS1", "2026-10-20")];
    expect(sentOn(all, "2026-10-21")).toBe(2);
  });
});

describe("the last feedback", () => {
  it("is the latest marked answer, with any answer still waiting", () => {
    const old = answer("GS2", "2026-10-01", { got: SIX, markedAt: "2026-10-01T15:00:00.000Z" });
    const newer = answer("GS1", "2026-09-28", { got: SEVEN, markedAt: "2026-10-02T15:00:00.000Z" });
    const waiting = answer("GS3", "2026-10-20");
    const { latest, waiting: w } = lastFeedback([old, newer, waiting]);
    expect(latest!.id).toBe(newer.id);
    expect(w.map((a) => a.id)).toEqual([waiting.id]);
    expect(lastFeedback([])).toEqual({ latest: null, waiting: [] });
  });
});

const proposal = (over: Partial<Proposal>): Proposal => ({
  id: "p1",
  kind: "add",
  blockId: "b1",
  text: "Sample: a court issued notice on a sample plea.",
  source: { label: "Sample source", url: "https://example.org", date: "2026-07-17" },
  reason: "Sample reason",
  origin: "claude",
  status: "applied",
  createdAt: "2026-10-18T10:00:00Z",
  decidedAt: "2026-10-19T10:00:00Z",
  ...over,
});

describe("changes in your notes", () => {
  it("lists approved changes with their source date, and edits no approval explains, newest first", () => {
    const pages = [
      { id: "P06", title: "Sample note", updated: "2026-10-19T10:00:30Z" },
      { id: "P10", title: "Another note", updated: "2026-10-20T08:00:00Z" },
      { id: "P18", title: "No date" },
    ];
    const proposals = {
      "notes:P06": [
        proposal({}),
        proposal({ id: "p2", status: "pending", decidedAt: undefined }),
        proposal({ id: "p3", kind: "row", cells: ["Sample issue", "", "2026"], decidedAt: "2026-10-10T09:00:00Z" }),
      ],
      "cards:c1": [proposal({ id: "p4" })],
    };
    const changes = noteChanges(pages, proposals);
    expect(changes.map((c) => [c.note, c.kind, c.text])).toEqual([
      ["P10", "edited", "Another note was edited"],
      ["P06", "added", "Sample: a court issued notice on a sample plea."],
      ["P06", "added", "Sample issue · 2026"],
    ]);
    expect(changes[1]).toMatchObject({ title: "Sample note", date: "2026-07-17" });
  });
});

describe("From Claude", () => {
  it("counts note updates, replies, flags, filed captures, answers marked and disputes answered this week", () => {
    const thread = (kind: StoredThread["kind"], last: "me" | "claude", resolved = false) =>
      ({
        id: `t-${kind}-${last}`,
        kind,
        anchor: { blockId: "b", quote: "q", prefix: "", suffix: "" },
        comments: [
          { id: "c1", userId: "me", body: "Q?", createdAt: "2026-10-20T10:00:00Z" },
          { id: "c2", userId: last, body: "A.", createdAt: "2026-10-20T11:00:00Z" },
        ],
        resolved,
        createdAt: "2026-10-20T10:00:00Z",
      }) as unknown as StoredThread;
    const marked = answer("GS2", "2026-10-19", { got: SIX, markedAt: "2026-10-19T15:00:00.000Z" });
    const disputed = {
      ...marked,
      id: "a-disputed",
      disputes: [
        {
          id: "d1",
          item: "length" as const,
          text: "Sample",
          at: "2026-10-19T16:00:00Z",
          status: "kept" as const,
          resolvedAt: "2026-10-20T10:00:00Z",
        },
      ],
    };
    const items = fromClaude({
      threads: { "notes:P06": [thread("claude", "claude"), thread("claude", "me"), thread("flag", "me")] },
      captures: [
        { id: "k1", text: "x", createdAt: "2026-10-19T10:00:00Z", status: "done", reply: "Filed.", note: "P06" },
        { id: "k2", text: "y", createdAt: "2026-10-19T10:00:00Z", status: "open" },
      ],
      proposals: { "notes:P06": [proposal({ status: "pending" }), proposal({ id: "p2", status: "pending" })] },
      answers: [marked, disputed, answer("GS1", "2026-09-01", { got: SIX, markedAt: "2026-09-01T15:00:00.000Z" })],
      week: { lines: [{ route: "/prelims/notebook" }, { route: "/mains/analytics#time" }, { route: "/notes/P06" }] },
      now: NOW,
    });
    expect(items.map((i) => [i.text, i.to])).toEqual([
      ["2 note updates to approve", "/inbox"],
      ["1 reply to your questions", "/inbox"],
      ["1 flag on your notes", "/inbox"],
      ["1 capture filed into your notes", "/inbox"],
      ["2 answers marked this week", "/mains/feedback"],
      ["1 dispute answered", "/mains/answers/a-disputed"],
      ["Weekly note: 2 lines on your answers", "/mains/analytics"],
    ]);
    expect(fromClaude({ threads: {}, captures: [], proposals: {}, answers: [], now: NOW })).toEqual([]);
    expect(
      fromClaude({ threads: {}, captures: [], proposals: {}, answers: [], week: { lines: [{ route: "/prelims" }] } }),
    ).toEqual([]);
  });
});

describe("the week's story", () => {
  const all = [
    answer("GS1", "2026-09-10", { got: FIVE, self: 6, writeMs: 460_000, overtimeMs: 40_000 }),
    answer("GS2", "2026-09-20", { got: SIX, self: 7, writeMs: 440_000, overtimeMs: 20_000 }),
    answer("GS2", "2026-10-05", { got: SEVEN, self: 7.5, writeMs: 420_000 }),
    answer("GS1", "2026-10-14", { got: SEVEN, self: 7, writeMs: 412_000 }),
    answer("GS3", "2026-10-20", { self: 7, writeMs: 400_000 }),
  ];

  it("heads each section with a line worked out from the answers", () => {
    const s = mainsStory(all, NOW, 8);
    expect(s.sent).toBe(5);
    expect(s.marked).toBe(4);
    expect(s.since).toBe("2026-09-10");
    expect(s.weeks).toHaveLength(8);
    expect(s.open[0].group.name).toBe("Medical Science");
    expect(s.prediction.total).toBeNull();
    expect(s.lines.map((l) => [l.id, l.tone, l.text])).toEqual([
      ["scores", "up", "Your scores are rising: 7.0 in October, 5.5 in September."],
      ["checklist", "down", "Dimensions cost you the most: 5 marks across 4 answers."],
      ["self-score", "up", "Your self-scores are getting honest: 0.3 too high, from 1.0 too high."],
      ["time", "up", "You're faster: 6:51 a 10-marker, from 7:30, but 2 of 5 ran over."],
      ["volume", "down", "You write about 0.6 answers a week; the target is 1–2 a day."],
      ["open", "down", "Medical Science is 500 marks and hasn't started."],
    ]);
  });

  it("narrows to the range: four weeks keeps October's answers only", () => {
    const s = mainsStory(all, NOW, 4);
    expect(s.sent).toBe(3);
    expect(s.weeks).toHaveLength(4);
    expect(s.months.map((m) => m.month)).toEqual(["2026-10"]);
    expect(s.costliest!.label).toBe("Dimensions");
    expect(s.lines.find((l) => l.id === "checklist")!.text).toBe(
      "Dimensions cost you the most: 2 marks across 2 answers.",
    );
  });

  it("says plainly when there is nothing yet", () => {
    const s = mainsStory([], NOW, 8);
    expect(s.lines.map((l) => l.text)).toEqual([
      "Your scores show here once Claude marks your first answer.",
      "No marked answers in the last 8 weeks, so no checklist yet.",
      "Your own score, given before the marks, is compared with Claude's here.",
      "Time a 10-marker with the timer and your pace shows here.",
      "No answers in the last 8 weeks; the target is 1–2 a day.",
      "Medical Science is 500 marks and hasn't started.",
    ]);
  });

  it("gives the weekly note its Mains facts and evidence routes", () => {
    const f = mainsWeekFacts(all, "2026-10-19", "2026-10-25");
    expect(f).toMatchObject({ sent: 1, marked: 0, waitingNow: 1, averageScore: null, ranOver: 0 });
    expect(f.tenMarker).toEqual({ averageTime: "6:40", answers: 1, limit: "7:00" });
    expect(f.target).toEqual({ perDay: "1–2 a day", perWeek: "7–14" });
    expect(f.marksOpen[0]).toEqual({ paper: "Medical Science", open: 500, of: 500, average: null });
    expect(f.evidence.checklist).toBe("/mains/analytics#checklist");
    const sep = mainsWeekFacts(all, "2026-09-07", "2026-09-13");
    expect(sep).toMatchObject({ sent: 1, marked: 1, averageScore: 5, selfScoreGap: 1, ranOver: 1 });
    expect(sep.costliest).toEqual({ item: "Dimensions", lost: 1.5, answers: 1 });
  });
});
