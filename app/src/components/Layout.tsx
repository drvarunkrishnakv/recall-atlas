import { useEffect, useRef, useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router";
import { Link, NavLink } from "./nav";
import { COMING_SUBJECTS, PAPERS, locateNote, findTopic, subjectStyle } from "../content/syllabus";
import { usePage, useContent } from "../content/store";
import { claudeState, refreshStudy, useStudy } from "../content/study";
import { isDue } from "../lib/progress";
import { Capture } from "./Capture";
import { PageSkeleton } from "./Skeleton";
import { useEdgeBack } from "./gestures";
import { Icon } from "./Icon";
import { Peek, usePeekHost } from "./SidePeek";
import { Search } from "./Search";
import { ModeSwitch, useMode } from "./ModeSwitch";
import { MODE_HOME, modeOf } from "../lib/mode";

/** Counts for the sidebar badges. */
export function useBadges() {
  const { pages } = useContent();
  const { progress, threads, captures, proposals } = useStudy();
  const due = [...pages.values()].filter((p) => p.collection === "notes" && isDue(progress.notes[p.id])).length;
  const replied = Object.values(threads).reduce((n, t) => n + claudeState(t).replied, 0);
  const filed = captures.filter((c) => c.status === "done").length;
  const changes = Object.values(proposals).reduce((n, l) => n + l.filter((p) => p.status === "pending").length, 0);
  return { due, inbox: replied + filed + changes };
}

function Sidebar({ onCapture, onSearch }: { onCapture: () => void; onSearch: () => void }) {
  const mode = useMode();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  return (
    <>
      <button type="button" className="search-btn" onClick={onSearch}>
        <Icon name="search" />
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="create-row" ref={menuRef}>
        <button type="button" className="capture-btn" onClick={onCapture}>
          <Icon name="plus" />
          Capture
        </button>
        <button
          type="button"
          className="more-btn"
          aria-label="More ways to add"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
        >
          ···
        </button>
        {menu && (
          <div className="create-menu" role="menu">
            <Link role="menuitem" to="/gs2/polity" onClick={() => setMenu(false)}>
              <b>Microtheme note</b>
              <span>Start a planned note from its subject</span>
            </Link>
            <Link role="menuitem" to="/cards?new=1" onClick={() => setMenu(false)}>
              <b>Concept card</b>
              <span>A case, body, provision or event</span>
            </Link>
          </div>
        )}
      </div>
      {mode === "prelims" ? (
        <nav className="side-nav" aria-label="Prelims">
          <NavLink to="/prelims" end>
            <Icon name="home" />
            Home
          </NavLink>
        </nav>
      ) : (
        <MainsNav />
      )}
      <div className="nav-foot">
        <NavLink to="/settings">
          <Icon name="settings" />
          Settings
        </NavLink>
      </div>
    </>
  );
}

/** Mains mode's sidebar: everything the reader had before the modes arrived. */
function MainsNav() {
  const { pages } = useContent();
  const { due, inbox } = useBadges();
  return (
    <>
      <nav className="side-nav" aria-label="Atlas">
        <NavLink to="/" end>
          <Icon name="home" />
          Home
        </NavLink>
        <NavLink to="/inbox">
          <Icon name="inbox" />
          Claude inbox
          {inbox > 0 && <span className="nav-badge claude">{inbox}</span>}
        </NavLink>
        <NavLink to="/revise">
          <Icon name="revise" />
          Revise today
          {due > 0 && <span className="nav-badge go">{due}</span>}
        </NavLink>
        <NavLink to="/cards">
          <Icon name="cards" />
          Concept cards
        </NavLink>
        <NavLink to="/heat-map">
          <Icon name="heat" />
          News heat map
        </NavLink>
        <div className="side-label">Subjects</div>
        {PAPERS.flatMap((paper) =>
          paper.subjects.map((s) => {
            const planned = s.topics.flatMap((t) => t.notes);
            const written = planned.filter((n) => pages.has(`notes:${n.id}`)).length;
            return (
              <NavLink key={s.id} to={`/${paper.id}/${s.id}`}>
                <span className="swatch" style={{ background: subjectStyle(s.id).color }} />
                {s.title}
                <span className="count">
                  {written}/{planned.length}
                </span>
              </NavLink>
            );
          }),
        )}
        {COMING_SUBJECTS.map((s) => (
          <span key={s.title} className="soon">
            <span className="swatch" style={{ background: subjectStyle(s.title).color }} />
            {s.title}
            <span className="count">soon</span>
          </span>
        ))}
      </nav>
    </>
  );
}

/** Breadcrumb trail for the current route. */
function Crumbs() {
  const { pathname } = useLocation();
  const params = useParams();
  const note = usePage("notes", params.noteId);
  const parts: ReactNode[] = [];
  const add = (to: string, label: string) =>
    parts.push(
      <Link key={to} to={to}>
        {label}
      </Link>,
    );
  if (pathname.startsWith("/cards")) {
    add("/cards", "Concept cards");
  } else if (pathname === "/inbox") {
    add("/inbox", "Claude inbox");
  } else if (pathname === "/revise") {
    add("/revise", "Revise today");
  } else if (pathname === "/settings") {
    add("/settings", "Settings");
  } else if (pathname === "/heat-map") {
    add("/heat-map", "News heat map");
  } else if (modeOf(pathname) === "prelims") {
    add("/prelims", "Prelims");
  } else {
    const located = params.noteId ? locateNote(params.noteId, note?.parent) : null;
    const loc = located ?? (params.topicId ? findTopic(params.paperId!, params.subjectId!, params.topicId) : null);
    const paper = loc?.paper ?? PAPERS.find((p) => p.id === params.paperId);
    const subject = loc?.subject ?? paper?.subjects.find((s) => s.id === params.subjectId);
    if (paper) add(`/${paper.id}`, paper.title.replace("GS Paper ", "GS"));
    if (paper && subject) add(`/${paper.id}/${subject.id}`, subject.title);
    if (paper && subject && loc?.topic && params.noteId)
      add(`/${paper.id}/${subject.id}`, `${loc.topic.n} ${loc.topic.title}`);
    if (located?.parent) add(`/notes/${located.parent.id}`, located.parent.title);
  }
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {parts.map((p, i) => (
        <span key={i} className="crumb">
          {i > 0 && <span className="sep">›</span>}
          {p}
        </span>
      ))}
    </nav>
  );
}

