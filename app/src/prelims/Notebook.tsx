// The Mistake notebook (the chosen design: Notebook 2 · Two panes, with the revision book as a
// second view). Every question you have missed, grouped by subject and topic; pick one to see
// your answer, the right one, each statement's truth and your history with it. A miss counts as
// fixed once you get it right on two later days (successive relearning).
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { usePractice } from "../content/practice";
import { statementTruth } from "../lib/statements";
import { GRADE_LABEL, servable, type Attempt, type McqItem } from "../lib/practice";
import "./prelims.css";

const LETTERS = ["A", "B", "C", "D", "E"];
type Filter = "all" | "shaky" | "confident" | "twice" | "week";
const FILTERS: [Filter, string][] = [
  ["all", "All misses"],
  ["shaky", "Still shaky"],
  ["confident", "Confident misses"],
  ["twice", "Missed 2+"],
  ["week", "This week"],
];

export interface Mistake {
  item: McqItem;
  subject: string;
  attempts: Attempt[];
  misses: number;
  confident: boolean;
  fixed: boolean;
  lastMiss: Attempt;
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

/** Every missed MCQ with its history; fixed = right on two later days since the last miss. */
export function mistakes(items: Map<string, McqItem>, subjects: Map<string, string>, all: Attempt[]): Mistake[] {
  const by = new Map<string, Attempt[]>();
  for (const a of all) if (a.kind === "mcq") by.set(a.itemId, [...(by.get(a.itemId) ?? []), a]);
  const out: Mistake[] = [];
  for (const [id, list] of by) {
    const item = items.get(id);
    if (!item) continue;
    const sorted = [...list].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const misses = sorted.filter((a) => !a.correct);
    if (!misses.length) continue;
    const lastMiss = misses[misses.length - 1];
    const laterRightDays = new Set(
      sorted.filter((a) => a.correct && Date.parse(a.at) > Date.parse(lastMiss.at)).map((a) => dayOf(a.at)),
    );
    laterRightDays.delete(dayOf(lastMiss.at));
    out.push({
      item,
      subject: subjects.get(item.bank) ?? "",
      attempts: sorted,
      misses: misses.length,
      confident: misses.some((a) => a.sure),
      fixed: laterRightDays.size >= 2,
      lastMiss,
    });
  }
  return out.sort((a, b) => Date.parse(b.lastMiss.at) - Date.parse(a.lastMiss.at));
}

export default function Notebook() {
  const practice = usePractice();
  const [params, setParams] = useSearchParams();
  const filter = (params.get("filter") as Filter) || "all";
  const view = params.get("view") === "book" ? "book" : "panes";
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    document.title = "Mistake notebook · Mains Atlas";
  }, []);

  const list = useMemo(() => {
    const items = new Map([...practice.items].filter(([, i]) => i.kind === "mcq") as [string, McqItem][]);
    const subjects = new Map(practice.banks.map((b) => [b.id, b.subject]));
    return mistakes(items, subjects, Object.values(practice.days).flat());
  }, [practice.items, practice.banks, practice.days]);

  const weekAgo = Date.now() - 7 * 864e5;
  const shown = list.filter((m) =>
    filter === "shaky"
      ? !m.fixed
      : filter === "confident"
        ? m.confident
        : filter === "twice"
          ? m.misses >= 2
          : filter === "week"
            ? Date.parse(m.lastMiss.at) >= weekAgo
            : true,
  );
  const groups = new Map<string, Mistake[]>();
  for (const m of shown) {
    const k = `${m.subject} · ${m.item.topic}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  const current = shown.find((m) => m.item.id === selected) ?? shown[0];
  const shaky = list.filter((m) => !m.fixed);
  const practiseIds = shown.filter((m) => !m.fixed && servable(m.item)).map((m) => m.item.id);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  if (practice.status !== "ready")
    return (
      <article className="dash prelims-page">
        <p className="loading">{practice.status === "error" ? `Couldn't load: ${practice.error}` : "Loading…"}</p>
      </article>
    );

  return (
    <article className="dash prelims-page notebook">
      <header className="nb-head">
        <h1>Mistake notebook</h1>
        <span className="muted">
          {list.length} missed · {shaky.length} still shaky · {list.length - shaky.length} fixed
        </span>
        <div className="nb-view" role="tablist" aria-label="View">
          <button type="button" role="tab" aria-selected={view === "panes"} onClick={() => set("view", "panes")}>
            Two panes
          </button>
          <button type="button" role="tab" aria-selected={view === "book"} onClick={() => set("view", "book")}>
            Revision book
          </button>
        </div>
      </header>
      <div className="nb-filters" role="group" aria-label="Filter">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            type="button"
            className={`chip-btn${filter === f ? " on" : ""}`}
            aria-pressed={filter === f}
            onClick={() => set("filter", f)}
          >
            {label}
          </button>
        ))}
        {practiseIds.length > 0 && (
          <Link className="board-btn small" to={`/prelims/session?items=${practiseIds.slice(0, 50).join(",")}`}>
            Practise {Math.min(50, practiseIds.length)} shaky ones
          </Link>
        )}
      </div>

      {!list.length ? (
        <p className="nb-empty">No misses yet. Every question you get wrong in a session lands here.</p>
      ) : view === "book" ? (
        <section className="nb-book" aria-label="Revision book">
          {[...groups].map(([g, ms]) => (
            <div key={g} className="nb-book-group">
              <h2>{g}</h2>
              {ms.map((m) => (
                <div key={m.item.id} className="nb-book-item">
                  <p className="q">{m.item.stem}</p>
                  {m.item.statements && (
                    <ol>
                      {m.item.statements.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                  <p className="a">
                    Answer {LETTERS[m.item.answer]}: {m.item.options[m.item.answer]}
                    <span className="muted">
                      {" "}
                      · missed {m.misses}×{m.fixed ? " · fixed" : ""}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          ))}
        </section>
      ) : (
        <div className="nb-panes">
          <nav className="nb-list" aria-label="Missed questions">
            {[...groups].map(([g, ms]) => (
              <div key={g}>
                <h2>{g}</h2>
                {ms.map((m) => (
                  <button
                    key={m.item.id}
                    type="button"
                    className={`nb-row${current?.item.id === m.item.id ? " on" : ""}`}
                    onClick={() => setSelected(m.item.id)}
                  >
                    <span className="t">{m.item.stem.split("\n")[0]}</span>
                    <span className="tags">
                      {m.fixed ? <em className="fixed">Fixed</em> : <em className="shaky">Still shaky</em>}
                      {m.confident && <em className="conf">Confident miss</em>}
                      {m.misses > 1 && <em>{m.misses}×</em>}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          {current && <Detail m={current} />}
        </div>
      )}
    </article>
  );
}

function Detail({ m }: { m: Mistake }) {
  const it = m.item;
  const truth = it.statements ? statementTruth(it.options, it.answer, it.statements.length) : null;
  const chosen = m.lastMiss.chosen;
  return (
    <section className="nb-detail" aria-label="The question">
      <span className="chip">
        {it.source.type === "pyq" ? `PYQ ${it.source.year}` : "Practice"} · {it.topic}
      </span>
      <p className="q-stem">{it.stem}</p>
      {it.statements && (
        <ol className="q-statements">
          {it.statements.map((s, i) => (
            <li key={i} className={truth ? (truth[i] ? "is-true" : "is-false") : ""}>
              <span className="st-text">{s}</span>
              {truth && <span className="st-truth">{truth[i] ? "True" : "False"}</span>}
            </li>
          ))}
        </ol>
      )}
      {it.ask && <p className="q-ask">{it.ask}</p>}
      <div className="q-options">
        {it.options.map((o, i) => (
          <div key={i} className={`q-option ${i === it.answer ? "right" : i === chosen ? "wrong" : ""}`}>
            <b>{LETTERS[i]}</b>
            <span>{o}</span>
            {i === chosen && <em>your answer</em>}
          </div>
        ))}
      </div>
      {it.explanation && (
        <details className="explain" open>
          <summary>
            Explanation{" "}
            <span className="muted">
              · {it.explanation.source}
              {it.explanation.checked ? "" : " · not fact-checked"}
            </span>
          </summary>
          <p>{it.explanation.text}</p>
        </details>
      )}
      <h3>Your history</h3>
      <ul className="nb-history">
        {m.attempts.map((a) => (
          <li key={a.id} className={a.correct ? "right" : "wrong"}>
            <span>{new Date(a.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            <b>{a.correct ? "Right" : `Wrong (${LETTERS[a.chosen ?? 0]})`}</b>
            <span>
              {a.sure === undefined ? "" : a.sure ? "sure" : "unsure"}
              {a.grade ? ` · ${GRADE_LABEL[a.grade]}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
