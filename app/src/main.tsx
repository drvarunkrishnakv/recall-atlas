import { StrictMode } from "react";
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
void loadContent();
void refreshStudy();

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
    <RouterProvider router={router} />
  </StrictMode>,
);
