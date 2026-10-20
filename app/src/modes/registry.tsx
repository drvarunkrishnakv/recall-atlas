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
  // M8: the Mains answer loop.
  { to: "/mains/write", label: "Write", icon: "pen" },
  { to: "/mains/feedback", label: "Feedback", icon: "feedback" },
];

/** Mains mode's added pages. */
export const mainsRoutes: RouteObject[] = [
  // M8: write an answer, its marked page, and the Feedback tab.
  { path: "/mains/write", element: lazyPage(() => import("../mains/Write"), "Loading the desk") },
  { path: "/mains/answers/:id", element: lazyPage(() => import("../mains/AnswerPage"), "Loading the answer") },
  { path: "/mains/feedback", element: lazyPage(() => import("../mains/FeedbackTab"), "Loading your feedback") },
];
