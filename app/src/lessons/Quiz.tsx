// The morning quiz: the practice session in short form, on the items the last lesson chose (the
// night's misses and related checked PYQs). Read in the evening, quizzed the next morning
// (Mazza et al. 2016). Answers join the attempt log with mode "quiz", so FSRS and the Mistake
// notebook count them like any other answer.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { usePractice } from "../content/practice";
import { useLesson, useLessons } from "../content/lessons";
import { servable, type McqItem } from "../lib/practice";
import { Run } from "../prelims/Session";
import "../prelims/prelims.css";
import "./lessons.css";

export default function Quiz() {
  const [params] = useSearchParams();
  const practice = usePractice();
  const lessons = useLessons();
  const lesson = useLesson(params.get("day"));
  // The questions are fixed when the quiz starts, so answering doesn't reshuffle them.
  const [plan, setPlan] = useState<McqItem[] | null>(null);
  useEffect(() => {
    document.title = "Morning quiz · Mains Atlas";
  }, []);
  useEffect(() => {
    if (plan || practice.status !== "ready" || !lesson) return;
    setPlan(
      lesson.quiz
        .map((id) => practice.items.get(id))
        .filter((i): i is McqItem => !!i && i.kind === "mcq" && servable(i)),
    );
  }, [plan, practice.status, practice.items, lesson]);

  const error = practice.status === "error" ? practice.error : lessons.status === "error" ? lessons.error : null;
  if (error)
    return (
      <article className="dash prelims-page">
        <p className="loading">Couldn't load the quiz: {error}</p>
      </article>
    );
  if (lesson === null)
    return (
      <article className="dash prelims-page">
        <h1>No morning quiz yet</h1>
        <p className="muted">
          The quiz comes with each evening's lesson: the questions you missed that day and a few related ones.
        </p>
        <Link className="board-btn" to="/prelims">
          Back to Prelims
        </Link>
      </article>
    );
  if (!plan)
    return (
      <article className="dash prelims-page">
        <p className="loading">Loading the quiz…</p>
      </article>
    );
  if (!plan.length)
    return (
      <article className="dash prelims-page">
        <h1>No questions in this quiz</h1>
        <p className="muted">Only questions whose answers were checked are used.</p>
        <Link className="board-btn" to="/prelims/lesson">
          Back to the lesson
        </Link>
      </article>
    );
  return <Run items={plan} mode="quiz" />;
}
