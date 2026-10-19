import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { addCapture } from "../content/study";
import { useSwipeToClose } from "./gestures";

/** Quick capture: jot a thought in your own words; Claude files it into the right note. */
export function Capture({ onClose }: { onClose: () => void }) {
  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  useSwipeToClose(sheet, onClose);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const save = async () => {
    if (!text.trim()) return setError("Write something first.");
    setBusy(true);
    try {
      await addCapture(text);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return createPortal(
    <>
      <div className="sheet-scrim capture-scrim" onClick={onClose} />
      <div className="capture" role="dialog" aria-label="Quick capture" ref={setSheet}>
        <div className="sheet-grab" aria-hidden="true" />
        <div className="capture-head">
          <b>Quick capture</b>
          <span>Claude files it into the right note on its next run.</span>
        </div>
        <label htmlFor="capture-text" className="sr-only">
          What did you notice?
        </label>
        <textarea
          id="capture-text"
          autoFocus
          rows={4}
          value={text}
          placeholder="In your own words, e.g. SC on Governor's assent, 15 Oct: deadline of three months"
          onChange={(e) => (setText(e.target.value), setError(""))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void save();
            }
          }}
        />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="button" className="pill-btn go" disabled={busy} onClick={() => void save()}>
            Save to scratch pad
          </button>
          <button type="button" className="pill-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
