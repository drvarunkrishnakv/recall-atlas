// Tick and buzz after each puzzle: a short tone (WebAudio) and a vibration where the phone has one.
// Muting is remembered on this device. Subject colours for the strip on cards and puzzles.
import { useCallback, useRef, useState } from "react";

const SOUND_KEY = "atlas-puzzle-sound";

function stored(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function useFeedback() {
  const [on, setOn] = useState(stored);
  const ctx = useRef<AudioContext | null>(null);

  const toggle = useCallback(() => {
    setOn((was) => {
      try {
        localStorage.setItem(SOUND_KEY, was ? "off" : "on");
      } catch {
        // Private mode: it just won't be remembered.
      }
      return !was;
    });
  }, []);

  const play = useCallback(
    (ok: boolean) => {
      if (!on) return;
      try {
        navigator.vibrate?.(ok ? 12 : [40, 50, 40]);
      } catch {
        // No vibration here.
      }
      try {
        const AC =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        ctx.current ??= new AC();
        const c = ctx.current;
        if (c.state === "suspended") void c.resume();
        const t = c.currentTime;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = ok ? "sine" : "square";
        if (ok) {
          osc.frequency.setValueAtTime(880, t);
          osc.frequency.exponentialRampToValueAtTime(1320, t + 0.06);
        } else {
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.linearRampToValueAtTime(105, t + 0.2);
        }
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(ok ? 0.12 : 0.05, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + (ok ? 0.1 : 0.24));
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + 0.26);
      } catch {
        // No sound here.
      }
    },
    [on],
  );

  return { on, toggle, play };
}

// One colour per subject, as on the Prelims Home design (Board 1 · Centre stage); others are grey.
const SUBJECT_COLOUR: Record<string, string> = {
  Polity: "#7c7cf0",
  Economy: "#e7a52c",
  Geography: "#3d9bd6",
  Environment: "#4fb873",
  "Science and Technology": "#23a597",
  "Modern History": "#a86fd0",
  "Ancient and Medieval History": "#c88a4a",
  "Art and Culture": "#d9699b",
  "International Relations": "#ee7a59",
};
export const subjectColour = (subject: string | undefined) => SUBJECT_COLOUR[subject ?? ""] ?? "#8f8a80";

export const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
