// Prelims and Mains modes. The URL decides the mode: Prelims lives under /prelims and every
// other route is Mains. The switch takes you back to the last page you had open in the other
// mode (remembered per device), or to that mode's home.

export type Mode = "prelims" | "mains";

export const MODES: readonly Mode[] = ["prelims", "mains"];
export const MODE_HOME: Record<Mode, string> = { prelims: "/prelims", mains: "/" };
export const MODE_LABEL: Record<Mode, string> = { prelims: "Prelims", mains: "Mains" };

export const modeOf = (pathname: string): Mode =>
  pathname === "/prelims" || pathname.startsWith("/prelims/") ? "prelims" : "mains";

/** The localStorage key for the last page of a mode. */
export const modePathKey = (mode: Mode) => `atlas-mode-path-${mode}`;

/** Where the switch to `to` should go: the saved page if it is a safe in-app path of that mode, else its home. */
export function switchTarget(to: Mode, saved: string | null | undefined): string {
  if (!saved || !saved.startsWith("/") || saved.startsWith("//") || saved.includes("\\")) return MODE_HOME[to];
  const path = saved.split(/[?#]/)[0];
  return modeOf(path) === to ? saved : MODE_HOME[to];
}

/** Pages both modes share (Settings). They keep the mode you came from. */
const SHARED = new Set(["/settings"]);
export const isShared = (pathname: string) => SHARED.has(pathname);

/** The mode a page belongs to; a shared page takes `last`, the mode you were in. */
export const modeFor = (pathname: string, last: Mode): Mode => (isShared(pathname) ? last : modeOf(pathname));
