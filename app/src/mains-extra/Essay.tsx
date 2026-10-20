// Essay (the chosen design: Essay 1 · Topic table + decode drawer). Every loaded topic, and a
// drawer that decodes one: what it asks, its keywords, six angles and evidence from your notes,
// shown only after you have written your own angles. From the drawer: the 20-minute outline
// sprint and the full essay (1 h 30); from the header: the full 3-hour paper.
import { Link } from "../components/nav";
import { useMainsExtra, workOf } from "../content/mains-extra";
import { checkOutlineDraft, type EssayTopic, type EssayWork, type MainsExtra } from "../lib/mains-extra";
import { dayLabel, Drawer, NoteLink, Stat, TryFirst, useSelection, useTitle, Waiting } from "./parts";
import "../prelims/prelims.css";
import "./mains-extra.css";

const FIRST_YEAR = 2013;

export default function EssayPage() {
  useTitle("Essay");
  const { status, error, data, saveError } = useMainsExtra();
  const [sel, select] = useSelection("topic");
  if (status !== "ready") return <Waiting status={status} error={error} what="the essay topics" />;
  const topics = data.essay;
  const outlines = topics.reduce((n, t) => n + workOf(data, "essay", t.id).outlines.length, 0);
  const sittings = topics.reduce((n, t) => n + workOf(data, "essay", t.id).sittings.length, 0);
  const years = [...new Set(topics.map((t) => t.year))];
  const oldest = years.length ? Math.min(...years) : new Date().getFullYear();
  const notLoaded = Array.from({ length: Math.max(0, oldest - FIRST_YEAR) }, (_, i) => oldest - 1 - i);
  const current = topics.find((t) => t.id === sel);

  return (
    <article className="dash wide mx-page mx-essay">
      <header className="mx-head">
        <div>
          <h1>Essay</h1>
          <span className="mx-sub">250 marks · 3 hours · one essay from each section, 1,000–1,200 words each</span>
        </div>
        <div className="mx-stats">
          <Stat n={sittings}>timed essays</Stat>
          <Stat n={outlines}>outlines</Stat>
          {topics.length > 0 && (
            <Link className="board-btn small" to="/mains/essay/paper">
              Sit a full paper · 3 h
            </Link>
          )}
        </div>
      </header>
      {saveError && <p className="mx-error">{saveError}</p>}

      <div className={`mx-split${current ? " has-drawer" : ""}`}>
        <section className="mx-table cols-essay" aria-label="Essay topics">
          <div className="mx-thead" aria-hidden="true">
            <span>Year</span>
            <span>Sec</span>
            <span>Topic</span>
            <span className="mx-c-opt">Theme</span>
            <span className="mx-c-wide">Outline</span>
            <span className="mx-c-wide">Essay</span>
          </div>
          {topics.length === 0 && (
            <p className="mx-empty">No essay topics are loaded yet. Claude loads them with the CLI.</p>
          )}
          {topics.map((t) => {
            const w = workOf(data, "essay", t.id);
            const last = w.outlines.at(-1);
            return (
              <div
                key={t.id}
                className={`mx-row${t.id === sel ? " on" : ""}`}
                onClick={() => select(t.id)}
                data-id={t.id}
              >
                <span className="mx-muted b">{t.year}</span>
                <span className="mx-sec">{t.section}</span>
                <button
                  type="button"
                  className="mx-row-open mx-main"
                  onClick={(e) => (e.stopPropagation(), select(t.id))}
                >
                  {t.text}
                </button>
                <span className="mx-c-opt mx-theme">{t.theme}</span>
                <span className={`mx-c-wide ${last ? "mx-small b" : "mx-muted"}`}>
                  {last ? `${w.outlines.length} · ${dayLabel(last.at)}` : "—"}
                </span>
                <span className={`mx-c-wide ${w.sittings.length ? "mx-small b" : "mx-muted"}`}>
                  {w.sittings.length ? `${w.sittings.length} timed` : "—"}
                </span>
              </div>
            );
          })}
          {notLoaded.length > 0 && (
            <div className="mx-foot">
              <span className="mx-muted b">Earlier papers, not loaded yet:</span>
              <span className="mx-years">
                {notLoaded.map((y) => (
                  <span key={y} className="mx-year-chip">
                    {y}
                  </span>
                ))}
              </span>
            </div>
          )}
        </section>

        {current && <DecodeDrawer topic={current} data={data} onClose={() => select(null)} />}
      </div>
    </article>
  );
}

function DecodeDrawer({ topic, data, onClose }: { topic: EssayTopic; data: MainsExtra; onClose: () => void }) {
  const w: EssayWork = workOf(data, "essay", topic.id);
  const d = topic.decode;
  const tried = !!w.tried;
  return (
    <Drawer
      label="Decode the topic"
      tone="essay"
      onClose={onClose}
      kicker={`${topic.year} · Section ${topic.section} · ${topic.theme}`}
      title={topic.text}
    >
      {!tried ? (
        <TryFirst
          topic={topic}
          intro="Name the keywords and the angles in a minute, then compare with Claude's breakdown."
        />
      ) : (
        <>
          <div className="mx-block">
            <span className="mx-label">Your angles · {dayLabel(w.tried!.at)}</span>
            <p className="mx-mine">{w.tried!.text}</p>
          </div>
          {d ? (
            <>
              <div className="mx-block">
                <span className="mx-label tone">It asks · Claude&apos;s breakdown</span>
                <span>{d.asks}</span>
                <span className="mx-chips">
                  {d.keywords.map((k) => (
                    <span key={k} className="mx-chip tone">
                      {k}
                    </span>
                  ))}
                </span>
              </div>
              <div className="mx-block">
                <span className="mx-label">Angles to cover</span>
                <div className="mx-angles">
                  {d.angles.map((a) => (
                    <div key={a.k}>
                      <b>{a.k}</b>
                      <span>{a.v}</span>
                    </div>
                  ))}
                </div>
              </div>
              {d.notes.length > 0 && (
                <div className="mx-block">
                  <span className="mx-label">Evidence from your notes</span>
                  {d.notes.map((n) => (
                    <NoteLink key={n.id} id={n.id} why={n.why} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="mx-muted">Claude hasn&apos;t written the breakdown for this topic yet.</p>
          )}
        </>
      )}

      {w.outlines.length > 0 && (
        <div className="mx-block">
          <span className="mx-label">Your outlines</span>
          {[...w.outlines].reverse().map((o) => {
            const c = checkOutlineDraft(o, d?.angles.map((a) => a.k) ?? []);
            return (
              <Link key={o.id} className="mx-line-link" to={`/mains/essay/sprint/${topic.id}?outline=${o.id}`}>
                <b>{dayLabel(o.at)}</b>
                <span>
                  {o.thesis || "No thesis yet"}
                  <span className="mx-muted">
                    {" "}
                    · {c.covered} of {d?.angles.length ?? 0} angles{c.balance ? " · other side" : ""}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mx-actions two">
        <Link className="board-btn big" to={`/mains/essay/sprint/${topic.id}`}>
          Outline sprint<span>20 min</span>
        </Link>
        <Link className="board-btn big quiet" to={`/mains/essay/write/${topic.id}`}>
          Full essay<span>1 h 30 · photo upload</span>
        </Link>
      </div>
    </Drawer>
  );
}
