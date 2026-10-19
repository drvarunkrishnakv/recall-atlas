import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** A thin bar across the top of the window that fills as you read down the page, full at its
 *  end. Hidden at the top and on pages short enough to read without scrolling. `target` is the
 *  note's body; when it grows (a diagram drawn, a chart loaded) the bar is worked out again. */
export function ReadingProgress({ target }: { target: HTMLElement | null }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = bar.current;
      if (!el) return;
      const span = document.documentElement.scrollHeight - window.innerHeight;
      const done = span > 0 ? Math.min(1, Math.max(0, window.scrollY / span)) : 0;
      el.style.transform = `scaleX(${done})`;
      el.parentElement!.style.opacity = span > 200 && window.scrollY > 0 ? "1" : "0";
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", soon, { passive: true });
    window.addEventListener("resize", soon);
    const ro = new ResizeObserver(soon);
    ro.observe(target);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", soon);
      window.removeEventListener("resize", soon);
      ro.disconnect();
    };
  }, [target]);
  return createPortal(
    <div className="read-progress" aria-hidden="true">
      <div ref={bar} />
    </div>,
    document.body,
  );
}
