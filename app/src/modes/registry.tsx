// Where each mode's screens plug in: their routes and their sidebar entries. Each milestone adds
// its own lines here, so the layout and the router don't need to know about every screen.
import { lazy, Suspense, type ReactNode } from "react";
import type { RouteObject } from "react-router";
import { PageSkeleton } from "../components/Skeleton";

export interface NavEntry {
  to: string;
  label: string;
  icon: string;
  /** Match only this exact path (for a mode's home). */
  end?: boolean;
}

const lazyPage = (load: () => Promise<{ default: React.ComponentType }>, label: string): ReactNode => {
  const Page = lazy(load);
  return (
    <Suspense fallback={<PageSkeleton label={label} />}>
      <Page />
    </Suspense>
  );
};

/** Prelims mode's sidebar, top to bottom. */
export const PRELIMS_NAV: NavEntry[] = [
  { to: "/prelims", label: "Home", icon: "home", end: true },
  { to: "/prelims/notebook", label: "Mistake notebook", icon: "list" },
  { to: "/prelims/lesson", label: "Tonight's lesson", icon: "moon" },
  { to: "/prelims/quiz", label: "Morning quiz", icon: "sun" },
  // M10: flashcards, puzzles and Rush.
  { to: "/prelims/cards", label: "Flashcards", icon: "cards" },
  { to: "/prelims/puzzles", label: "Puzzles", icon: "puzzle" },
  { to: "/prelims/rush", label: "Rush", icon: "bolt" },
  // M11: subject pages are reached from the Home tiles, so they get no entry of their own.
  { to: "/prelims/analytics", label: "Analytics", icon: "chart" },
];

/** Prelims mode's pages (below /prelims). */
export const prelimsRoutes: RouteObject[] = [
  { path: "/prelims/session", element: lazyPage(() => import("../prelims/Session"), "Loading the session") },
  { path: "/prelims/notebook", element: lazyPage(() => import("../prelims/Notebook"), "Loading the notebook") },
  { path: "/prelims/lesson", element: lazyPage(() => import("../lessons/Lesson"), "Loading tonight's lesson") },
  { path: "/prelims/quiz", element: lazyPage(() => import("../lessons/Quiz"), "Loading the morning quiz") },
  // M10: flashcards, puzzles and Rush.
  { path: "/prelims/cards", element: lazyPage(() => import("../practice/Cards"), "Loading flashcards") },
  { path: "/prelims/puzzles", element: lazyPage(() => import("../practice/Puzzles"), "Loading puzzles") },
  { path: "/prelims/rush", element: lazyPage(() => import("../practice/Rush"), "Loading Rush") },
  // M11: a subject's topics with the analytics drawer, and Analytics (the week's story).
  {
    path: "/prelims/subject/:subject",
    element: lazyPage(() => import("../homes/SubjectPage"), "Loading the subject"),
  },
  {
    path: "/prelims/analytics",
    element: lazyPage(() => import("../analytics/PrelimsAnalytics"), "Loading your analytics"),
  },
];

/** Mains-mode entries added after Home in the sidebar (the reader's own entries follow). */
export const MAINS_NAV: NavEntry[] = [
  // The order follows the chosen Mains Home sidebar. Write is the sidebar's main button, "Today's answer".
  { to: "/mains/notes", label: "Notes", icon: "notes" },
  { to: "/mains/feedback", label: "Feedback", icon: "feedback" },
  { to: "/mains/essay", label: "Essay", icon: "essay" },
  { to: "/mains/ethics", label: "Ethics case studies", icon: "ethics" },
  { to: "/mains/medical", label: "Medical Science", icon: "medical" },
  // M11: Mains Analytics (the week's story).
  { to: "/mains/analytics", label: "Analytics", icon: "chart" },
];

/** A named (not default) export of a lazily loaded module, as a page. */
const lazyNamed = <K extends string>(
  load: () => Promise<Record<K, React.ComponentType>>,
  name: K,
  label: string,
): ReactNode => lazyPage(() => load().then((m) => ({ default: m[name] })), label);

/** Mains mode's added pages. */
export const mainsRoutes: RouteObject[] = [
  // M8: write an answer, its marked page, and the Feedback tab.
  { path: "/mains/write", element: lazyPage(() => import("../mains/Write"), "Loading the desk") },
  { path: "/mains/answers/:id", element: lazyPage(() => import("../mains/AnswerPage"), "Loading the answer") },
  { path: "/mains/feedback", element: lazyPage(() => import("../mains/FeedbackTab"), "Loading your feedback") },
  // M12 (src/mains-extra/).
  { path: "/mains/notes", element: lazyPage(() => import("../mains-extra/Notes"), "Loading your notes") },
  { path: "/mains/essay", element: lazyPage(() => import("../mains-extra/Essay"), "Loading the essay topics") },
  {
    path: "/mains/essay/sprint/:id",
    element: lazyNamed(() => import("../mains-extra/EssayFlows"), "EssaySprint", "Loading the sprint"),
  },
  {
    path: "/mains/essay/write/:id",
    element: lazyNamed(() => import("../mains-extra/EssayFlows"), "FullEssay", "Loading the essay"),
  },
  {
    path: "/mains/essay/paper",
    element: lazyNamed(() => import("../mains-extra/EssayFlows"), "FullPaper", "Loading the paper"),
  },
  { path: "/mains/ethics", element: lazyPage(() => import("../mains-extra/Ethics"), "Loading the cases") },
  {
    path: "/mains/ethics/bench/:id",
    element: lazyNamed(() => import("../mains-extra/Ethics"), "EthicsBench", "Loading the bench"),
  },
  { path: "/mains/medical", element: lazyPage(() => import("../mains-extra/Medical"), "Loading the syllabus") },
  {
    path: "/mains/medical/draw/:line/:diagram",
    element: lazyNamed(() => import("../mains-extra/Medical"), "MedicalDraw", "Loading the drill"),
  },
  // M11: Mains Analytics (the week's story).
  {
    path: "/mains/analytics",
    element: lazyPage(() => import("../analytics/MainsAnalytics"), "Loading your analytics"),
  },
];
