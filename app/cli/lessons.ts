// The nightly engine's commands (M9), dispatched from cli/atlas.ts. Claude's scheduled runs use
// them as docs/routines/nightly-lesson.md and docs/routines/weekly-note.md describe.
//
//   misses [--day YYYY-MM-DD]          JSON: the day's missed and shaky MCQs with everything a lesson
//                                      card needs, plus the shaky cards due back
//   lesson-write <day> <lesson.json>   check and store a day's lesson ({cards, quiz}); keeps your
//                                      ratings and adds the shaky cards that are due back
//   lessons                            every lesson: cards, fact-checks, ratings, quiz; shaky cards due
//   week-note <YYYY-Www> <note.json>   check and store the weekly note ({lines: [{text, evidence}]})
//   week-data [--weeks 1]              JSON: the facts a weekly note is written from
import { existsSync, readFileSync } from "node:fs";
import type { Backend } from "../server/backend.ts";
import { servable, type Item } from "../src/lib/practice.ts";
import {
  dueLoad,
  isoWeek,
  latestRating,
  localDay,
  mergeLesson,
  missesFor,
  shakyQueue,
  shiftWeek,
  validateLesson,
  validateWeeklyNote,
  weekFacts,
  type Lesson,
  type WeeklyNote,
} from "../src/lib/lessons.ts";

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const flag = (args: string[], name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function readJsonFile(file: string | undefined, usage: string): Record<string, unknown> {
  if (!file || !existsSync(file)) fail(usage);
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch (e) {
    fail(`${file} isn't valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function itemMap(db: Backend): Promise<Map<string, Item>> {
  return new Map((await db.banks()).flatMap((b) => b.items.map((i) => [i.id, i] as const)));
}

export async function lessonsCli(cmd: string, args: string[], db: Backend) {
  switch (cmd) {
    case "misses": {
      const day = flag(args, "--day") ?? localDay(new Date().toISOString());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail("Usage: misses [--day YYYY-MM-DD]");
      const [days, items, lessons] = await Promise.all([db.attempts(), itemMap(db), db.lessons()]);
      const misses = missesFor(day, Object.values(days).flat(), items, lessons);
      const due = shakyQueue(lessons, day).map((s) => ({
        id: s.card.id,
        concept: s.card.concept,
        since: s.since,
        lesson: s.lessonDay,
        gotDays: s.gotDays,
        itemIds: s.card.itemIds,
      }));
      console.log(JSON.stringify({ day, backend: db.kind, misses, shakyDue: due }, null, 1));
      break;
    }

    case "lesson-write": {
      const [day, file] = args;
      const usage = "Usage: lesson-write <YYYY-MM-DD> <lesson.json>  (the file holds {cards, quiz})";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? "")) fail(usage);
      const raw = readJsonFile(file, usage);
      let incoming: Lesson;
      try {
        incoming = validateLesson({
          ...raw,
          day,
          written: typeof raw.written === "string" ? raw.written : new Date().toISOString(),
          ratings: [],
        });
      } catch (e) {
        fail(`Not written: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Every item it names must exist, and the quiz may only use questions a session may serve.
      const items = await itemMap(db);
      const problems: string[] = [];
      for (const c of incoming.cards)
        for (const id of [...c.itemIds, ...c.mistakes.map((m) => m.itemId)])
          if (!items.has(id)) problems.push(`Card ${c.id} names ${id}, which isn't in any bank`);
      for (const id of incoming.quiz) {
        const it = items.get(id);
        if (!it) problems.push(`Quiz item ${id} isn't in any bank`);
        else if (it.kind !== "mcq" || !servable(it))
          problems.push(`Quiz item ${id} can't be served (not an MCQ, or its key or fact-check is missing)`);
      }
      if (problems.length) fail(`Not written (${plural(problems.length, "problem")}):\n- ${problems.join("\n- ")}`);
      const others = (await db.lessons()).filter((l) => l.day !== day);
      const stored = await db.writeLesson(day, (current) => mergeLesson(current, incoming, others));
      const back = stored.cards.filter((c) => c.returning).length;
      const unchecked = stored.cards.filter((c) => !c.checked).length;
      console.log(
        `Wrote the lesson for ${day} to ${db.kind}: ${plural(stored.cards.length, "card")}` +
          `${back ? ` (${back} brought back as still shaky)` : ""}, ` +
          `${unchecked ? `${unchecked} NOT fact-checked (shown as such)` : "all fact-checked"}, ` +
          `quiz of ${stored.quiz.length}; ${plural(stored.ratings.length, "rating")} kept.`,
      );
      break;
    }

    case "lessons": {
      const lessons = await db.lessons();
      if (!lessons.length) console.log(`No lessons in ${db.kind} yet.`);
      for (const l of lessons) {
        const rated = l.cards.map((c) => latestRating(l, c.id)?.rating);
        console.log(
          `${l.day}  ${l.cards.length} cards (${l.cards.filter((c) => c.checked).length} checked)  ` +
            `quiz ${l.quiz.length}  got ${rated.filter((r) => r === "got").length} · ` +
            `shaky ${rated.filter((r) => r === "shaky").length} · unrated ${rated.filter((r) => !r).length}`,
        );
        for (const c of l.cards)
          console.log(
            `    ${c.id.padEnd(36)} ${c.checked ? "checked " : "UNCHECKED"} ${latestRating(l, c.id)?.rating ?? "-"}` +
              `${c.returning ? `  (back, shaky since ${c.returning})` : ""}  ${c.concept}`,
          );
      }
      const due = shakyQueue(lessons);
      if (due.length) {
        console.log(`\nShaky cards due back (${due.length}):`);
        for (const s of due) console.log(`  ${s.card.id} · shaky since ${s.since} · got on ${s.gotDays} later day(s)`);
      }
      break;
    }

    case "week-note": {
      const [week, file] = args;
      const usage =
        "Usage: week-note <YYYY-Www> <note.json>  (the file holds {lines: [{text, evidence: {route, label}}]})";
      if (!/^\d{4}-W\d{2}$/.test(week ?? "")) fail(usage);
      const raw = readJsonFile(file, usage);
      let note: WeeklyNote;
      try {
        note = validateWeeklyNote({
          ...raw,
          week,
          written: typeof raw.written === "string" ? raw.written : new Date().toISOString(),
        });
      } catch (e) {
        fail(`Not written: ${e instanceof Error ? e.message : String(e)}`);
      }
      await db.setWeek(note);
      console.log(`Wrote the weekly note for ${week} to ${db.kind}: ${plural(note.lines.length, "line")}.`);
      break;
    }

    case "week-data": {
      const n = Math.min(12, Math.max(1, Number(flag(args, "--weeks") ?? 1) || 1));
      const [days, items, lessons] = await Promise.all([db.attempts(), itemMap(db), db.lessons()]);
      const attempts = Object.values(days).flat();
      const now = new Date();
      const thisWeek = isoWeek(localDay(now.toISOString()));
      const weeks = Array.from({ length: n }, (_, i) => shiftWeek(thisWeek, -i));
      console.log(
        JSON.stringify(
          {
            asOf: now.toISOString(),
            backend: db.kind,
            weeks: weeks.map((w) => weekFacts(w, attempts, items, lessons)),
            due: dueLoad(attempts, items, now),
            shakyDue: shakyQueue(lessons).map((s) => ({ id: s.card.id, concept: s.card.concept, since: s.since })),
          },
          null,
          1,
        ),
      );
      break;
    }

    default:
      fail(`Unknown lessons command ${cmd}`);
  }
}
