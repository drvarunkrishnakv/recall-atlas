// Small inline-SVG charts for the Prelims screens (M11), drawn the way the notes' chart blocks are
// (components/Chart.tsx): a fixed viewBox that scales with its box, recessive grid lines, thin
// marks, a direct label on the last point only, and a <title> on every mark for hover. One series
// per chart; colours come from CSS (analytics.css).
import type { ReactNode } from "react";
import "../homes/homes.css";
import "./charts.css";

/** A rounded top for a scale: 100, 250, 500, 1000… so the grid lines land on round numbers. */
export function niceMax(v: number, floor = 100): number {
  const steps = [100, 250, 500, 1000];
  return steps.find((s) => s >= Math.max(v, floor)) ?? Math.ceil(v / 1000) * 1000;
}

/** A tiny trend line with its last point marked. */
export function Sparkline({ values, label, max = 1000 }: { values: number[]; label: string; max?: number }) {
  const W = 140,
    H = 32,
    pad = 4;
  const top = Math.max(max, ...values);
  const x = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, values.length - 1);
  const y = (v: number) => H - pad - (v / (top || 1)) * (H - 2 * pad);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      <line className="ch-base" x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} />
      {values.length > 1 && <polyline className="ch-line" points={pts} />}
      {last >= 0 && <circle className="ch-dot" cx={x(last)} cy={y(values[last])} r={3} />}
    </svg>
  );
}

/** A line over time with grid lines at 0, half and the top, and the last value labelled. */
export function LineChart({
  values,
  labels,
  label,
  max,
  format = (v) => String(Math.round(v)),
}: {
  values: number[];
  labels: string[];
  label: string;
  max?: number;
  format?: (v: number) => string;
}) {
  const W = 600,
    H = 160,
    x0 = 48,
    x1 = W - 16,
    y0 = 16,
    yb = H - 30;
  const top = max ?? niceMax(Math.max(0, ...values));
  const X = (i: number) => (values.length < 2 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (values.length - 1));
  const Y = (v: number) => yb - (v / top) * (yb - y0);
  const last = values.length - 1;
  const ticks = [0, top / 2, top];
  // Label the first and last point on the time axis, and the middle when there's room.
  const shown = new Set([0, last, values.length > 4 ? Math.floor(last / 2) : -1]);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line className={t === 0 ? "ch-base" : "ch-grid"} x1={x0} x2={x1} y1={Y(t)} y2={Y(t)} />
          <text className="ch-axis" x={x0 - 8} y={Y(t) + 4} textAnchor="end">
            {format(t)}
          </text>
        </g>
      ))}
      {labels.map((l, i) =>
        shown.has(i) ? (
          <text
            key={i}
            className="ch-axis"
            x={X(i)}
            y={H - 8}
            textAnchor={i === 0 && values.length > 1 ? "start" : i === last && values.length > 1 ? "end" : "middle"}
          >
            {l}
          </text>
        ) : null,
      )}
      {values.length > 1 && (
        <polyline
          className="ch-line"
          points={values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ")}
        />
      )}
      {values.map((v, i) => (
        <circle key={i} className={`ch-dot${i === last ? " last" : ""}`} cx={X(i)} cy={Y(v)} r={i === last ? 5 : 3}>
          <title>{`${labels[i]}: ${format(v)}`}</title>
        </circle>
      ))}
      {last >= 0 && (
        <text
          className="ch-label"
          x={X(last)}
          y={Y(values[last]) - 12}
          textAnchor={values.length > 1 ? "end" : "middle"}
        >
          {format(values[last])}
        </text>
      )}
    </svg>
  );
}

/** Vertical bars, one per period, the latest one picked out; empty periods show a dash. */
export function Bars({
  values,
  labels,
  label,
  format,
  max,
}: {
  values: (number | null)[];
  labels: string[];
  label: string;
  format: (v: number) => string;
  max?: number;
}) {
  const top = max ?? Math.max(1, ...values.map((v) => v ?? 0));
  const last = values.length - 1;
  return (
    <div className="bars" role="img" aria-label={label}>
      {values.map((v, i) => (
        <div key={i} className="bar-col" title={`${labels[i]}: ${v === null ? "no answers" : format(v)}`}>
          <span className="bar-v">{v === null ? "—" : format(v)}</span>
          <span
            className={`bar${i === last ? " last" : ""}`}
            style={{ height: `${v === null ? 0 : (v / top) * 100}%` }}
          />
          <span className="bar-l">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Columns on a fixed scale (Mains Analytics), one per period, each coloured by `tone`; an optional
 * shaded band marks a target range. Empty periods leave a gap; every column has a hover title.
 */
export function Columns({
  values,
  labels,
  sublabels,
  label,
  format,
  max,
  band,
  bandLabel,
  tone,
}: {
  values: (number | null)[];
  labels: string[];
  sublabels?: string[];
  label: string;
  format: (v: number) => string;
  max: number;
  band?: [number, number];
  bandLabel?: string;
  tone?: (v: number) => string;
}) {
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / (max || 1)) * 100))}%`;
  const dense = values.length > 10;
  return (
    <div className={`cols${dense ? " dense" : ""}`} role="img" aria-label={label}>
      <div className="cols-plot">
        {band && (
          <span className="cols-band" style={{ bottom: pct(band[0]), height: pct(band[1] - band[0]) }}>
            {bandLabel && <em>{bandLabel}</em>}
          </span>
        )}
        {values.map((v, i) => (
          <div
            key={i}
            className="col"
            title={`${labels[i]}${sublabels ? ` (${sublabels[i]})` : ""}: ${v === null ? "none" : format(v)}`}
          >
            {v !== null && <span className={`col-bar ${tone?.(v) ?? ""}`} style={{ height: pct(v) }} />}
            {v !== null && (
              <span className={`col-v ${tone?.(v) ?? ""}`} style={{ bottom: pct(v) }}>
                {format(v)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="cols-x" aria-hidden="true">
        {labels.map((l, i) => (
          <span key={i}>
            {l}
            {sublabels && <small>{sublabels[i]}</small>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A calendar of days (columns are weeks, Monday on top), each square shaded by `level`. */
export function Calendar({
  days,
  level,
  tip,
  label,
}: {
  days: { day: string; n: number }[];
  level: (n: number) => number;
  tip: (d: { day: string; n: number }) => string;
  label: string;
}) {
  // Pad the first week so each column starts on a Monday.
  const first = days[0] ? (new Date(`${days[0].day}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const cells: ReactNode[] = [];
  for (let i = 0; i < first; i++) cells.push(<span key={`pad${i}`} className="cal-pad" />);
  for (const d of days) cells.push(<span key={d.day} className={`lv${level(d.n)}`} title={tip(d)} />);
  const weeks = Math.ceil((first + days.length) / 7);
  return (
    <div
      className="cal"
      role="img"
      aria-label={label}
      style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 18px))` }}
    >
      {cells}
    </div>
  );
}
