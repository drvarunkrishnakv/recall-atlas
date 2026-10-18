// The news heat map (/heat-map, "News heat map" in the sidebar): which stories lasted. A chart
// of how many months each story stayed hot against how loud it got, the chosen story's
// timeline with sources, and every story's "river", month by month. Read-only: Claude imports
// the map with `atlas heatmap-import`. Selection lives in the URL (replaced, not pushed).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Link, useSearchParams } from "react-router";
import { api, getPage } from "../content/store";
import {
  AREAS,
  AREA_LABEL,
  CUTS,
  LEVEL_LABEL,
  QUADRANT_BLURB,
  QUADRANT_LABEL,
  dayLabel,
  monthLabel,
  monthRange,
  quadrantOf,
  seriesOf,
  storyStats,
  type Area,
  type HeatMap,
  type HeatStory,
  type Measure,
  type Quadrant,
  type StoryStats,
} from "../lib/heatmap";

const AREA_COLOR: Record<Area, string> = {
  polity: "#5b5bd6",
  governance: "#138a7e",
  social: "#c2477f",
  economy: "#c98408",
  ir: "#d9542f",
  security: "#66758f",
  env: "#3d8b37",
  st: "#2b78b5",
  culture: "#8b4fb3",
};

interface Row {
  s: HeatStory;
  series: number[];
  st: StoryStats;
  q: Quadrant;
}

export default function HeatMapPage() {
  const [map, setMap] = useState<HeatMap | null | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    document.title = "News heat map · Mains Atlas";
    let live = true;
    (api("/api/heatmap") as Promise<{ map: HeatMap | null }>)
      .then((r) => live && setMap(r.map))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  if (error || !map)
    return (
      <article className="dash hm">
        <header className="dash-head">
          <div>
            <div className="eyebrow">Current affairs</div>
            <h1>Which stories lasted</h1>
          </div>
        </header>
        <p className="muted">
          {error
            ? `Couldn't load the heat map: ${error}`
            : map === undefined
              ? "Loading the heat map…"
              : "No heat map yet. It appears here once Claude has researched the news and imported it."}
        </p>
      </article>
    );
  return <HeatMapView map={map} />;
}

