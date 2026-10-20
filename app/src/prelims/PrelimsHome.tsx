// Prelims mode's home: the countdown, your rating, a one-click start, and every topic with its
// new and due questions. (M11 brings the chosen Centre-stage design with subject tiles.)
import { useEffect, useState } from "react";
import { Link } from "../components/nav";
import { usePractice } from "../content/practice";
import { bankCounts } from "../lib/srs";
import { daysUntil, longDate, PRELIMS_2027 } from "../lib/exam";
import { servable } from "../lib/practice";
import "./prelims.css";

const SIZES = [20, 50, 100];

export function PrelimsHome() {
  const practice = usePractice();
  const [size, setSize] = useState(20);
  const [mode, setMode] = useState<"practice" | "exam">("practice");
  useEffect(() => {
    document.title = "Prelims · Mains Atlas";
  }, []);
  const days = daysUntil(PRELIMS_2027);
  const subjects = new Map<string, typeof practice.banks>();
  for (const b of practice.banks) subjects.set(b.subject, [...(subjects.get(b.subject) ?? []), b]);
  const all = practice.banks.flatMap((b) => b.items).filter((i) => i.kind === "mcq" && servable(i));
  const total = bankCounts(all, practice.states);
  const q = (banks?: string) => `/prelims/session?n=${size}&mode=${mode}${banks ? `&banks=${banks}` : ""}`;

  return (
    <article className="dash prelims-home">
      <header className="board-hero">
        <h1>Prelims</h1>
        <p>
          <b>{days > 0 ? `${days} days` : days === 0 ? "Today" : "Done"}</b> to Prelims · {longDate(PRELIMS_2027)}
        </p>
      </header>

      {practice.status === "loading" || practice.status === "idle" ? (
        <p className="loading">Loading your practice…</p>
      ) : practice.status === "error" ? (
        <p className="loading">Couldn't load practice: {practice.error}</p>
      ) : !practice.banks.length ? (
        <section className="board-card">
          <h2>No questions loaded yet</h2>
          <p>
            Practice uses PYQs whose answers were checked against UPSC's official keys. Claude loads them with{" "}
            <code>atlas practice-import</code>.
          </p>
        </section>
      ) : (
        <>
          <section className="board-card start" aria-label="Practise now">
            <div className="start-main">
              <div className="rating">
                <span className="label">Your rating</span>
                <b>{practice.rating}</b>
              </div>
              <Link className="board-btn big" to={q()}>
                Practise now
                <span>
                  {Math.min(size, total.due)} due · {Math.max(0, Math.min(size - total.due, total.fresh))} new
                </span>
              </Link>
            </div>
            <div className="start-opts">
              <span className="seg" role="group" aria-label="Questions">
                {SIZES.map((n) => (
                  <button key={n} type="button" aria-pressed={size === n} onClick={() => setSize(n)}>
                    {n}
                  </button>
                ))}
              </span>
              <span className="seg" role="group" aria-label="Mode">
                <button type="button" aria-pressed={mode === "practice"} onClick={() => setMode("practice")}>
                  Answer after each
                </button>
                <button type="button" aria-pressed={mode === "exam"} onClick={() => setMode("exam")}>
                  Exam mode
                </button>
              </span>
              <Link className="chip-btn" to="/prelims/notebook">
                Mistake notebook
              </Link>
            </div>
            <p className="muted small">
              {all.length} questions ready · {total.due} due now · {total.fresh} not seen yet · {total.review} settled
            </p>
          </section>

          <section className="topics" aria-label="Topics">
            {[...subjects].map(([subject, banks]) => (
              <div key={subject} className="topic-group">
                <h2>{subject}</h2>
                <div className="topic-rows">
                  {banks.map((b) => {
                    const items = b.items.filter((i) => i.kind === "mcq" && servable(i));
                    const c = bankCounts(items, practice.states);
                    return (
                      <Link key={b.id} className="topic-row" to={q(b.id)}>
                        <span className="t">{b.topic}</span>
                        <span className="n">{items.length}</span>
                        <span className={`due${c.due ? " on" : ""}`}>{c.due} due</span>
                        <span className="new">{c.fresh} new</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </article>
  );
}
