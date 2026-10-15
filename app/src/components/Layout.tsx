import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { COMING_PAPERS, PAPERS, locateNote, findTopic } from "../content/syllabus";
import { NOTES } from "../content/store";
import { Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";

function Tree({ openTopic }: { openTopic: string | null }) {
  return (
    <ul className="tree">
      {PAPERS.map((paper) => (
        <li key={paper.id}>
          <NavLink to={`/${paper.id}`} end>
            {paper.title}
          </NavLink>
          <ul>
            {paper.subjects.map((subject) => (
              <li key={subject.id}>
                <NavLink to={`/${paper.id}/${subject.id}`} end>
                  {subject.title}
                </NavLink>
                <ul>
                  {subject.topics.map((topic) => (
                    <li key={topic.id}>
                      <NavLink to={`/${paper.id}/${subject.id}/${topic.id}`}>
                        <span className="num">{topic.n}</span>
                        <span>{topic.title}</span>
                      </NavLink>
                      {openTopic === topic.id && (
                        <ul>
                          {topic.notes.map((n) =>
                            NOTES.has(n.id) ? (
                              <li key={n.id}>
                                <NavLink to={`/notes/${n.id}`}>{n.title}</NavLink>
                              </li>
                            ) : (
                              <li key={n.id}>
                                <span className="planned">{n.title}</span>
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {paper.comingSubjects.map((s) => (
              <li key={s}>
                <span className="soon">{s}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
      {COMING_PAPERS.map((p) => (
        <li key={p}>
          <span className="soon">{p}</span>
        </li>
      ))}
      <li className="tree-label">Reference</li>
      <li>
        <NavLink to="/cards">Concept cards</NavLink>
      </li>
    </ul>
  );
}

/** Breadcrumb trail for the current route. */
function Crumbs() {
  const { pathname } = useLocation();
  const params = useParams();
  const parts: ReactNode[] = [];
  const add = (to: string, label: string) =>
    parts.push(
      <Link key={to} to={to}>
        {label}
      </Link>,
    );
  if (pathname.startsWith("/cards")) {
    add("/cards", "Concept cards");
  } else {
    const loc = params.noteId
      ? locateNote(params.noteId)
      : params.topicId
        ? findTopic(params.paperId!, params.subjectId!, params.topicId)
        : null;
    const paper = loc?.paper ?? PAPERS.find((p) => p.id === params.paperId);
    const subject = loc?.subject ?? paper?.subjects.find((s) => s.id === params.subjectId);
    if (paper) add(`/${paper.id}`, paper.title.replace("GS Paper ", "GS"));
    if (paper && subject) add(`/${paper.id}/${subject.id}`, subject.title);
    if (paper && subject && loc?.topic)
      add(`/${paper.id}/${subject.id}/${loc.topic.id}`, `${loc.topic.n} ${loc.topic.title}`);
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

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [navOpen, setNavOpen] = useState(false);
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const openTopic = params.noteId ? (locateNote(params.noteId)?.topic.id ?? null) : (params.topicId ?? null);

  return (
    <div className={`frame${navOpen ? " nav-open" : ""}`}>
      <aside className="nav" aria-label="Atlas">
        <div className="nav-head">
          <Link className="brand" to="/">
            Mains Atlas
          </Link>
          <button
            className="iconbtn nav-close"
            type="button"
            aria-label="Close navigator"
            onClick={() => setNavOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <Tree openTopic={openTopic} />
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <main className="main">
        <div className="topbar">
          <button
            className="iconbtn menu-btn"
            type="button"
            aria-label="Open navigator"
            onClick={() => setNavOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <button className="iconbtn" type="button" aria-label="Back" disabled={idx === 0} onClick={() => navigate(-1)}>
            <Icon name="back" />
          </button>
          <button className="iconbtn" type="button" aria-label="Forward" onClick={() => navigate(1)}>
            <Icon name="forward" />
          </button>
          <Crumbs />
          <div className="spacer" />
          <ThemeToggle />
        </div>
        <Outlet />
      </main>
    </div>
  );
}