function HeatMapView({ map }: { map: HeatMap }) {
  const [params, setParams] = useSearchParams();
  const measure: Measure = params.get("by") === "weight" ? "weight" : "coverage";
  const areaParam = params.get("area");
  const area = (AREAS as readonly string[]).includes(areaParam ?? "") ? (areaParam as Area) : null;
  const months = useMemo(() => monthRange(map.from, map.to), [map]);
  const rows = useMemo<Row[]>(
    () =>
      map.stories
        .map((s) => {
          const series = seriesOf(s, months, measure);
          const st = storyStats(series);
          return { s, series, st, q: quadrantOf(st) };
        })
        .filter((r) => r.st.active > 0)
        .sort((a, b) => b.st.hot - a.st.hot || b.st.peak - a.st.peak || a.s.name.localeCompare(b.s.name)),
    [map, months, measure],
  );
  const shown = area ? rows.filter((r) => r.s.area === area) : rows;
  const areas = AREAS.filter((a) => rows.some((r) => r.s.area === a));
  const sel = rows.find((r) => r.s.id === params.get("story")) ?? shown[0] ?? rows[0];
  const selMonth = params.get("m");
  const exams = useMemo(() => {
    const out: Record<string, string> = {};
    for (const e of map.exams) out[e.date.slice(0, 7)] = e.kind === "prelims" ? "P" : "M";
    return out;
  }, [map]);

  const set = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) n.delete(k);
          else n.set(k, v);
        }
        return n;
      },
      { replace: true },
    );

  // On narrow screens the story card sits above the rivers: bring it into view on a pick.
  const cardRef = useRef<HTMLElement>(null);
  const picked = useRef(false);
  const pick = (id: string, m: string | null) => {
    picked.current = true;
    set({ story: id, m });
  };
  useEffect(() => {
    if (!picked.current) return;
    picked.current = false;
    const card = cardRef.current;
    if (!card || window.innerWidth >= 1000) return;
    const r = card.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.6) card.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sel?.s.id, selMonth]);

  return (
    <article className="dash wide hm">
      <header className="dash-head">
        <div>
          <div className="eyebrow">
            Current affairs · {monthLabel(map.from)} to {monthLabel(map.to)}
          </div>
          <h1>Which stories lasted</h1>
          <p className="hm-lead">
            Each dot is a story from the news. The further right, the more months it stayed hot. The higher up, the
            louder it got at its peak.
          </p>
        </div>
        <div className="head-chips">
          <span className="pill">{map.stories.length} stories</span>
          <span className="pill review">
            News only ·{" "}
            {map.frozenAt
              ? `frozen ${dayLabel(map.frozenAt)} ${map.frozenAt.slice(0, 4)}`
              : `built ${dayLabel(map.builtAt)} ${map.builtAt.slice(0, 4)}`}
          </span>
        </div>
      </header>

      <div className="hm-controls">
        <div className="hm-seg" role="group" aria-label="Colour and size by">
          {(["coverage", "weight"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={measure === m}
              onClick={() => set({ by: m === "coverage" ? null : m })}
            >
              {m === "coverage" ? "Coverage" : "Exam weight"}
            </button>
          ))}
        </div>
        <div className="hm-areas" role="group" aria-label="Area">
          <button type="button" className={`chip-btn${area ? "" : " on"}`} onClick={() => set({ area: null })}>
            All
          </button>
          {areas.map((a) => (
            <button
              key={a}
              type="button"
              className={`chip-btn${area === a ? " on" : ""}`}
              aria-pressed={area === a}
              onClick={() => set({ area: area === a ? null : a })}
            >
              <span className="hm-dotkey" style={{ background: AREA_COLOR[a] }} />
              {AREA_LABEL[a]}
            </button>
          ))}
        </div>
      </div>

      <div className="hm-top">
        <section className="hm-card hm-chart" aria-label="How long and how loud">
          <Scatter rows={shown} total={months.length} selId={sel?.s.id} onPick={(id) => pick(id, null)} />
        </section>
        {sel && (
          <StoryCard
            ref={cardRef}
            row={sel}
            months={months}
            measure={measure}
            selMonth={selMonth}
            onMonth={(m) => set({ m })}
          />
        )}
      </div>

      <Rivers
        rows={shown}
        months={months}
        exams={exams}
        selId={sel?.s.id}
        selMonth={selMonth}
        measure={measure}
        onPick={pick}
      />

      <p className="hm-method muted">
        {measure === "coverage"
          ? "Coverage: how much the news covered a story that month, judged from its developments, editorials and explainers, not an article count."
          : "Exam weight: Claude's judgement of how much a story matters for the exam, made without looking at past papers."}{" "}
        A month is hot at medium or above. {map.method}
        {map.partial ? ` ${map.partial}` : ""}
      </p>
    </article>
  );
}

