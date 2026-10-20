// Mains answer commands for `atlas` (M8): load questions, list the answers waiting for marking with
// their photos, save a marking, and answer "I disagree". Claude's scheduled marking run uses them
// (docs/routines/mark-answers.md). Dispatched from cli/atlas.ts; works on files or Firestore alike.
//
//   mains-import <questions.json> [--replace]   load questions ({questions: MainsQuestion[]}), each
//                                               checked first; --replace drops papers not in the file
//   mains-questions [--paper GS2]               questions per paper (with --paper, each one)
//   answers-waiting [--json]                    answers (and rewrites) waiting for marking: the question,
//                                               times, self-score and each photo as a file path
//   mark <answerId> <marking.json> [--again]    save a marking (checked against the checklist);
//                                               --again replaces an earlier one
//   mark-rewrite <answerId> <rewriteId> <better|same> "<verdict>" [--run "<run>"]
//   disputes                                    open "I disagree"s and corrected readings
//   resolve-dispute <answerId> <disputeId> <changed|kept> "<reason>" [--points n] [--item key]
//   answers [--days 14]                         recent answers with scores and fix tags
import { existsSync, readFileSync } from "node:fs";
import type { Backend } from "../server/backend.ts";
import {
  CHECKLIST_KEYS,
  clock,
  FIX_TAGS,
  fmtMarks,
  groupQuestions,
  ITEM,
  MAINS_PAPERS,
  mergeQuestionSets,
  minutesFor,
  PAPER_LABEL,
  validateQuestion,
  type ChecklistKey,
  type MainsAnswer,
  type Marking,
  type QuestionSet,
  type Transcript,
} from "../src/lib/mains.ts";

export const MAINS_COMMANDS = [
  "mains-import",
  "mains-questions",
  "answers-waiting",
  "mark",
  "mark-rewrite",
  "disputes",
  "resolve-dispute",
  "answers",
];

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const flag = (args: string[], name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = (args: string[]) => {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (["--paper", "--days", "--points", "--item", "--run"].includes(args[i])) i++;
    else if (!args[i].startsWith("--")) out.push(args[i]);
  }
  return out;
};

/** The run's name: "2026-10-21 evening". */
export const runLabel = (d = new Date()) =>
  `${d.toLocaleDateString("en-CA")} ${d.getHours() < 12 ? "morning" : "evening"}`;

const sent = (a: MainsAnswer) => a.submittedAt ?? a.createdAt;
const byTime = (a: MainsAnswer, b: MainsAnswer) => Date.parse(sent(a)) - Date.parse(sent(b));
const qLine = (a: MainsAnswer) =>
  `${a.question.paper} · ${a.question.topic}${a.question.year ? ` · ${a.question.year} PYQ` : ""} · ${fmtMarks(a.question.marks)} marks, ${a.question.words} words`;

