import { useEffect, useRef, useState, type ReactNode } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router";
import { Link, NavLink } from "./nav";
import { PAPERS, locateNote, findTopic } from "../content/syllabus";
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
import { MAINS_NAV, PRELIMS_NAV } from "../modes/registry";

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
        {/* Each mode's main action. Capture, which the Mains Home's scratch pad also has, moved to ···. */}
        {mode === "prelims" ? (
          <Link className="capture-btn mode-action" to="/prelims/session?n=20&mode=practice">
            <Icon name="check" />
            Practise now
          </Link>
        ) : (
          <Link className="capture-btn mode-action" to="/mains/write">
            <Icon name="pen" />
            Today&apos;s answer
          </Link>
        )}
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
            <button type="button" role="menuitem" onClick={() => (setMenu(false), onCapture())}>
              <b>Capture a thought</b>
              <span>To your scratch pad; Claude files it into the right note</span>
            </button>
            <Link role="menuitem" to="/mains/notes" onClick={() => setMenu(false)}>
              <b>Microtheme note</b>
              <span>Start a planned note from Notes</span>
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
          {PRELIMS_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
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

/**
 * Mains mode's sidebar, in the chosen order: Home, Notes, Feedback, Essay, Ethics case studies,
 * Medical Science, Claude inbox, Analytics (Write is the main button above it, "Today's answer"). Revise today, Concept cards and the News heat
 * map are reached from Notes; the subject tables from Notes' paper and subject tabs.
 */
function MainsNav() {
  const { due, inbox } = useBadges();
  const { pathname } = useLocation();
  // A note, a subject table and the note tools all live under Notes.
  const inNotes = /^\/(notes|cards|revise|heat-map|gs[1-4])(\/|$)/.test(pathname);
  const entries = MAINS_NAV.filter((n) => n.to !== "/mains/analytics");
  const analytics = MAINS_NAV.find((n) => n.to === "/mains/analytics");
  return (
    <nav className="side-nav" aria-label="Atlas">
      <NavLink to="/" end>
        <Icon name="home" />
        Home
      </NavLink>
      {entries.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          className={({ isActive }) => (isActive || (n.to === "/mains/notes" && inNotes) ? "active" : "")}
        >
          <Icon name={n.icon} />
          {n.label}
          {n.to === "/mains/notes" && due > 0 && (
            <span className="nav-badge go" title={`${due} notes due for revision`}>
              {due}
            </span>
          )}
        </NavLink>
      ))}
      <NavLink to="/inbox">
        <Icon name="inbox" />
        Claude inbox
        {inbox > 0 && <span className="nav-badge claude">{inbox}</span>}
      </NavLink>
      {analytics && (
        <NavLink to={analytics.to}>
          <Icon name={analytics.icon} />
          {analytics.label}
        </NavLink>
      )}
    </nav>
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
  const readingPage = /^\/(notes|cards)\/[^/]+/.test(location.pathname);
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
    <div
      className={`frame${navOpen ? " nav-open" : ""}${collapsed ? " nav-collapsed" : ""}${readingPage ? " has-fab" : ""}`}
      data-mode={mode}
    >
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
      {/* On phones and iPads, Capture floats only over a note or card you're reading: jotting a
          thought while reading is what it's for, and elsewhere it sat on top of rows and buttons. */}
      {readingPage && (
        <button type="button" className="capture-fab" onClick={() => setCapturing(true)}>
          <Icon name="plus" />
          Capture
        </button>
      )}
      {status === "ready" && <Peek />}
      <div className="edge-back" ref={edgeArrow} aria-hidden="true">
        <Icon name="back" />
      </div>
      <Search open={searching} onClose={() => setSearching(false)} />
      {capturing && <Capture onClose={() => setCapturing(false)} />}
    </div>
  );
}