/** The element's width, kept up to date. */
function useWidth(ref: RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/**
 * Many stories share the same numbers (most were hot for a single month), so dots on the same
 * spot fan out in a small sunflower spiral around it, in pixels.
 */
type Box = { x1: number; x2: number; y1: number; y2: number };

function spread(rows: Row[], step: number) {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.st.hot}|${r.st.peak.toFixed(2)}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out = new Map<string, { dx: number; dy: number }>();
  for (const list of groups.values())
    list.forEach((r, i) => {
      const rad = step * Math.sqrt(i),
        a = i * 2.39996;
      out.set(r.s.id, { dx: rad * Math.cos(a), dy: rad * Math.sin(a) });
    });
  return out;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// A little headroom past "very high" and the last month keeps edge dots off the corner labels.
const PEAK_MIN = 1,
  PEAK_MAX = 4.3;

function Scatter({
  rows,
  total,
  selId,
  onPick,
}: {
  rows: Row[];
  total: number;
  selId?: string;
  onPick: (id: string) => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const w = useWidth(areaRef);
  const narrow = w > 0 && w < 520;
  const plotH = narrow ? 320 : 420;
  const h = plotH - 52;
  const yOf = (peak: number) => clamp01((peak - PEAK_MIN) / (PEAK_MAX - PEAK_MIN));
  // Months hot on a square-root scale: most stories were hot for a month or two, a few for years.
  const xOf = (hot: number) => Math.sqrt(hot) / Math.sqrt(total + 0.6);
  const cutX = xOf(CUTS.hot),
    cutY = yOf(CUTS.peak);
  const offsets = spread(rows, narrow ? 4.5 : 6.5);
  const dots = rows.map((r) => {
    const o = offsets.get(r.s.id) ?? { dx: 0, dy: 0 };
    const x = xOf(r.st.hot),
      y = clamp01(yOf(r.st.peak));
    // In pixels once the width is known, kept inside the plot.
    const px = w ? Math.min(Math.max(x * w + o.dx, 5), w - 5) : 0,
      py = w ? Math.min(Math.max(y * h + o.dy, 5), h - 5) : 0;
    return { r, on: r.s.id === selId, x, y, px, py };
  });

  // Label the chosen story and the most telling others, skipping any label that would collide.
  const labels = (() => {
    if (!w) return [];
    const score = (d: (typeof dots)[number]) =>
      (d.on ? 1000 : 0) + (d.r.q === "long-loud" ? 200 : d.r.q === "brief-loud" ? 100 : 0) + d.r.st.hot * d.r.st.peak;
    const boxes = [
      { x1: 0, x2: 110, y1: h - 26, y2: h },
      { x1: w - 110, x2: w, y1: h - 26, y2: h },
      { x1: 0, x2: 100, y1: 0, y2: 26 },
      { x1: w - 100, x2: w, y1: 0, y2: 26 },
    ];
    // Labels mustn't cover other dots either.
    const at = (d: (typeof dots)[number]) => ({ px: d.px, py: d.py });
    const dotBoxes = dots.map((d) => {
      const { px, py } = at(d);
      return { id: d.r.s.id, x1: px - 7, x2: px + 7, y1: h - py - 7, y2: h - py + 7 };
    });
    const out: { id: string; text: string; left?: number; right?: number; bottom: number; on: boolean }[] = [];
    const max = narrow ? 5 : 14;
    const worth = (d: (typeof dots)[number]) =>
      d.on || d.r.q === "long-loud" || (d.r.q === "brief-loud" && d.r.st.hot >= 3);
    for (const d of dots.filter(worth).sort((a, b) => score(b) - score(a))) {
      if (!d.on && out.length >= max) continue;
      const text = d.r.s.short ?? d.r.s.name;
      const tw = text.length * 6.6 + 8;
      const { px, py } = at(d);
      const gap = d.on ? 15 : 10;
      const overlaps = (box: Box) => (b: Box) => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1;
      const clear = (box: Box) =>
        !boxes.some(overlaps(box)) && !dotBoxes.some((b) => b.id !== d.r.s.id && overlaps(box)(b));
      // Try beside the dot, then above or below it (rows of dots leave room between them).
      const mid = Math.min(Math.max(px - tw / 2, 0), w - tw);
      const spots = [
        {
          box: { x1: px + gap - 2, x2: px + gap + tw, y1: h - py - 8, y2: h - py + 8 },
          pos: { left: px + gap, bottom: py },
        },
        {
          box: { x1: px - gap - tw, x2: px - gap + 2, y1: h - py - 8, y2: h - py + 8 },
          pos: { right: w - px + gap, bottom: py },
        },
        { box: { x1: mid, x2: mid + tw, y1: h - py - 23, y2: h - py - 7 }, pos: { left: mid + 4, bottom: py + 15 } },
        { box: { x1: mid, x2: mid + tw, y1: h - py + 7, y2: h - py + 23 }, pos: { left: mid + 4, bottom: py - 15 } },
      ].filter((p) => p.box.x1 >= 0 && p.box.x2 <= w && p.box.y1 >= 0 && p.box.y2 <= h);
      const spot = spots.find((p) => clear(p.box)) ?? (d.on ? spots[0] : undefined);
      if (!spot) continue;
      boxes.push(spot.box);
      out.push({ id: d.r.s.id, text, on: d.on, ...spot.pos });
    }
    return out;
  })();

  const xTicks = [0, 1, 3, 6, 12, 24].filter((t) => t <= total);
  return (
    <div className="hm-plot" style={{ height: plotH }}>
      <div className="hm-yaxis" aria-hidden="true">
        {[1, 2, 3, 4].map((v) => (
          <span key={v} style={{ bottom: `${yOf(v) * 100}%` }}>
            {LEVEL_LABEL[v]}
          </span>
        ))}
      </div>
      <div className="hm-area" ref={areaRef}>
        <div
          className="hm-quad q-brief-loud"
          style={{ left: 0, top: 0, width: `${cutX * 100}%`, height: `${(1 - cutY) * 100}%` }}
        >
          <span className="tl">Loud but brief</span>
        </div>
        <div
          className="hm-quad q-long-loud"
          style={{ left: `${cutX * 100}%`, right: 0, top: 0, height: `${(1 - cutY) * 100}%` }}
        >
          <span className="tr">Long and loud</span>
        </div>
        <div
          className="hm-quad q-background"
          style={{ left: 0, bottom: 0, width: `${cutX * 100}%`, height: `${cutY * 100}%` }}
        >
          <span className="bl">Background</span>
        </div>
        <div
          className="hm-quad q-slow"
          style={{ left: `${cutX * 100}%`, right: 0, bottom: 0, height: `${cutY * 100}%` }}
        >
          <span className="br">Slow burners</span>
        </div>
        {dots.map((d) => (
          <button
            key={d.r.s.id}
            type="button"
            className={`hm-dot${d.on ? " on" : ""}`}
            style={{
              left: w ? d.px : `${d.x * 100}%`,
              bottom: w ? d.py : `${d.y * 100}%`,
              background: AREA_COLOR[d.r.s.area],
            }}
            aria-pressed={d.on}
            aria-label={`${d.r.s.name}: hot for ${d.r.st.hot} months, peak ${d.r.st.peak.toFixed(1)} of 4`}
            title={`${d.r.s.name} · hot ${d.r.st.hot} mo · peak ${d.r.st.peak.toFixed(1)}`}
            onClick={() => onPick(d.r.s.id)}
          />
        ))}
        {labels.map((l) => (
          <span
            key={l.id}
            className={`hm-label${l.on ? " on" : ""}`}
            aria-hidden="true"
            style={{ left: l.left, right: l.right, bottom: l.bottom }}
          >
            {l.text}
          </span>
        ))}
      </div>
      <div className="hm-xaxis" aria-hidden="true">
        {xTicks.map((t) => (
          <span key={t} style={{ left: `${xOf(t) * 100}%` }}>
            {t}
          </span>
        ))}
        <b>months hot (medium or above), on a square-root scale</b>
      </div>
    </div>
  );
}

function StoryCard({
  ref,
  row,
  months,
  measure,
  selMonth,
  onMonth,
}: {
  ref: RefObject<HTMLElement | null>;
  row: Row;
  months: string[];
  measure: Measure;
  selMonth: string | null;
  onMonth: (m: string) => void;
}) {
  const { s, st, q } = row;
  const timeline = months.filter((m) => s.months[m]);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (!selMonth) return;
    const li = listRef.current?.querySelector<HTMLElement>(`[data-m="${selMonth}"]`);
    li?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selMonth, s.id]);

  return (
    <aside className="hm-card hm-story" ref={ref} aria-label="Selected story">
      <span className={`hm-q q-${q}`}>{QUADRANT_LABEL[q]}</span>
      <h2>{s.name}</h2>
      <div className="hm-tags">
        <span className="hm-tag">
          <span className="hm-dotkey" style={{ background: AREA_COLOR[s.area] }} />
          {AREA_LABEL[s.area]}
        </span>
        {s.notes?.map((id) => (
          <Link key={id} className="hm-note" to={`/notes/${id}`}>
            {id} · {getPage("notes", id)?.title ?? "Atlas note"}
          </Link>
        ))}
      </div>
      <dl className="hm-stats">
        <div>
          <dt>Months hot</dt>
          <dd>{st.hot}</dd>
        </div>
        <div>
          <dt>Peak, of 4</dt>
          <dd>{st.peak.toFixed(1)}</dd>
        </div>
        <div>
          <dt>First hot</dt>
          <dd>{st.first >= 0 ? monthLabel(months[st.first]) : "Never"}</dd>
        </div>
        <div>
          <dt>Last hot</dt>
          <dd>{st.last >= 0 ? monthLabel(months[st.last]) : "Never"}</dd>
        </div>
      </dl>
      <p className="hm-blurb">{QUADRANT_BLURB[q]}</p>
      <h3>Month by month</h3>
      <ol className="hm-timeline" ref={listRef}>
        {timeline.map((m) => {
          const c = s.months[m];
          return (
            <li key={m} data-m={m} className={m === selMonth ? "on" : undefined}>
              <button type="button" className="hm-tl-head" onClick={() => onMonth(m)}>
                <b>{monthLabel(m)}</b>
                <span className={`hm-lv lv${c[measure]}`}>{LEVEL_LABEL[c[measure]]}</span>
              </button>
              {c.summary && <p>{c.summary}</p>}
              {c.events.length > 0 && (
                <ul>
                  {c.events.map((e, i) => (
                    <li key={i}>
                      <span className="hm-date">{dayLabel(e.date)}</span> {e.text}{" "}
                      {e.sources.map((src, k) => (
                        <a key={k} className="hm-src" href={src.url} target="_blank" rel="noopener noreferrer">
                          {src.label}
                        </a>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <div className="hm-later">
        Past-paper questions on this story will show here after the comparison: how many, which year, and how many
        months after its peak.
      </div>
    </aside>
  );
}

function Rivers({
  rows,
  months,
  exams,
  selId,
  selMonth,
  measure,
  onPick,
}: {
  rows: Row[];
  months: string[];
  exams: Record<string, string>;
  selId?: string;
  selMonth: string | null;
  measure: Measure;
  onPick: (id: string, m: string | null) => void;
}) {
  const yearStart = (i: number) => i > 0 && months[i].endsWith("-01");
  // Stories hot for a month or less are many; they show on request.
  const [all, setAll] = useState(false);
  const quiet = rows.filter((r) => r.st.hot < 2 && r.s.id !== selId).length;
  const list = all ? rows : rows.filter((r) => r.st.hot >= 2 || r.s.id === selId);
  return (
    <section className="hm-card hm-rivers" aria-label="Story rivers">
      <div className="hm-rivers-head">
        <h2 className="sec-h">Story rivers</h2>
        <span className="muted">
          Each row is one story&apos;s life, month by month. Taller means{" "}
          {measure === "coverage" ? "more covered" : "weightier"}. Longest-lasting first. P and M mark the Prelims and
          Mains months.
        </span>
      </div>
      <div className="hm-scroll">
        <div className="hm-grid">
          <div className="hm-row hm-years" aria-hidden="true">
            <span className="hm-rl" />
            <div className="hm-bars">
              {months.map((m, i) => (
                <span key={m} className={`hm-cell${yearStart(i) ? " ys" : ""}`}>
                  {(i === 0 || m.endsWith("-01")) && <b>{m.slice(0, 4)}</b>}
                </span>
              ))}
            </div>
          </div>
          <div className="hm-row hm-exams" aria-hidden="true">
            <span className="hm-rl" />
            <div className="hm-bars">
              {months.map((m, i) => (
                <span key={m} className={`hm-cell${yearStart(i) ? " ys" : ""}${exams[m] ? " exam" : ""}`}>
                  {exams[m] ?? monthLabel(m).charAt(0)}
                </span>
              ))}
            </div>
          </div>
          {list.map((r) => {
            const on = r.s.id === selId;
            return (
              <div
                key={r.s.id}
                className={`hm-row${on ? " on" : ""}`}
                onClick={(e) => {
                  const m = (e.target as HTMLElement).closest("[data-m]")?.getAttribute("data-m");
                  if (m) onPick(r.s.id, r.s.months[m] ? m : null);
                }}
              >
                <button type="button" className="hm-rl" aria-pressed={on} onClick={() => onPick(r.s.id, null)}>
                  <span className="hm-dotkey" style={{ background: AREA_COLOR[r.s.area] }} />
                  <span className="hm-rl-name">{r.s.name}</span>
                </button>
                <div className="hm-bars">
                  {r.series.map((v, i) => (
                    <span
                      key={months[i]}
                      data-m={months[i]}
                      className={`hm-cell${yearStart(i) ? " ys" : ""}${exams[months[i]] ? " exam" : ""}${on && selMonth === months[i] ? " picked" : ""}`}
                      title={`${monthLabel(months[i])}: ${LEVEL_LABEL[v]}`}
                    >
                      <i
                        style={
                          {
                            height: v ? 4 + v * 5 : 2,
                            background: v ? AREA_COLOR[r.s.area] : undefined,
                            opacity: v ? 0.3 + v * 0.175 : undefined,
                          } as CSSProperties
                        }
                      />
                    </span>
                  ))}
                </div>
                <span className="hm-hot">{r.st.hot} mo</span>
              </div>
            );
          })}
        </div>
      </div>
      {quiet > 0 && (
        <button type="button" className="chip-btn hm-more" onClick={() => setAll((v) => !v)}>
          {all ? "Show only stories hot for two months or more" : `Show ${quiet} more stories, hot for a month or less`}
        </button>
      )}
    </section>
  );
}