export async function mainsCommand(db: Backend, cmd: string, args: string[]) {
  switch (cmd) {
    case "mains-import": {
      const [file] = positional(args);
      if (!file || !existsSync(file)) fail("Usage: mains-import <questions.json> [--replace]");
      const data = JSON.parse(readFileSync(file, "utf8")) as { questions?: unknown[] } | unknown[];
      const list = Array.isArray(data) ? data : data.questions;
      if (!Array.isArray(list)) fail("Expected {questions: [...]}");
      const problems: string[] = [];
      for (const q of list)
        try {
          validateQuestion(q);
        } catch (e) {
          problems.push(e instanceof Error ? e.message : String(e));
        }
      if (problems.length) fail(`Not imported (${problems.length} problems):\n- ${problems.slice(0, 40).join("\n- ")}`);
      const sets = ((): QuestionSet[] => {
        try {
          return groupQuestions(list);
        } catch (e) {
          fail(`Not imported: ${e instanceof Error ? e.message : String(e)}`);
        }
      })();
      const replace = args.includes("--replace");
      await db.setMainsQuestions(replace ? sets : mergeQuestionSets(await db.mainsQuestions(), sets), replace);
      console.log(
        `Imported ${list.length} questions into ${db.kind}: ${sets.map((s) => `${s.paper} ${s.questions.length}`).join(", ")}.`,
      );
      break;
    }

    case "mains-questions": {
      const sets = await db.mainsQuestions();
      const paper = flag(args, "--paper");
      const total = sets.reduce((n, s) => n + s.questions.length, 0);
      console.log(`${total} Mains questions in ${db.kind}.`);
      for (const p of MAINS_PAPERS) {
        const s = sets.find((x) => x.paper === p);
        if (!s) continue;
        const assumed = s.questions.filter((q) => q.marksAssumed).length;
        const noted = s.questions.filter((q) => q.note).length;
        console.log(
          `  ${p.padEnd(6)} ${String(s.questions.length).padStart(4)} questions · ${noted} with a note · ${assumed} with assumed marks`,
        );
        if (paper === p)
          for (const q of s.questions)
            console.log(
              `    ${q.id}\t${fmtMarks(q.marks)}m/${q.words}w${q.marksAssumed ? "*" : ""}\t${q.note ?? "-"}\t${q.topic}\t${q.text.slice(0, 90)}`,
            );
      }
      break;
    }

    case "answers-waiting": {
      const all = (await db.answers()).sort(byTime);
      const waiting = all.filter((a) => a.status === "waiting");
      const rewrites = all.flatMap((a) => a.rewrites.filter((r) => r.status === "waiting").map((r) => ({ a, r })));
      const photos = async (a: MainsAnswer, files: string[]) =>
        Promise.all(files.map(async (f) => (await db.answerPhoto(a.id, f)) ?? `(missing: ${f})`));
      if (args.includes("--json")) {
        const out = {
          answers: await Promise.all(
            waiting.map(async (a) => ({
              ...a,
              photos: await photos(
                a,
                a.pages.map((p) => p.file),
              ),
            })),
          ),
          rewrites: await Promise.all(
            rewrites.map(async ({ a, r }) => ({
              answerId: a.id,
              rewrite: r,
              question: a.question,
              photo: (await photos(a, [r.page.file]))[0],
              marking: a.marking,
            })),
          ),
        };
        console.log(JSON.stringify(out, null, 1));
        break;
      }
      if (!waiting.length && !rewrites.length) console.log("Nothing is waiting for marking.");
      for (const a of waiting) {
        const t = a.times;
        console.log(`\n## ${a.id} · sent ${sent(a)}`);
        console.log(`${qLine(a)}${a.question.note ? ` · note ${a.question.note}` : ""}`);
        console.log(`Q: ${a.question.text}`);
        console.log(
          `Time: wrote ${t.writeMs ? clock(t.writeMs) : "not recorded"} of ${clock(t.limitMs || minutesFor(a.question.marks) * 60_000)}` +
            `${t.overtimeMs ? `, ${Math.round(t.overtimeMs / 1000)} s over` : ""}${t.planMs ? `; planned ${clock(t.planMs)}` : ""}`,
        );
        if (a.plan.length) console.log(`Plan: ${a.plan.join(" · ")}`);
        console.log(
          `Self-score: ${a.selfScore ?? "none"}${a.selfMissed.length ? ` · thinks they missed: ${a.selfMissed.join(", ")}` : ""}`,
        );
        const files = await photos(
          a,
          a.pages.map((p) => p.file),
        );
        files.forEach((f, i) => console.log(`Page ${i + 1}: ${f}`));
      }
      for (const { a, r } of rewrites) {
        console.log(`\n## Rewrite ${r.id} of ${a.id} · ${r.part} (${ITEM[r.item].label}) · sent ${r.at}`);
        console.log(`${qLine(a)}`);
        console.log(`Q: ${a.question.text}`);
        const c = a.marking?.checklist.find((x) => x.key === r.item);
        if (c)
          console.log(`Original: ${ITEM[r.item].label} ${fmtMarks(c.got)} / ${fmtMarks(ITEM[r.item].max)}: ${c.why}`);
        console.log(`Took ${clock(r.ms)}. Photo: ${(await photos(a, [r.page.file]))[0]}`);
      }
      break;
    }

    case "mark": {
      const [id, file] = positional(args);
      if (!id || !file || !existsSync(file)) fail("Usage: mark <answerId> <marking.json> [--again]");
      const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<Marking> & { transcript?: Transcript };
      const { transcript, ...rest } = raw;
      if (!transcript) fail("The marking file needs the transcript: {text, unsure: [...]}");
      const marking = {
        ...rest,
        run: rest.run ?? runLabel(),
        markedAt: rest.markedAt ?? new Date().toISOString(),
      } as Omit<Marking, "score">;
      try {
        const a = await db.changeAnswer(id, { op: "mark", marking, transcript, again: args.includes("--again") });
        console.log(
          `Marked ${a.id} in ${db.kind}: ${fmtMarks(a.marking!.score)} / 10 (they said ${a.selfScore ?? "nothing"}), ` +
            `${a.marking!.comments.length} comment${a.marking!.comments.length === 1 ? "" : "s"}, tags: ${a.marking!.tags.map((t) => FIX_TAGS[t.tag].label).join(", ") || "none"}.`,
        );
      } catch (e) {
        fail(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case "mark-rewrite": {
      const [id, rewriteId, verdictWord, verdict] = positional(args);
      if (!id || !rewriteId || !["better", "same"].includes(verdictWord ?? "") || !verdict)
        fail('Usage: mark-rewrite <answerId> <rewriteId> <better|same> "<verdict>" [--run "<run>"]');
      try {
        await db.changeAnswer(id, {
          op: "markRewrite",
          rewriteId,
          verdict,
          better: verdictWord === "better",
          run: flag(args, "--run") ?? runLabel(),
          at: new Date().toISOString(),
        });
        console.log(`Marked rewrite ${rewriteId} of ${id}: ${verdictWord}.`);
      } catch (e) {
        fail(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case "disputes": {
      const all = (await db.answers()).sort(byTime);
      let n = 0;
      for (const a of all)
        for (const d of a.disputes.filter((x) => x.status === "open")) {
          n++;
          console.log(
            `\n## ${a.id} · dispute ${d.id} · ${d.item === "transcript" ? "corrected reading" : ITEM[d.item].label}`,
          );
          console.log(`${qLine(a)}`);
          console.log(`Q: ${a.question.text}`);
          console.log(`They wrote (${d.at}): ${d.text}`);
          if (d.item !== "transcript") {
            const c = a.marking!.checklist.find((x) => x.key === d.item)!;
            console.log(`The mark: ${fmtMarks(c.got)} / ${fmtMarks(ITEM[d.item].max)}. Why: ${c.why}`);
          } else {
            console.log(
              `Score now ${fmtMarks(a.marking!.score)}. The reading Claude marked:\n${a.transcript?.text ?? ""}`,
            );
            console.log(`Their corrected reading:\n${a.transcript?.corrected ?? ""}`);
          }
          const files = await Promise.all(a.pages.map(async (p) => (await db.answerPhoto(a.id, p.file)) ?? p.file));
          files.forEach((f, i) => console.log(`Page ${i + 1}: ${f}`));
        }
      if (!n) console.log("No open disputes.");
      break;
    }

    case "resolve-dispute": {
      const [id, disputeId, outcome, reason] = positional(args);
      if (!id || !disputeId || !["changed", "kept"].includes(outcome ?? "") || !reason)
        fail('Usage: resolve-dispute <answerId> <disputeId> <changed|kept> "<reason>" [--points n] [--item key]');
      const pointsRaw = flag(args, "--points");
      const item = flag(args, "--item");
      if (item !== undefined && !CHECKLIST_KEYS.includes(item as ChecklistKey))
        fail(`--item is one of ${CHECKLIST_KEYS.join(", ")}`);
      try {
        const a = await db.changeAnswer(id, {
          op: "resolve",
          disputeId,
          outcome: outcome as "changed" | "kept",
          reason,
          ...(pointsRaw !== undefined ? { points: Number(pointsRaw) } : {}),
          ...(item ? { item: item as ChecklistKey } : {}),
          at: new Date().toISOString(),
        });
        console.log(`Dispute ${disputeId}: ${outcome}. ${a.id} now scores ${fmtMarks(a.marking!.score)} / 10.`);
      } catch (e) {
        fail(`Not saved: ${e instanceof Error ? e.message : String(e)}`);
      }
      break;
    }

    case "answers": {
      const days = Number(flag(args, "--days") ?? 14) || 14;
      const since = Date.now() - days * 864e5;
      const list = (await db.answers()).filter((a) => Date.parse(sent(a)) >= since).sort(byTime);
      console.log(`${list.length} answers in the last ${days} days (${db.kind}).`);
      for (const a of list) {
        const score = a.marking ? `${fmtMarks(a.marking.score)}/10` : a.status;
        const tags = a.marking?.tags.map((t) => FIX_TAGS[t.tag].label).join(", ");
        const open = a.disputes.filter((d) => d.status === "open").length;
        console.log(
          `${sent(a).slice(0, 10)}  ${a.id}  ${PAPER_LABEL[a.question.paper].padEnd(6)} ${score.padEnd(8)} self ${a.selfScore ?? "-"}  ${a.question.topic}` +
            `${tags ? `  [${tags}]` : ""}${open ? `  ${open} dispute(s) open` : ""}`,
        );
      }
      break;
    }

    default:
      fail(`Unknown Mains command ${cmd}`);
  }
}
