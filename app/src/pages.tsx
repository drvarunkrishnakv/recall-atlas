import { useEffect } from "react";
import { Link, useParams } from "react-router";
import { PAPERS, COMING_PAPERS, findTopic, locateNote } from "./content/syllabus";
import { NOTES, CARDS, CITED_IN, STATUS_LABEL } from "./content/store";
import { Markdown } from "./components/Markdown";

function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Mains Atlas` : "Mains Atlas";
  }, [title]);
}

function StatusPill({ noteId }: { noteId: string }) {
  const note = NOTES.get(noteId);
  if (!note) return <span className="pill">Not started</span>;
  const cls = note.status === "live" ? "live" : note.status === "in-review" ? "review" : "";
  return <span className={`pill ${cls}`}>{STATUS_LABEL[note.status] ?? note.status}</span>;
}

export function HomePage() {
  useTitle("");
  const written = [...NOTES.values()];
  return (
    <article className="page">
      <h1>Mains Atlas</h1>
      <p>Living revision notes for GS Mains, organised by the syllabus. {written.length} notes written so far.</p>
      <div className="grid">
        {PAPERS.map((p) => (
          <Link key={p.id} className="tile" to={`/${p.id}`}>
            <b>{p.title}</b>
            <small>{p.subjects.map((s) => s.title).join(", ")}</small>
          </Link>
        ))}
        {COMING_PAPERS.map((p) => (
          <div key={p} className="tile off">
            <b>{p}</b>
            <small>Not started</small>
          </div>
        ))}
      </div>
      <h2>Notes</h2>
      <ul className="list">
        {written.map((n) => (
          <li key={n.id}>
            <Link to={`/notes/${n.id}`}>{n.title}</Link>
            <span className="tags">
              <StatusPill noteId={n.id} />
              <span className="pill">Updated {n.updated}</span>
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function PaperPage() {
  const { paperId } = useParams();
  const paper = PAPERS.find((p) => p.id === paperId);
  useTitle(paper?.title ?? "Not found");
  if (!paper) return <NotFound />;
  return (
    <article className="page">
      <h1>{paper.title}</h1>
      <div className="grid">
        {paper.subjects.map((s) => {
          const planned = s.topics.flatMap((t) => t.notes);
          return (
            <Link key={s.id} className="tile" to={`/${paper.id}/${s.id}`}>
              <b>{s.title}</b>
              <small>
                {planned.length} notes planned · {planned.filter((n) => NOTES.has(n.id)).length} written
              </small>
            </Link>
          );
        })}
        {paper.comingSubjects.map((s) => (
          <div key={s} className="tile off">
            <b>{s}</b>
            <small>Not started</small>
          </div>
        ))}
      </div>
    </article>
  );
}

export function SubjectPage() {
  const { paperId, subjectId } = useParams();
  const paper = PAPERS.find((p) => p.id === paperId);
  const subject = paper?.subjects.find((s) => s.id === subjectId);
  useTitle(subject?.title ?? "Not found");
  if (!paper || !subject) return <NotFound />;
  return (
    <article className="page">
      <p className="eyebrow">{paper.title}</p>
      <h1>{subject.title}</h1>
      <p>The syllabus topics, each with the notes planned for it.</p>
      <div className="grid">
        {subject.topics.map((t) => (
          <Link key={t.id} className="tile" to={`/${paper.id}/${subject.id}/${t.id}`}>
            <small>{t.n}</small>
            <b>{t.title}</b>
            <small>
              {t.notes.length} notes · {t.notes.filter((n) => NOTES.has(n.id)).length} written
            </small>
          </Link>
        ))}
      </div>
    </article>
  );
}

export function TopicPage() {
  const { paperId, subjectId, topicId } = useParams();
  const found = findTopic(paperId!, subjectId!, topicId!);
  useTitle(found?.topic.title ?? "Not found");
  if (!found) return <NotFound />;
  const { topic } = found;
  return (
    <article className="page">
      <p className="eyebrow">Syllabus topic {topic.n}</p>
      <h1>{topic.title}</h1>
      <p>
        {topic.meaning}. {topic.notes.length} notes planned; {topic.notes.reduce((a, n) => a + n.pyqs, 0)} Mains PYQs
        (2013–25).
      </p>
      <ul className="list">
        {topic.notes.map((n) => (
          <li key={n.id}>
            {NOTES.has(n.id) ? (
              <Link to={`/notes/${n.id}`}>{n.title}</Link>
            ) : (
              <span className="planned-title">{n.title}</span>
            )}
            <span className="tags">
              <span className="pill">{n.pyqs} PYQs</span>
              <StatusPill noteId={n.id} />
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function NotePage() {
  const { noteId } = useParams();
  const note = noteId ? NOTES.get(noteId) : undefined;
  const loc = noteId ? locateNote(noteId) : null;
  useTitle(note?.title ?? "Not found");
  if (!note) return <NotFound />;
  return (
    <article className="page">
      <div className="meta">
        <StatusPill noteId={note.id} />
        {loc && (
          <span className="pill">
            {loc.paper.title.replace("GS Paper ", "GS")} · {loc.subject.title} · {loc.topic.n}
          </span>
        )}
        <span className="pill">{note.pyqs} Mains PYQs</span>
        <span className="pill">Updated {note.updated}</span>
      </div>
      <h1>{note.title}</h1>
      <div className="lead">
        <Markdown source={note.body} />
      </div>
    </article>
  );
}

const KIND_LABEL: Record<string, string> = { case: "Case", body: "Body", provision: "Provision", event: "Event" };

export function CardPage() {
  const { cardId } = useParams();
  const card = cardId ? CARDS.get(cardId) : undefined;
  useTitle(card?.title ?? "Not found");
  if (!card) return <NotFound />;
  const cited = CITED_IN.get(card.id) ?? [];
  return (
    <article className="page">
      <p className="eyebrow">Concept card · {KIND_LABEL[card.kind] ?? card.kind}</p>
      <h1>{card.title}</h1>
      <div className="lead">
        <Markdown source={card.summary + "\n\n" + card.body} />
      </div>
      <h3>Cited in</h3>
      {cited.length ? (
        <ul>
          {cited.map((id) => (
            <li key={id}>
              <Link to={`/notes/${id}`}>{NOTES.get(id)?.title ?? id}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>No note links to this card yet.</p>
      )}
    </article>
  );
}

export function CardsPage() {
  useTitle("Concept cards");
  const groups = ["case", "body", "provision", "event"];
  return (
    <article className="page">
      <h1>Concept cards</h1>
      <p>
        Cases, bodies, provisions and events that notes link to. Hover a highlighted term in a note to see its card.
      </p>
      {groups.map((g) => {
        const cards = [...CARDS.values()].filter((c) => c.kind === g);
        if (!cards.length) return null;
        return (
          <section key={g}>
            <h2>{KIND_LABEL[g]}s</h2>
            <ul className="list">
              {cards.map((c) => (
                <li key={c.id}>
                  <Link to={`/cards/${c.id}`}>{c.title}</Link>
                  <span className="pill">Cited in {(CITED_IN.get(c.id) ?? []).length}</span>
                </li>
              ))}
            </ul>
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
