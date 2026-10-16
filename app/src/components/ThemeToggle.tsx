import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type Mode = "system" | "light" | "dark";
const ORDER: Mode[] = ["system", "light", "dark"];
const LABEL: Record<Mode, string> = { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" };
const ICON: Record<Mode, string> = { system: "auto", light: "sun", dark: "moon" };

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

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(readMode);
  useEffect(() => {
    if (mode === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", mode);
    try {
      localStorage.setItem("atlas-theme", mode);
    } catch {
      /* storage blocked: the choice lasts for this visit only */
    }
    window.dispatchEvent(new Event("atlas-theme"));
  }, [mode]);
  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
  return (
    <button
      className="iconbtn"
      type="button"
      aria-label={`${LABEL[mode]}. Switch to ${next}`}
      title={LABEL[mode]}
      onClick={() => setMode(next)}
    >
      <Icon name={ICON[mode]} />
    </button>
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
