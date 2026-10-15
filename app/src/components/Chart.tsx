// Renders a ```chart block: a JSON spec with rows, drawn as SVG in the theme's colours.
// Three shapes cover the notes so far: "line" (a value over years, with gaps and
// reference lines), "bar" (categories with one or two series) and "step" (a cumulative
// count over dates, with event markers and a shaded band).
import type { ReactNode } from "react";

type Row = Record<string, string | number | boolean | null>;
interface Spec {
  type: "line" | "bar" | "step";
  title?: string;
  subtitle?: string;
  source?: string;
  x: { field: string; min?: number | string; max?: number | string; ticks?: number[]; sub?: string };
  y: { min?: number; max: number; ticks?: number[]; unit?: string };
  series: { field: string; label?: string; accent?: boolean; approxField?: string; cumulative?: boolean }[];
  rows: Row[];
  gaps?: { from: number; to: number; label?: string }[];
  refLines?: { y: number; label: string }[];
  labelPoints?: number[];
  footer?: { field: string; format: string; missing?: string };
  start?: string;
  events?: { x: string; label: string; strong?: boolean; align?: "start" | "end" }[];
  band?: { from: string; to: string; label?: string };
  endLabel?: string;
}

const W = 680;
const fmt = (v: number, unit = "") => `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`;
const day = (d: string) => Date.parse(d) / 864e5;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function Chart({ source }: { source: string }) {
  let spec: Spec;
  try {
    spec = JSON.parse(source);
  } catch {
    return <pre className="chart-error">Chart data could not be read.</pre>;
  }
  const svg = spec.type === "bar" ? <Bars s={spec} /> : spec.type === "step" ? <Steps s={spec} /> : <Lines s={spec} />;
  return (
    <figure className="visual">
      {(spec.title || spec.subtitle) && (
        <div className="ch-head">
          {spec.title && <b>{spec.title}</b>}
          {spec.subtitle && <span>{spec.subtitle}</span>}
        </div>
      )}
      {spec.type === "bar" && (
        <div className="ch-legend">
          {spec.series.map((se) => (
            <span key={se.field}>
              <i className={se.accent ? "accent" : ""} />
              {se.label}
            </span>
          ))}
        </div>
      )}
      <div className="scroll">{svg}</div>
      {spec.source && <figcaption>Source: {spec.source}</figcaption>}
    </figure>
  );
}

function YAxis({ s, x0, x1, Y }: { s: Spec; x0: number; x1: number; Y: (v: number) => number }) {
  return (
    <g>
      {(s.y.ticks ?? []).map((t) => (
        <g key={t}>
          <line className="ch-grid" x1={x0} x2={x1} y1={Y(t)} y2={Y(t)} />
          <text className="ch-axis" x={x0 - 8} y={Y(t) + 4} textAnchor="end">
            {fmt(t, s.y.unit)}
          </text>
        </g>
      ))}
    </g>
  );
}

