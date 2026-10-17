import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
import "@fontsource/bricolage-grotesque/600.css";
import "@fontsource/bricolage-grotesque/700.css";
import "./index.css";
import { Layout } from "./components/Layout";
import { applySavedTheme } from "./components/ThemeToggle";
import { loadContent } from "./content/store";
import { refreshStudy } from "./content/study";
import { PaperPage, TopicPage, NotePage, CardPage, CardsPage, NotFound } from "./pages";
import { HomePage, InboxPage, RevisePage, SubjectPage } from "./dashboard";

applySavedTheme();
// The cloud build loads notes only after Google sign-in (AuthGate); locally they load at once.
// (MODE is checked inline so the local build leaves Firebase out entirely.)
const CLOUD = import.meta.env.MODE === "cloud";
const AuthGate = import.meta.env.MODE === "cloud" ? lazy(() => import("./components/AuthGate")) : null;
if (!CLOUD) {
  void loadContent();
  void refreshStudy();
}
// The installed app (Android, iPad) opens offline from the service worker's copy.
if (import.meta.env.MODE === "cloud" && import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined));

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/notes/:noteId", element: <NotePage /> },
      { path: "/inbox", element: <InboxPage /> },
      { path: "/revise", element: <RevisePage /> },
      { path: "/cards", element: <CardsPage /> },
      { path: "/cards/:cardId", element: <CardPage /> },
      { path: "/:paperId", element: <PaperPage /> },
      { path: "/:paperId/:subjectId", element: <SubjectPage /> },
      { path: "/:paperId/:subjectId/:topicId", element: <TopicPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {AuthGate ? (
      <Suspense>
        <AuthGate>
          <RouterProvider router={router} />
        </AuthGate>
      </Suspense>
    ) : (
      <RouterProvider router={router} />
    )}
  </StrictMode>,
);
