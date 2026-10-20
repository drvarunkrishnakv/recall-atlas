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
];

/** Prelims mode's pages (below /prelims). */
export const prelimsRoutes: RouteObject[] = [
  { path: "/prelims/session", element: lazyPage(() => import("../prelims/Session"), "Loading the session") },
  { path: "/prelims/notebook", element: lazyPage(() => import("../prelims/Notebook"), "Loading the notebook") },
];

/** Mains-mode entries added after Home in the sidebar (the reader's own entries follow). */
export const MAINS_NAV: NavEntry[] = [];

/** Mains mode's added pages. */
export const mainsRoutes: RouteObject[] = [];
