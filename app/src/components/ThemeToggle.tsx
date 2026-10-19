// The app's theme: follow the system, or always light, or always dark. The choice lives in
// Settings and is kept per device (localStorage); applySavedTheme runs before first paint.
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { withFade } from "./nav";

type Mode = "system" | "light" | "dark";
const MODES: { mode: Mode; label: string; icon: string }[] = [
  { mode: "system", label: "System", icon: "auto" },
  { mode: "light", label: "Light", icon: "sun" },
  { mode: "dark", label: "Dark", icon: "moon" },
];

function readMode(): Mode {
  try {
    const v = localStorage.getItem("atlas-theme");
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Applies the saved theme before first paint (called from main.tsx). */
export function applySavedTheme() {
  const mode = readMode();
  if (mode === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", mode);
}

/** System, Light or Dark, as one row of buttons (Settings). */
export function ThemeSetting() {
  const [mode, setMode] = useState<Mode>(readMode);
  useEffect(() => {
    const root = document.documentElement;
    const next = mode === "system" ? null : mode;
    // A soft crossfade between light and dark rather than a snap.
    // The theme event goes out once the new colours are on, so diagrams redraw in them.
    if (root.getAttribute("data-theme") !== next)
      withFade(() => {
        if (next) root.setAttribute("data-theme", next);
        else root.removeAttribute("data-theme");
        window.dispatchEvent(new Event("atlas-theme"));
      });
    try {
      localStorage.setItem("atlas-theme", mode);
    } catch {
      /* storage blocked: the choice lasts for this visit only */
    }
  }, [mode]);
  return (
    <div className="segmented" role="radiogroup" aria-label="Theme">
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          role="radio"
          aria-checked={mode === m.mode}
          className={mode === m.mode ? "on" : ""}
          onClick={() => setMode(m.mode)}
        >
          <Icon name={m.icon} />
          {m.label}
        </button>
      ))}
    </div>
  );
}

function resolvedTheme(): "light" | "dark" {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The theme actually showing ("system" resolved), for components that need a fixed value. */
export function useResolvedTheme(): "light" | "dark" {
  const [theme, setTheme] = useState(resolvedTheme);
  useEffect(() => {
    const update = () => setTheme(resolvedTheme());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("atlas-theme", update);
    mq.addEventListener("change", update);
    return () => {
      window.removeEventListener("atlas-theme", update);
      mq.removeEventListener("change", update);
    };
  }, []);
  return theme;
}
