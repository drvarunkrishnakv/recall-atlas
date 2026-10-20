// A Prelims subject (the chosen design: Subject 2 · Table + analytics drawer). One row per topic
// (bank) in book order, each opening into its microthemes; tapping an MCQ or flashcard count opens
// that topic's analytics in a drawer on the right, or as a page of its own on phones. The drawer
// lives in the URL (?open=<bank>&kind=mcq|flashcard), so back closes it.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { Link } from "../components/nav";
import { usePractice } from "../content/practice";
import { servable, type Bank, type Item } from "../lib/practice";
import { today as todayOf } from "../lib/progress";
import {
  clock,
  kindStats,
  MIN_WEAK_ATTEMPTS,
  pyqStats,
  readinessOver,
  weekPoints,
  type KindStats,
} from "../lib/readiness";
import { lastRead } from "../lib/reading";
import { isDue } from "../lib/srs";
import { Sparkline } from "../analytics/charts";
import { changeReading, useReading } from "./data";
import { deltaClass, pct, readDay, shortDay, subjectsOf, weekDelta } from "./model";
import "../prelims/prelims.css";
import "./homes.css";

type Sort = "book" | "asked" | "weakest" | "due";
const SORTS: [Sort, string][] = [
  ["book", "Book order"],
  ["asked", "Most asked"],
  ["weakest", "Weakest"],
  ["due", "Most due"],
];
type Filter = "weak" | "unread" | "due";
const FILTERS: [Filter, string][] = [
  ["weak", "Weak"],
  ["unread", "Not read yet"],
  ["due", "Due"],
];
/**
 * New questions added after the reviews when you start from the drawer: ten keeps a topic drill to
 * about twelve minutes at Prelims pace (72 s a question).
 */
const DRILL_NEW = 10;
const SESSION = 20;

function useNarrow() {
  const query = "(max-width: 900px)";
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia(query).matches,
  );
}

interface Counts {
  total: number;
  due: number;
}
interface Row {
  bank: Bank;
  order: number;
  pyq: { count: number; lastYear?: number };
  score: number;
  answered: number;
  mcq: Counts;
  card: Counts;
  read?: string;
  themes: { name: string; pyq: { count: number; lastYear?: number }; score: number; mcq: Counts; card: Counts }[];
}