/** Wide screens can fold the sidebar away (⌘\ or the button); the choice is remembered. */
function useCollapsed() {
  const [collapsed, set] = useState(() => {
    try {
      return localStorage.getItem("atlas-nav") === "collapsed";
    } catch {
      return false;
    }
  });
  const toggle = () =>
    set((v) => {
      try {
        localStorage.setItem("atlas-nav", v ? "open" : "collapsed");
      } catch {
        /* storage unavailable */
      }
      return !v;
    });
  return [collapsed, toggle] as const;
}

export function Layout() {
  const location = useLocation();
  const mode = useMode();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useCollapsed();
  const [searching, setSearching] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const { status, error } = useContent();
  // The first page fades in where the shimmer was (only then; page changes have their own glide).
  const [arriving, setArriving] = useState(false);
  useEffect(() => {
    if (status !== "ready") return;
    setArriving(true);
    const t = window.setTimeout(() => setArriving(false), 700);
    return () => window.clearTimeout(t);
  }, [status]);
  usePeekHost();
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const edgeArrow = useRef<HTMLDivElement>(null);
  useEdgeBack(edgeArrow, () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 && navigate(-1));

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\" && window.innerWidth > 900) {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    const onFocus = () => void refreshStudy();
    document.addEventListener("keydown", onKey);
    window.addEventListener("focus", onFocus);
    const poll = window.setInterval(() => document.visibilityState === "visible" && onFocus(), 60_000);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(poll);
    };
  }, []);

  return (
    <div className={`frame${navOpen ? " nav-open" : ""}${collapsed ? " nav-collapsed" : ""}`} data-mode={mode}>
      <aside className="nav" aria-label="Sidebar">
        <div className="nav-head">
          <Link className="brand" to={MODE_HOME[mode]}>
            <span className="logo" aria-hidden="true">
              <Icon name="atlas" />
            </span>
            Atlas
          </Link>
          <button
            className="iconbtn nav-fold"
            type="button"
            aria-label="Hide sidebar"
            title="Hide sidebar (⌘\)"
            onClick={toggleCollapsed}
          >
            <Icon name="sidebar" />
          </button>
          <button
            className="iconbtn nav-close"
            type="button"
            aria-label="Close navigator"
            onClick={() => setNavOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <Sidebar
          onCapture={() => (setNavOpen(false), setCapturing(true))}
          onSearch={() => (setNavOpen(false), setSearching(true))}
        />
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <main className={`main${arriving ? " arriving" : ""}`}>
        <div className="topbar">
          <button
            className="iconbtn menu-btn"
            type="button"
            aria-label="Open navigator"
            onClick={() => setNavOpen(true)}
          >
            <Icon name="menu" />
          </button>
          {collapsed && (
            <button
              className="iconbtn nav-unfold"
              type="button"
              aria-label="Show sidebar"
              title="Show sidebar (⌘\)"
              onClick={toggleCollapsed}
            >
              <Icon name="sidebar" />
            </button>
          )}
          <button className="iconbtn" type="button" aria-label="Back" disabled={idx === 0} onClick={() => navigate(-1)}>
            <Icon name="back" />
          </button>
          <button className="iconbtn" type="button" aria-label="Forward" onClick={() => navigate(1)}>
            <Icon name="forward" />
          </button>
          <Crumbs />
          <div className="spacer" />
          <ModeSwitch />
          <button type="button" className="iconbtn" aria-label="Search" onClick={() => setSearching(true)}>
            <Icon name="search" />
          </button>
        </div>
        {status === "ready" ? (
          <Outlet />
        ) : status === "error" ? (
          <article className="page">
            <p className="loading">Couldn't load the notes: {error}</p>
          </article>
        ) : (
          <PageSkeleton label="Loading notes" />
        )}
      </main>
      <button type="button" className="capture-fab" onClick={() => setCapturing(true)}>
        <Icon name="plus" />
        Capture
      </button>
      {status === "ready" && <Peek />}
      <div className="edge-back" ref={edgeArrow} aria-hidden="true">
        <Icon name="back" />
      </div>
      <Search open={searching} onClose={() => setSearching(false)} />
      {capturing && <Capture onClose={() => setCapturing(false)} />}
    </div>
  );
}
