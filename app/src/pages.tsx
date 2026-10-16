import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { PAPERS, subjectStyle } from "./content/syllabus";
import { allPages, createPage, getPage, KIND_LABEL, linksTo, useContent } from "./content/store";
import { PageView } from "./editor/PageView";
import type { Block } from "./lib/blocks";

function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Mains Atlas` : "Mains Atlas";
  }, [title]);
}

export function PaperPage() {
  const { paperId } = useParams();
  const paper = PAPERS.find((p) => p.id === paperId);
  useTitle(paper?.title ?? "Not found");
  useContent();
  if (!paper) return <NotFound />;
  return (
    <article className="dash">
      <header className="dash-head">
        <h1>{paper.title}</h1>
      </header>
      <div className="subject-grid">
        {paper.subjects.map((s) => {
          const planned = s.topics.flatMap((t) => t.notes);
          const st = subjectStyle(s.id);
          return (
            <Link key={s.id} className="subject-card" to={`/${paper.id}/${s.id}`}>
              <span className="art" style={{ background: st.color }}>
                <span className="shape a" style={{ background: st.shape }} />
                <span className="shape b" style={{ background: st.ink }} />
              </span>
              <span className="body">
                <b>{s.title}</b>
                <span className="muted">
                  {planned.length} notes planned · {planned.filter((n) => getPage("notes", n.id)).length} written
                </span>
              </span>
            </Link>
          );
        })}
        {paper.comingSubjects.map((s) => (
          <div key={s} className="subject-card off">
            <span className="art" style={{ background: subjectStyle(s).color }} />
            <span className="body">
              <b>{s}</b>
              <span className="muted">Not planned yet</span>
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

/** Topics live as groups in the subject table now. */
export function TopicPage() {
  const { paperId, subjectId } = useParams();
  return <Navigate to={`/${paperId}/${subjectId}`} replace />;
}

export function NotePage() {
  const { noteId } = useParams();
  const { pages } = useContent();
  const note = noteId ? pages.get(`notes:${noteId}`) : undefined;
  useTitle(note?.title ?? "Not found");
  if (!note) return <NotFound />;
  return <PageView collection="notes" id={note.id} />;
}

export function CardPage() {
  const { cardId } = useParams();
  const { pages } = useContent();
  const card = cardId ? pages.get(`cards:${cardId}`) : undefined;
  useTitle(card?.title ?? "Not found");
  if (!card) return <NotFound />;
  return <PageView collection="cards" id={card.id} />;
}

const CARD_TEMPLATE: Block[] = [
  { type: "heading", props: { level: 3 }, content: "Key facts" },
  { type: "bulletListItem", content: [] },
  { type: "heading", props: { level: 3 }, content: "How to use it in Mains" },
  { type: "bulletListItem", content: [] },
  { type: "heading", props: { level: 3 }, content: "Sources" },
  { type: "bulletListItem", content: [] },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "card";

function NewCard() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("case");
  const [error, setError] = useState("");
  const create = async () => {
    if (!title.trim()) return setError("Give the card a title.");
    let id = `${kind}-${slug(title)}`;
    while (getPage("cards", id)) id += "-2";
    await createPage({ collection: "cards", id, title: title.trim(), kind, summary: "", blocks: CARD_TEMPLATE });
    navigate(`/cards/${id}`);
  };
  return (
    <form
      className="new-card"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <label htmlFor="card-title">New concept card</label>
      <div className="row">
        <input
          id="card-title"
          autoFocus
          value={title}
          placeholder="Kihoto Hollohan v Zachillhu (1992)"
          onChange={(e) => (setTitle(e.target.value), setError(""))}
        />
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="submit" className="pill-btn go">
          Create card
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export function CardsPage() {
  useTitle("Concept cards");
  useContent();
  const [params] = useSearchParams();
  const groups = Object.keys(KIND_LABEL);
  return (
    <article className="dash">
      <header className="dash-head">
        <div>
          <div className="eyebrow">Cases, bodies, provisions and events your notes link to</div>
          <h1>Concept cards</h1>
        </div>
      </header>
      {params.get("new") && <NewCard />}
      {groups.map((g) => {
        const cards = allPages("cards").filter((c) => (c.kind ?? "concept") === g);
        if (!cards.length) return null;
        return (
          <section key={g}>
            <h2 className="sec-h">{KIND_LABEL[g]}s</h2>
            <div className="card-grid">
              {cards.map((c) => (
                <Link key={c.id} className={`concept-card kind-${g}`} to={`/cards/${c.id}`}>
                  <span className="kind">{KIND_LABEL[g]}</span>
                  <b>{c.title}</b>
                  {c.summary ? <span className="summary">{String(c.summary)}</span> : null}
                  <span className="muted">
                    Cited in {linksTo("card", c.id).filter((l) => l.collection === "notes").length}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </article>
  );
}

export function NotFound() {
  useTitle("Not found");
  return (
    <article className="page">
      <h1>Page not found</h1>
      <p>
        This page doesn't exist. <Link to="/">Go to the Atlas home</Link>.
      </p>
    </article>
  );
}