function Lines({ s }: { s: Spec }) {
  const H = 260,
    x0 = 46,
    x1 = W - 16,
    y0 = 16,
    yb = H - 34;
  const xmin = Number(s.x.min),
    xmax = Number(s.x.max),
    ymin = s.y.min ?? 0;
  const X = (v: number) => x0 + ((v - xmin) / (xmax - xmin)) * (x1 - x0);
  const Y = (v: number) => yb - ((v - ymin) / (s.y.max - ymin)) * (yb - y0);
  const f = s.series[0].field,
    xf = s.x.field;
  const rows = s.rows.filter((r) => r[f] !== null);
  const gapAt = (a: Row, b: Row) => (s.gaps ?? []).some((g) => Number(a[xf]) <= g.from && Number(b[xf]) >= g.to);
  const segments: Row[][] = [[]];
  rows.forEach((r, i) => {
    if (i && gapAt(rows[i - 1], r)) segments.push([]);
    segments[segments.length - 1].push(r);
  });
  const path = (seg: Row[]) => seg.map((r, i) => `${i ? "L" : "M"}${X(Number(r[xf]))} ${Y(Number(r[f]))}`).join(" ");
  const last = rows[rows.length - 1];
  const labelled = new Set(s.labelPoints ?? [Number(last[xf])]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={s.title ?? "Line chart"}>
      <YAxis s={s} x0={x0} x1={x1} Y={Y} />
      {(s.x.ticks ?? []).map((t) => (
        <text key={t} className="ch-axis" x={X(t)} y={yb + 20} textAnchor="middle">
          {t}
        </text>
      ))}
      {(s.refLines ?? []).map((r) => (
        <g key={r.label}>
          <line className="ch-ref" x1={x0} x2={x1} y1={Y(r.y)} y2={Y(r.y)} />
          <text className="ch-note" x={x0 + 6} y={Y(r.y) - 6}>
            {r.label}
          </text>
        </g>
      ))}
      {(s.gaps ?? []).map((g) => {
        const a = rows.find((r) => Number(r[xf]) === g.from),
          b = rows.find((r) => Number(r[xf]) === g.to);
        if (!a || !b) return null;
        return (
          <g key={g.from}>
            <path className="ch-gap" d={`M${X(g.from)} ${Y(Number(a[f]))}L${X(g.to)} ${Y(Number(b[f]))}`} />
            {g.label && (
              <text
                className="ch-note"
                x={(X(g.from) + X(g.to)) / 2}
                y={Math.min(Y(Number(a[f])), Y(Number(b[f]))) - 14}
                textAnchor="middle"
              >
                {g.label}
              </text>
            )}
          </g>
        );
      })}
      {segments.map((seg, i) => (
        <path key={i} className="ch-line" d={path(seg)} />
      ))}
      {rows.map((r) => {
        const isLast = r === last,
          xv = Number(r[xf]),
          yv = Number(r[f]);
        const label = labelled.has(xv);
        const prevHigher = rows.some((q) => q !== r && Math.abs(X(Number(q[xf])) - X(xv)) < 60 && Number(q[f]) > yv);
        return (
          <g key={xv}>
            <circle className={`ch-dot${isLast ? " accent" : ""}`} cx={X(xv)} cy={Y(yv)} r={isLast ? 6 : 4}>
              <title>{`${xv}: ${fmt(yv, s.y.unit)}${r.note ? ` (${r.note})` : ""}`}</title>
            </circle>
            {label && (
              <text
                className={`ch-label${isLast ? " strong" : ""}`}
                x={X(xv)}
                y={isLast && prevHigher ? Y(yv) + 24 : Y(yv) - 12}
                textAnchor={
                  !isLast && rows.some((q) => Number(q[xf]) > xv && X(Number(q[xf])) - X(xv) < 60) ? "end" : "middle"
                }
              >
                {fmt(yv, s.y.unit)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Bars({ s }: { s: Spec }) {
  const H = 270,
    x0 = 46,
    x1 = W - 10,
    y0 = 18,
    yb = H - 70;
  const Y = (v: number) => yb - (v / s.y.max) * (yb - y0);
  const band = (x1 - x0) / s.rows.length;
  const n = s.series.length,
    bw = Math.min(52, (band - 24) / n);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={s.title ?? "Bar chart"}>
      <YAxis s={s} x0={x0} x1={x1} Y={Y} />
      {s.rows.map((r, i) => {
        const cx = x0 + band * (i + 0.5);
        const bars: ReactNode[] = s.series.map((se, j) => {
          const v = r[se.field];
          if (v === null || v === undefined) return null;
          const x = cx - (n * bw + (n - 1) * 6) / 2 + j * (bw + 6);
          const approx = se.approxField && r[se.approxField] ? "~" : "";
          return (
            <g key={se.field}>
              <rect
                className={`ch-bar${se.accent ? " accent" : ""}`}
                x={x}
                y={Y(Number(v))}
                width={bw}
                height={yb - Y(Number(v))}
                rx={2}
              >
                <title>{`${r[s.x.field]}: ${se.label ?? se.field} ${approx}${fmt(Number(v), s.y.unit)}`}</title>
              </rect>
              <text
                className={`ch-label${se.accent ? " strong" : ""}`}
                x={x + bw / 2}
                y={Y(Number(v)) - 7}
                textAnchor="middle"
              >
                {approx}
                {fmt(Number(v), s.y.unit)}
              </text>
            </g>
          );
        });
        const foot = s.footer ? r[s.footer.field] : null;
        return (
          <g key={String(r[s.x.field])}>
            {bars}
            <text className="ch-label strong" x={cx} y={yb + 20} textAnchor="middle">
              {String(r[s.x.field])}
            </text>
            {s.x.sub && (
              <text className="ch-axis" x={cx} y={yb + 36} textAnchor="middle">
                {String(r[s.x.sub])}
              </text>
            )}
            {s.footer && (
              <text className="ch-note" x={cx} y={yb + 58} textAnchor="middle">
                {foot === null || foot === undefined
                  ? (s.footer.missing ?? "")
                  : s.footer.format.replace("{v}", String(foot))}
              </text>
            )}
          </g>
        );
      })}
      <line className="ch-grid" x1={x0} x2={x1} y1={yb} y2={yb} />
    </svg>
  );
}

function Steps({ s }: { s: Spec }) {
  const H = 330,
    x0 = 40,
    x1 = W - 60,
    yt = 150,
    yb = H - 36;
  const lo = day(String(s.x.min)),
    hi = day(String(s.x.max));
  const X = (d: string) => x0 + ((day(d) - lo) / (hi - lo)) * (x1 - x0);
  const Y = (v: number) => yb - (v / s.y.max) * (yb - yt);
  const f = s.series[0].field;
  let total = 0;
  const pts = s.rows.map((r) => ({ d: String(r[s.x.field]), n: Number(r[f]), cum: (total += Number(r[f])) }));
  const path = pts.reduce((acc, p) => `${acc}H${X(p.d)}V${Y(p.cum)}`, `M${X(s.start ?? pts[0].d)} ${Y(0)}`);
  // Months on the axis, from the first of each month inside the range.
  const months: string[] = [];
  const start = new Date(String(s.x.min)),
    end = new Date(String(s.x.max));
  for (
    let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    d <= end;
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  )
    months.push(d.toISOString().slice(0, 10));
  // Stagger event labels into rows so neighbours don't overlap.
  const rowsUsed: number[][] = [];
  const placed = (s.events ?? []).map((e) => {
    const x = X(e.x);
    let row = 0;
    while ((rowsUsed[row] ?? []).some((px) => Math.abs(px - x) < 150)) row++;
    (rowsUsed[row] ??= []).push(x);
    return { ...e, date: e.x, x, row, align: e.align ?? (x > W - 160 ? ("end" as const) : ("start" as const)) };
  });
  const short = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={s.title ?? "Timeline chart"}>
      {s.band && (
        <g>
          <rect
            className="ch-band"
            x={X(s.band.from)}
            y={yt - 10}
            width={X(s.band.to) - X(s.band.from)}
            height={yb - yt + 10}
          />
          {s.band.label && (
            <text className="ch-note" x={(X(s.band.from) + X(s.band.to)) / 2} y={yt + 8} textAnchor="middle">
              {s.band.label}
            </text>
          )}
        </g>
      )}
      <YAxis s={s} x0={x0} x1={x1} Y={Y} />
      {months.map((m) => {
        const mi = Number(m.slice(5, 7));
        return (
          <text key={m} className="ch-axis" x={X(m)} y={yb + 20} textAnchor="middle">
            {mi === 1 || m === months[0] ? `${MON[mi - 1]} ${m.slice(0, 4)}` : MON[mi - 1]}
          </text>
        );
      })}
      {placed.map((e) => {
        const ly = 22 + e.row * 34;
        const anchor = e.align === "end" ? "end" : "start";
        const dx = e.align === "end" ? -5 : 5;
        return (
          <g key={e.label}>
            <line className="ch-ref" x1={e.x} x2={e.x} y1={ly + 18} y2={yb} />
            <text className={`ch-label${e.strong ? " strong" : ""}`} x={e.x + dx} y={ly} textAnchor={anchor}>
              {e.label}
            </text>
            <text className="ch-note" x={e.x + dx} y={ly + 14} textAnchor={anchor}>
              {short(e.date)}
            </text>
          </g>
        );
      })}
      <path className="ch-line accent" d={path} />
      {pts.map((p, i) => (
        <circle key={p.d} className="ch-dot accent" cx={X(p.d)} cy={Y(p.cum)} r={i === pts.length - 1 ? 5 : 3.5}>
          <title>{`${p.d}: ${p.n} decided; ${p.cum} in total`}</title>
        </circle>
      ))}
      {s.endLabel && (
        <text className="ch-label strong" x={X(last.d) + 9} y={Y(last.cum) + 4}>
          {s.endLabel}
        </text>
      )}
    </svg>
  );
}
