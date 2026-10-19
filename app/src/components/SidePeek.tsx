import { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { getPage } from "../content/store";
import { PageView } from "../editor/PageView";
import { Icon } from "./Icon";
import { parsePeek } from "./peek";

/** Listens for openPeek() and keeps the open page in `?peek=`, so back and forward work. */
export function usePeekHost() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const onPeek = (e: Event) => {
      const value = (e as CustomEvent<string>).detail;
      const params = new URLSearchParams(location.search);
      if (params.get("peek") === value) return;
      params.set("peek", value);
      const depth = ((location.state as { peekDepth?: number } | null)?.peekDepth ?? 0) + 1;
      navigate({ pathname: location.pathname, search: params.toString() }, { state: { peekDepth: depth } });
    };
    window.addEventListener("atlas-peek", onPeek);
    return () => window.removeEventListener("atlas-peek", onPeek);
  }, [location, navigate]);
}

/** The side peek: a note or card in a panel on the right (full screen on phones). */
export function Peek() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const peek = parsePeek(params.get("peek"));
  const depth = (location.state as { peekDepth?: number } | null)?.peekDepth ?? 0;

  const close = () => {
    if (depth > 0) navigate(-depth);
    else {
      const next = new URLSearchParams(params);
      next.delete("peek");
      navigate({ pathname: location.pathname, search: next.toString() }, { replace: true });
    }
  };

  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".composer, .comments-panel, .bn-suggestion-menu")) return;
      close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!peek) return null;
  const collection = peek.kind === "card" ? "cards" : "notes";
  const page = getPage(collection, peek.id);
  const fullPath = `/${collection}/${peek.id}`;

  return (
    <>
      <div className="peek-scrim" onClick={close} />
      <aside className="peek" aria-label="Side peek">
        <div className="peek-bar">
          <button type="button" className="iconbtn" aria-label="Close side peek" onClick={close}>
            <Icon name="close" />
          </button>
          <button type="button" className="chip-btn" onClick={() => navigate(fullPath, { viewTransition: true })}>
            Open as page ↗
          </button>
        </div>
        <div className="peek-body">
          {page ? (
            <PageView collection={collection} id={peek.id} inPeek />
          ) : (
            <article className="page">
              <h1>Not written yet</h1>
              <p>This {peek.kind} doesn't exist yet.</p>
            </article>
          )}
        </div>
      </aside>
    </>
  );
}
