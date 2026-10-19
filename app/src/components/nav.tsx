// Links that animate a change of page with the browser's View Transitions, where supported:
// the page glides in and the sidebar stays put. A change of filters or a peek on the same page
// doesn't animate, and back and forward replay the animation (React Router does that).
import type { ReactNode } from "react";
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  useLocation,
  useViewTransitionState,
  type LinkProps,
  type NavLinkProps,
  type To,
} from "react-router";

const pathOf = (to: To) => (typeof to === "string" ? to.split(/[?#]/)[0] : (to.pathname ?? ""));

/** Animate unless the link stays on this page (only its search or hash changes). */
function useAnimate(to: To, own: boolean | undefined) {
  const { pathname } = useLocation();
  const path = pathOf(to);
  return own ?? (path !== "" && path !== pathname);
}

export function Link({ viewTransition, ...props }: LinkProps) {
  return <RouterLink viewTransition={useAnimate(props.to, viewTransition)} {...props} />;
}

export function NavLink({ viewTransition, ...props }: NavLinkProps) {
  return <RouterNavLink viewTransition={useAnimate(props.to, viewTransition)} {...props} />;
}

/** A title in a list that glides into the heading of the page it opens (and back again). */
export function MorphTitle({ to, children }: { to: string; children: ReactNode }) {
  const moving = useViewTransitionState(to);
  return (
    <span className="morph-title" style={moving ? { viewTransitionName: "page-title" } : undefined}>
      {children}
    </span>
  );
}

/** Runs a DOM change (a theme switch, say) as a soft crossfade where the browser can. */
export function withFade(change: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return change();
  const root = document.documentElement;
  root.classList.add("vt-fade"); // a plain crossfade, without the page-change glide
  const t = doc.startViewTransition(change) as { finished: Promise<void> };
  void t.finished.finally(() => root.classList.remove("vt-fade"));
}
