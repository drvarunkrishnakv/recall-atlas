// The big PRELIMS / MAINS switch in the top bar. Each side is a link: it opens the last page
// you had open in that mode on this device, or the mode's home. Shared pages (Settings) keep
// the mode you came from.
import { useEffect } from "react";
import { useLocation } from "react-router";
import { Link } from "./nav";
import { isShared, MODE_LABEL, MODES, modeFor, modePathKey, switchTarget, type Mode } from "../lib/mode";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

let lastMode: Mode = read("atlas-mode") === "prelims" ? "prelims" : "mains";

/** The current mode: from the URL, or the one you came from on a shared page. */
export function useMode(): Mode {
  const { pathname } = useLocation();
  const mode = modeFor(pathname, lastMode);
  useEffect(() => {
    if (isShared(pathname) || mode === lastMode) return;
    lastMode = mode;
    write("atlas-mode", mode);
  }, [mode, pathname]);
  return mode;
}

export function ModeSwitch() {
  const { pathname, search } = useLocation();
  const mode = useMode();
  useEffect(() => {
    if (!isShared(pathname)) write(modePathKey(mode), pathname + search);
  }, [mode, pathname, search]);

  return (
    <div className="mode-switch" role="group" aria-label="Exam">
      {MODES.map((m) =>
        m === mode && !isShared(pathname) ? (
          <span key={m} className="mode-btn on" data-mode={m} aria-current="page">
            {MODE_LABEL[m]}
          </span>
        ) : (
          <Link
            key={m}
            className={`mode-btn${m === mode ? " on" : ""}`}
            data-mode={m}
            to={switchTarget(m, read(modePathKey(m)))}
          >
            {MODE_LABEL[m]}
          </Link>
        ),
      )}
    </div>
  );
}