export default function SubjectPage() {
  const { subject: slug = "" } = useParams();
  const practice = usePractice();
  const reading = useReading();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const narrow = useNarrow();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState(false);
  const actions = useRef<HTMLDivElement>(null);
  const [logged, setLogged] = useState<Bank | null>(null);
  // The "Log reading" menu closes on a tap elsewhere or Escape.
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => !actions.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);
  const sort = (SORTS.find(([s]) => s === params.get("sort"))?.[0] ?? "book") as Sort;
  const filters = new Set(
    (params.get("filter") ?? "").split(",").filter((f): f is Filter => FILTERS.some(([k]) => k === f)),
  );
  const openBank = params.get("open");
  const kind = params.get("kind") === "flashcard" ? "flashcard" : "mcq";
  const today = todayOf();
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString("en-CA");

  const subject = useMemo(() => subjectsOf(practice.banks).find((s) => s.slug === slug), [practice.banks, slug]);
  const log = reading.subjects[slug];

  useEffect(() => {
    document.title = `${subject?.name ?? "Subject"} · Prelims · Mains Atlas`;
  }, [subject?.name]);
  useEffect(() => {
    if (openBank && narrow) window.scrollTo(0, 0);
  }, [openBank, narrow]);

  const model = useMemo(() => {
    if (!subject) return null;
    const now = new Date();
    const attempts = Object.values(practice.days).flat();
    const points = weekPoints(now, 8);
    const key = (b: Bank, m: string) => `${b.id}\u0000${m}`;
    const snaps = readinessOver(subject.banks, attempts, points, (i, b) => [
      "subject",
      b.id,
      key(b, i.microtheme ?? "Other"),
    ]);
    const nowSnap = snaps[snaps.length - 1];
    const counts = (items: Item[], k: "mcq" | "flashcard"): Counts => {
      const list = items.filter((i) => i.kind === k && servable(i));
      return { total: list.length, due: list.filter((i) => isDue(practice.states.get(i.id), now)).length };
    };
    const answeredIn = new Map<string, number>();
    for (const a of attempts) if (a.kind !== "puzzle") answeredIn.set(a.bank, (answeredIn.get(a.bank) ?? 0) + 1);
    const rows: Row[] = subject.banks.map((b, order) => {
      const names = [...new Set(b.items.map((i) => i.microtheme ?? "Other"))];
      const themes = names
        .map((name) => {
          const items = b.items.filter((i) => (i.microtheme ?? "Other") === name);
          return {
            name,
            pyq: pyqStats(items),
            score: nowSnap.get(key(b, name))?.score ?? 0,
            mcq: counts(items, "mcq"),
            card: counts(items, "flashcard"),
          };
        })
        .sort((x, y) => y.pyq.count - x.pyq.count || x.name.localeCompare(y.name));
      return {
        bank: b,
        order,
        pyq: pyqStats(b.items),
        score: nowSnap.get(b.id)?.score ?? 0,
        answered: answeredIn.get(b.id) ?? 0,
        mcq: counts(b.items, "mcq"),
        card: counts(b.items, "flashcard"),
        themes,
      };
    });
    const series = snaps.map((s) => s.get("subject")?.score ?? 0);
    return {
      rows,
      series,
      score: series[series.length - 1],
      delta: series[series.length - 1] - series[series.length - 2],
    };
  }, [subject, practice.days, practice.states]);

  const drawer = useMemo(() => {
    const bank = subject?.banks.find((b) => b.id === openBank);
    if (!bank) return null;
    return { bank, stats: kindStats(bank, kind, practice.days, practice.states, new Date(), today) };
  }, [subject, openBank, kind, practice.days, practice.states, today]);

  if (practice.status !== "ready")
    return (
      <article className="st">
        <p className="loading">
          {practice.status === "error" ? `Couldn't load practice: ${practice.error}` : "Loading your practice…"}
        </p>
      </article>
    );
  if (!subject || !model)
    return (
      <article className="st">
        <h1>No such subject</h1>
        <p>
          <Link to="/prelims">Back to Prelims</Link>
        </p>
      </article>
    );

  const rows = model.rows.map((r) => ({ ...r, read: lastRead(log, r.bank.id) }));
  const maxPyq = Math.max(1, ...rows.map((r) => r.pyq.count));
  let shown = rows.filter(
    (r) =>
      (!filters.has("weak") || (r.answered >= MIN_WEAK_ATTEMPTS && r.score < model.score)) &&
      (!filters.has("unread") || !r.read) &&
      (!filters.has("due") || r.mcq.due + r.card.due > 0),
  );
  shown = [...shown].sort((a, b) =>
    sort === "asked"
      ? b.pyq.count - a.pyq.count || a.order - b.order
      : sort === "weakest"
        ? a.score - b.score || b.pyq.count - a.pyq.count || a.order - b.order
        : sort === "due"
          ? b.mcq.due + b.card.due - (a.mcq.due + a.card.due) || a.order - b.order
          : a.order - b.order,
  );

  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
  };
  const toggleFilter = (f: Filter) => {
    const next = new Set(filters);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    setParam("filter", [...next].join(",") || null);
  };
  const openDrawer = (bank: string, k: "mcq" | "flashcard") => {
    const next = new URLSearchParams(params);
    next.set("open", bank);
    next.set("kind", k);
    setParams(next, { state: { drawer: true } });
  };
  const closeDrawer = () => {
    if ((location.state as { drawer?: boolean } | null)?.drawer) return navigate(-1);
    const next = new URLSearchParams(params);
    next.delete("open");
    next.delete("kind");
    setParams(next, { replace: true });
  };
  const logReading = (bank: Bank) => {
    setMenu(false);
    setLogged(bank);
    void changeReading(slug, bank.id, "log", today);
  };
  const ids = subject.banks.map((b) => b.id);
  const unread = rows.filter((r) => !r.read).map((r) => r.bank.id);
  const style = { "--subj": subject.color } as React.CSSProperties;

  const drawerView = drawer && (
    <Drawer
      key={`${drawer.bank.id}-${kind}`}
      subject={subject.name}
      bank={drawer.bank}
      kind={kind}
      stats={drawer.stats}
      page={narrow}
      onClose={closeDrawer}
    />
  );
  if (drawerView && narrow)
    return (
      <article className="st" style={style}>
        {drawerView}
      </article>
    );

  return (
    <article className="st" style={style}>
      <div className={`st-layout${drawerView ? " open" : ""}`}>
        <div className="st-main">
          <header className="st-head">
            <div className="st-title">
              <span className="st-eyebrow">
                <i aria-hidden="true" />
                Prelims · {subject.pyqs} PYQs
              </span>
              <h1>
                {subject.name}{" "}
                <span className="nums">
                  <span className="score">{model.score}</span>
                  <span className="of"> / 1000</span>
                </span>
              </h1>
              <span className="st-trend">
                <Sparkline values={model.series} label={`${subject.name} readiness over the last 8 weeks`} />
                <span>
                  8 weeks · <em className={deltaClass(model.delta)}>{weekDelta(model.delta)}</em>
                </span>
              </span>
            </div>
            <div className="st-actions" ref={actions}>
              <Link className="board-btn" to={`/prelims/session?banks=${ids.join(",")}&n=${SESSION}&mode=practice`}>
                Practise {subject.name}
              </Link>
              {unread.length ? (
                <Link
                  className="board-btn quiet"
                  to={`/prelims/session?banks=${unread.join(",")}&n=${SESSION}&mode=practice`}
                >
                  Try before reading
                </Link>
              ) : (
                <button type="button" className="board-btn quiet" disabled title="Every topic is logged as read">
                  Try before reading
                </button>
              )}
              <button
                type="button"
                className="board-btn quiet"
                aria-expanded={menu}
                aria-haspopup="menu"
                onClick={() => setMenu((v) => !v)}
              >
                Log reading
              </button>
              {menu && (
                <div className="st-menu" role="menu" aria-label="Log reading">
                  <p>Which topic did you read today?</p>
                  {rows.map((r) => (
                    <button key={r.bank.id} type="button" role="menuitem" onClick={() => logReading(r.bank)}>
                      {r.bank.topic}
                      <span>{r.read ? readDay(r.read, today, yesterday) : "not read"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </header>

          {logged && lastRead(log, logged.id) === today && (
            <p className="st-status" role="status">
              Logged {logged.topic} as read today.
              <button
                type="button"
                onClick={() => {
                  void changeReading(slug, logged.id, "unlog", today);
                  setLogged(null);
                }}
              >
                Undo
              </button>
            </p>
          )}
          {reading.error && <p className="s-error">{reading.error}</p>}

          <div className="st-controls">
            <span className="label">Sort</span>
            <span className="seg" role="group" aria-label="Sort">
              {SORTS.map(([s, label]) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sort === s}
                  onClick={() => setParam("sort", s === "book" ? null : s)}
                >
                  {label}
                </button>
              ))}
            </span>
            <span className="label">Show</span>
            <span className="st-filters" role="group" aria-label="Filters">
              {FILTERS.map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  className="chip-btn"
                  aria-pressed={filters.has(f)}
                  onClick={() => toggleFilter(f)}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>

          <div className="st-table" aria-label={`${subject.name} topics`} role="region">
            <div className="st-row head" aria-hidden="true">
              <span>Topic</span>
              <span>PYQs</span>
              <span>Readiness</span>
              <span>MCQs</span>
              <span>Flashcards</span>
              <span>Read</span>
            </div>
            {shown.length === 0 && <p className="st-empty">No topics match these filters.</p>}
            {shown.map((r) => {
              const isOpen = expanded.has(r.bank.id);
              return (
                <div key={r.bank.id}>
                  <div className={`st-row${openBank === r.bank.id ? " sel" : ""}`}>
                    <button
                      type="button"
                      className="st-topic"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setExpanded((s) => {
                          const n = new Set(s);
                          if (n.has(r.bank.id)) n.delete(r.bank.id);
                          else n.add(r.bank.id);
                          return n;
                        })
                      }
                    >
                      <Chevron />
                      {r.bank.topic}
                    </button>
                    <Pyq pyq={r.pyq} max={maxPyq} />
                    <Ready score={r.score} started={r.answered > 0} />
                    <CountButton
                      label="MCQs"
                      topic={r.bank.topic}
                      c={r.mcq}
                      current={openBank === r.bank.id && kind === "mcq"}
                      onOpen={() => openDrawer(r.bank.id, "mcq")}
                    />
                    <CountButton
                      label="Flashcards"
                      topic={r.bank.topic}
                      c={r.card}
                      current={openBank === r.bank.id && kind === "flashcard"}
                      onOpen={() => openDrawer(r.bank.id, "flashcard")}
                    />
                    <span className={`st-read${r.read === today ? " today" : ""}`}>
                      <span className="st-cell-label">Read</span>
                      {readDay(r.read, today, yesterday)}
                    </span>
                  </div>
                  {isOpen && (
                    <>
                      {r.themes.map((t) => (
                        <div key={t.name} className="st-row sub">
                          <span className="st-mt">{t.name}</span>
                          <Pyq pyq={t.pyq} max={maxPyq} />
                          <Ready score={t.score} started={t.score > 0} />
                          <span className="st-count-plain">
                            <span className="st-cell-label">MCQs</span>
                            {t.mcq.total ? `${t.mcq.total}${t.mcq.due ? ` · ${t.mcq.due} due` : ""}` : "—"}
                          </span>
                          <span className="st-count-plain">
                            <span className="st-cell-label">Cards</span>
                            {t.card.total ? `${t.card.total}${t.card.due ? ` · ${t.card.due} due` : ""}` : "—"}
                          </span>
                          <span />
                        </div>
                      ))}
                      <div className="st-expand">
                        <button type="button" className="chip-btn" onClick={() => logReading(r.bank)}>
                          Log reading of {r.bank.topic}
                        </button>
                        <Link
                          className="chip-btn"
                          to={`/prelims/session?banks=${r.bank.id}&n=${SESSION}&mode=practice`}
                        >
                          Practise this topic
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {drawerView}
      </div>
    </article>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function Pyq({ pyq, max }: { pyq: { count: number; lastYear?: number }; max: number }) {
  // Heat tint as in the chosen design: faint for a rarely asked topic, strong for the most asked.
  const heat = (0.06 + (0.5 * pyq.count) / max).toFixed(2);
  return (
    <span
      className="st-pyq"
      style={{ "--heat": heat } as React.CSSProperties}
      title={pyq.count ? `${pyq.count} Prelims PYQs, last asked in ${pyq.lastYear}` : "Not asked in Prelims"}
    >
      {pyq.count}
      {pyq.lastYear ? <span> · '{String(pyq.lastYear % 100).padStart(2, "0")}</span> : null}
    </span>
  );
}

function Ready({ score, started }: { score: number; started: boolean }) {
  if (!started) return <span className="st-none">Not started</span>;
  return (
    <span className="st-ready">
      <span className="ph-bar" aria-hidden="true">
        <i style={{ width: `${score / 10}%` }} />
      </span>
      <b>{score}</b>
    </span>
  );
}

function CountButton(p: { label: string; topic: string; c: Counts; current: boolean; onOpen: () => void }) {
  if (!p.c.total)
    return (
      <span className="st-none">
        <span className="st-cell-label">{p.label === "MCQs" ? "MCQs" : "Cards"}</span>—
      </span>
    );
  return (
    <button
      type="button"
      className="st-count"
      aria-current={p.current}
      aria-label={`${p.label} in ${p.topic}: ${p.c.total}${p.c.due ? `, ${p.c.due} due` : ""}`}
      onClick={p.onOpen}
    >
      <span className="st-cell-label">{p.label === "MCQs" ? "MCQs" : "Cards"}</span>
      {p.c.total}
      {p.c.due ? <em> · {p.c.due} due</em> : null}
    </button>
  );
}

function level(n: number, max: number) {
  if (!n) return 0;
  return Math.min(4, 1 + Math.floor((3 * n) / Math.max(1, max)));
}

function Drawer(p: {
  subject: string;
  bank: Bank;
  kind: "mcq" | "flashcard";
  stats: KindStats;
  page: boolean;
  onClose: () => void;
}) {
  const s = p.stats;
  const isMcq = p.kind === "mcq";
  const maxDay = Math.max(1, ...s.strip.map((d) => d.n));
  const fresh = Math.min(s.fresh, DRILL_NEW);
  const start = isMcq
    ? `/prelims/session?banks=${p.bank.id}&n=${Math.max(1, s.due + fresh)}&mode=practice`
    : `/prelims/cards?banks=${p.bank.id}`;
  const cta = isMcq
    ? s.due
      ? `Start: ${s.due} due${fresh ? ` + ${fresh} new` : ""}`
      : fresh
        ? `Start ${fresh} new questions`
        : "Nothing due here"
    : s.due
      ? `Review ${s.due} due cards`
      : s.fresh
        ? `Learn ${Math.min(s.fresh, DRILL_NEW)} new cards`
        : "Nothing due here";
  const stats = isMcq
    ? [
        { v: s.total, k: `MCQs: ${s.pyqs} PYQs + ${s.total - s.pyqs} more` },
        { v: s.due, k: "due now" },
        { v: pct(s.recall), k: "recall, last 4 weeks" },
        { v: s.avgMs === null ? "—" : clock(s.avgMs), k: "average time" },
      ]
    : [
        { v: s.total, k: "flashcards" },
        { v: s.due, k: "due now" },
        { v: pct(s.recall), k: "recall, last 4 weeks" },
        { v: s.avgMs === null ? "—" : clock(s.avgMs), k: "average time" },
      ];
  return (
    <aside className={`st-drawer${p.page ? " page" : ""}`} aria-label="Topic analytics">
      {p.page && (
        <button type="button" className="st-back" onClick={p.onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {p.subject}
        </button>
      )}
      <div className="st-dr-head">
        <div>
          <span className="ph-eyebrow">
            {isMcq ? "MCQs" : "Flashcards"} · {p.subject}
          </span>
          <h2>{p.bank.topic}</h2>
        </div>
        {!p.page && (
          <button type="button" className="st-close" aria-label="Close" onClick={p.onClose}>
            ×
          </button>
        )}
      </div>
      <div className="st-stats">
        {stats.map((x) => (
          <div key={x.k}>
            <b>{x.v}</b>
            <span>{x.k}</span>
          </div>
        ))}
      </div>
      <div className="st-block">
        <span>Last 14 days</span>
        <div className="st-strip">
          {s.strip.map((d) => (
            <i
              key={d.day}
              className={`lv${level(d.n, maxDay)}`}
              title={`${shortDay(d.day)}: ${d.n ? `${d.n} answered, ${d.right} right` : "none"}`}
            />
          ))}
        </div>
      </div>
      <div className="st-block">
        <span>Weak microthemes</span>
        {s.weak.length ? (
          s.weak.slice(0, 3).map((w) => (
            <div key={w.microtheme} className="st-line weak">
              <span>{w.microtheme}</span>
              <span>
                {w.rightLast} of {w.answered} right last time
              </span>
            </div>
          ))
        ) : (
          <span className="muted small">
            None yet. A microtheme shows here after {MIN_WEAK_ATTEMPTS} answers with a miss.
          </span>
        )}
      </div>
      <div className="st-block">
        <span>Your traps here</span>
        {s.traps.length ? (
          s.traps.slice(0, 3).map((t) => (
            <div key={t.grade} className="st-line">
              <span>{t.label}</span>
              <span>
                {t.n} {t.n === 1 ? "time" : "times"}
              </span>
            </div>
          ))
        ) : (
          <span className="muted small">No graded misses here yet.</span>
        )}
      </div>
      {s.total > 0 &&
        (s.due || s.fresh ? (
          <Link className="board-btn" to={start}>
            {cta}
          </Link>
        ) : (
          <button type="button" className="board-btn" disabled>
            {cta}
          </button>
        ))}
    </aside>
  );
}
