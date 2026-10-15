import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-serif/500.css";
import "@fontsource/ibm-plex-serif/600.css";
import "./index.css";
import { Layout } from "./components/Layout";
import { applySavedTheme } from "./components/ThemeToggle";
import { HomePage, PaperPage, SubjectPage, TopicPage, NotePage, CardPage, CardsPage, NotFound } from "./pages";

applySavedTheme();

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/notes/:noteId", element: <NotePage /> },
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
