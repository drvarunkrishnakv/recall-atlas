// Touch gestures for phones and tablets.
//   useSwipeToClose — drag a bottom sheet down by its top to close it (phones).
//   useEdgeBack     — swipe in from the left edge to go back, in the iPhone/iPad home-screen app,
//                     which has no back gesture of its own (browsers and Android already do).
import { useEffect, useRef, type RefObject } from "react";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Phones: a drag that starts in the sheet's top band (its grab bar and header) moves the
 *  sheet with the finger; let go far or fast enough and it slides away and closes. A tap on
 *  a button in that band still works: the drag only starts once the finger moves down. */
export function useSwipeToClose(sheet: HTMLElement | null, onClose: () => void, band = 72) {
  // Kept in a ref, so a re-render mid-drag doesn't drop the gesture.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!sheet) return;
    let start: { y: number; t: number; id: number } | null = null;
    let dragging = false;
    let dy = 0;

    const down = (e: PointerEvent) => {
      dy = 0;
      if (window.innerWidth > 700 || e.button !== 0) return;
      if (e.clientY - sheet.getBoundingClientRect().top > band) return;
      start = { y: e.clientY, t: performance.now(), id: e.pointerId };
      dragging = false;
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      dy = Math.max(0, e.clientY - start.y);
      if (!dragging && dy > 8) {
        dragging = true;
        sheet.setPointerCapture(e.pointerId);
        sheet.style.transition = "none";
      }
      if (dragging) {
        e.preventDefault();
        sheet.style.transform = `translateY(${dy}px)`;
      }
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const speed = dy / Math.max(1, performance.now() - start.t);
      start = null;
      if (!dragging) return;
      dragging = false;
      const gone = dy > Math.min(140, sheet.offsetHeight * 0.25) || speed > 0.6;
      sheet.style.transition = reduced() ? "none" : `transform ${gone ? 0.2 : 0.32}s cubic-bezier(0.2, 0.8, 0.2, 1)`;
      sheet.style.transform = gone ? "translateY(100%)" : "";
      if (gone) window.setTimeout(() => close.current(), reduced() ? 0 : 190);
      else window.setTimeout(() => (sheet.style.transition = ""), 340);
    };
    // A tap that turned into a drag shouldn't also press the button it started on.
    const click = (e: MouseEvent) => {
      if (dy > 8) {
        e.stopPropagation();
        e.preventDefault();
        dy = 0;
      }
    };
    sheet.addEventListener("pointerdown", down);
    sheet.addEventListener("pointermove", move);
    sheet.addEventListener("pointerup", up);
    sheet.addEventListener("pointercancel", up);
    sheet.addEventListener("click", click, true);
    return () => {
      sheet.removeEventListener("pointerdown", down);
      sheet.removeEventListener("pointermove", move);
      sheet.removeEventListener("pointerup", up);
      sheet.removeEventListener("pointercancel", up);
      sheet.removeEventListener("click", click, true);
    };
  }, [sheet, band]);
}

/** iPhone/iPad home-screen app: swipe in from the left edge to go back. `arrow` is the
 *  little round arrow that follows the finger. */
export function useEdgeBack(arrow: RefObject<HTMLElement | null>, back: () => void) {
  const go = useRef(back);
  go.current = back;
  useEffect(() => {
    if ((navigator as Navigator & { standalone?: boolean }).standalone !== true) return;
    let from: { x: number; y: number } | null = null;
    let dx = 0;
    const show = (x: number, y: number, on: boolean) => {
      const el = arrow.current;
      if (!el) return;
      el.style.top = `${y - 22}px`;
      el.style.opacity = on ? String(Math.min(1, x / 80)) : "0";
      el.style.transform = `translateX(${Math.min(x, 96) - 48}px) scale(${x > 80 ? 1.08 : 1})`;
    };
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      from = e.touches.length === 1 && t.clientX < 24 ? { x: t.clientX, y: t.clientY } : null;
      dx = 0;
    };
    const move = (e: TouchEvent) => {
      if (!from) return;
      const t = e.touches[0];
      dx = t.clientX - from.x;
      if (Math.abs(t.clientY - from.y) > Math.max(40, dx)) {
        from = null; // a scroll, not a swipe
        show(0, 0, false);
        return;
      }
      show(dx, t.clientY, true);
    };
    const end = () => {
      if (from && dx > 80) go.current();
      from = null;
      show(0, 0, false);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, [arrow]);
}
