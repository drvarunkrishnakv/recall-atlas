// Essay, Ethics case studies and Medical Science (M12) for Claude's CLI, dispatched from atlas.ts.
//
//   mains-extra                              what's loaded, and how much you've done with it
//   mains-extra-import <file.json> [--replace]   load {essay, ethics, medical} (each record checked
//                                            first); --replace drops content not in the file (never
//                                            your own records)
//   mains-extra-work [essay|ethics|medical]  your outlines, bench attempts, ratings and drills, for
//                                            Claude's runs to read
import { existsSync, readFileSync } from "node:fs";
import type { Backend } from "../server/backend.ts";
import {
  BENCH_STEPS,
  EXTRA_KINDS,
  RATING_LABEL,
  validateImport,
  VERDICT_LABEL,
  type ExtraKind,
} from "../src/lib/mains-extra.ts";

const mins = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;

export async function mainsExtraCommand(db: Backend, cmd: string, args: string[], fail: (msg: string) => never) {
  if (cmd === "mains-extra-import") {
    const file = args[0];
    if (!file || !existsSync(file)) fail("Usage: mains-extra-import <file.json> [--replace]");
    let data: ReturnType<typeof validateImport>;
    try {
      data = validateImport(JSON.parse(readFileSync(file, "utf8")));
    } catch (e) {
      fail(`Not imported: ${e instanceof Error ? e.message : String(e)}`);
    }
    await db.mainsExtra.setContent(data, args.includes("--replace"));
    const unchecked = data.medical.filter((l) => l.note && !l.note.checked).length;
    console.log(
      `Imported into ${db.kind}: ${data.essay.length} essay topics (${data.essay.filter((t) => t.decode).length} with a breakdown), ` +
        `${data.ethics.length} cases (${data.ethics.filter((c) => c.text).length} in full), ` +
        `${data.medical.length} syllabus lines (${data.medical.filter((l) => l.pyqs).length} with PYQs` +
        `${unchecked ? `, ${unchecked} notes not fact-checked yet` : ""}).`,
    );
    return;
  }

  const all = await db.mainsExtra.load();
  if (cmd === "mains-extra") {
    const w = all.work;
    const outlines = Object.values(w.essay).reduce((n, x) => n + x.outlines.length, 0);
    const attempts = Object.values(w.ethics).reduce((n, x) => n + x.attempts.length, 0);
    const rated = Object.values(w.medical).filter((x) => x.rating).length;
    const drills = Object.values(w.medical).reduce((n, x) => n + x.drills.length, 0);
    console.log(`In ${db.kind}:`);
    console.log(`  Essay: ${all.essay.length} topics; your outlines ${outlines}`);
    console.log(`  Ethics: ${all.ethics.length} cases; your bench attempts ${attempts}`);
    console.log(`  Medical Science: ${all.medical.length} syllabus lines; rated ${rated}; diagram drills ${drills}`);
    for (const l of all.medical.filter((l) => l.note))
      console.log(`  ${l.id} note (${l.note!.kind}, ${l.note!.checked ? "checked" : "NOT checked"}): ${l.note!.text}`);
    return;
  }

  if (cmd === "mains-extra-work") {
    const only = args[0] as ExtraKind | undefined;
    if (only && !EXTRA_KINDS.includes(only)) fail("Usage: mains-extra-work [essay|ethics|medical]");
    if (!only || only === "essay")
      for (const t of all.essay) {
        const w = all.work.essay[t.id];
        if (!w) continue;
        console.log(`\n## Essay ${t.id}: ${t.text}`);
        if (w.tried) console.log(`Your own angles (${w.tried.at}): ${w.tried.text}`);
        for (const o of w.outlines) {
          console.log(`- Outline ${o.id} (${o.at}, ${mins(o.ms)} on the clock)`);
          console.log(`  Thesis: ${o.thesis || "—"}\n  Opening: ${o.opening || "—"}`);
          o.paras.forEach((p, i) => p.text && console.log(`  ${i + 1}. [${p.angle ?? "no angle"}] ${p.text}`));
          console.log(`  Closing: ${o.closing || "—"}`);
        }
        for (const s of w.sittings) console.log(`- Timed ${s.kind} (${s.at}): ${mins(s.ms)}`);
      }
    if (!only || only === "ethics")
      for (const c of all.ethics) {
        const w = all.work.ethics[c.id];
        if (!w) continue;
        console.log(`\n## Case ${c.id}: ${c.title}`);
        for (const a of w.attempts) {
          console.log(`- Attempt ${a.id} (${a.updated})`);
          console.log(`  ${BENCH_STEPS[0]}: ${[...a.stakeholders, ...a.own].join("; ") || "—"}`);
          console.log(`  ${BENCH_STEPS[1]}: ${a.issues.join("; ") || "—"}`);
          a.verdicts.forEach(
            (v, i) => v && console.log(`  Option ${i + 1} (${c.key?.options[i]?.t ?? "?"}): ${VERDICT_LABEL[v]}`),
          );
          console.log(`  ${BENCH_STEPS[3]}: ${a.decision || "—"}\n  ${BENCH_STEPS[4]}: ${a.system || "—"}`);
          if (a.answer) console.log(`  Answer (${a.answerMs ? mins(a.answerMs) : "untimed"}): ${a.answer}`);
        }
      }
    if (!only || only === "medical")
      for (const l of all.medical) {
        const w = all.work.medical[l.id];
        if (!w) continue;
        const drills = w.drills.map((d) => `${d.diagram} ${mins(d.ms)} (${d.at.slice(0, 10)})`).join(", ");
        console.log(
          `${l.id}\t${w.rating ? RATING_LABEL[w.rating] : "not rated"}\t${l.label}${drills ? `\tdrills: ${drills}` : ""}`,
        );
      }
  }
}
