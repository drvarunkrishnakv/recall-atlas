// Prelims mode's home. For now it counts down to the exam and says what comes next; the
// practice screens arrive milestone by milestone (docs/BUILD_PLAN.md, M7 on).
import { useEffect } from "react";
import { daysUntil, longDate, PRELIMS_2027 } from "../lib/exam";

export function PrelimsHome() {
  useEffect(() => {
    document.title = "Prelims · Mains Atlas";
  }, []);
  const days = daysUntil(PRELIMS_2027);
  return (
    <article className="dash prelims-home">
      <header className="board-hero">
        <h1>Prelims</h1>
        <p>
          <b>{days > 0 ? `${days} days` : days === 0 ? "Today" : "Done"}</b> to Prelims · {longDate(PRELIMS_2027)}
        </p>
      </header>
      <section className="board-card">
        <h2>Practice starts with the next update</h2>
        <p>
          MCQ sessions where you mark each statement, lock in sure or unsure, and press one of eight buttons for how it
          went. Spaced review brings each question back when you're about to forget it, and every miss goes to the
          Mistake notebook.
        </p>
      </section>
    </article>
  );
}
