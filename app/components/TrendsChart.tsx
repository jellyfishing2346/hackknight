"use client";
import { useState } from "react";
import { money } from "@/lib/split";

export type MonthBucket = {
  key: string;
  label: string;
  total: number;
  segments: { category: string; value: number }[];
};

/** Fixed categorical order = fixed color order. Capped at 6 of the palette's 8 validated slots. */
const CATEGORY_COLOR: Record<string, string> = {
  "Food & Dining": "var(--viz-1)",
  "Travel & Lodging": "var(--viz-2)",
  Entertainment: "var(--viz-3)",
  "Groceries & Essentials": "var(--viz-4)",
  Transportation: "var(--viz-5)",
  Other: "var(--viz-6)",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_COLOR);

const BAR_W = 24;
const GAP = 2;
const BAND = 56;
const CHART_H = 220;
const PAD_L = 56;
const PAD_B = 28;
const PAD_T = 16;

/** Round up to a clean axis max: nearest 10/20/50/100/... above the data max. */
function niceMax(max: number) {
  if (max <= 0) return 100;
  const mag = 10 ** Math.floor(Math.log10(max));
  const steps = [1, 2, 5, 10];
  for (const s of steps) {
    if (max <= s * mag) return s * mag;
  }
  return 10 * mag;
}
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : `${Math.round(n)}`);

export function TrendsChart({ months }: { months: MonthBucket[] }) {
  const [tip, setTip] = useState<{ month: MonthBucket; x: number; y: number } | null>(null);
  const [table, setTable] = useState(false);

  const present = CATEGORY_ORDER.filter((c) => months.some((m) => m.segments.some((s) => s.category === c && s.value > 0)));
  const max = niceMax(Math.max(...months.map((m) => m.total), 0));
  const innerH = CHART_H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + innerH - (v / max) * innerH;
  const width = PAD_L + months.length * BAND + 16;
  const ticks = [0, max / 4, max / 2, (max * 3) / 4, max];

  return (
    <div className="viz-root">
      <div className="viz-head">
        <h3>Spending by month</h3>
        <button className="link quiet" onClick={() => setTable((t) => !t)}>{table ? "View as chart" : "View as table"}</button>
      </div>

      {table ? (
        <table className="viz-table">
          <thead>
            <tr><th>Month</th><th>Category</th><th>Amount</th></tr>
          </thead>
          <tbody>
            {months.flatMap((m) =>
              m.segments
                .filter((s) => s.value > 0)
                .map((s) => (
                  <tr key={`${m.key}-${s.category}`}>
                    <td>{m.label}</td>
                    <td>{s.category}</td>
                    <td>{money(s.value)}</td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      ) : (
        <>
          <svg viewBox={`0 0 ${width} ${CHART_H}`} width="100%" height={CHART_H} role="img" aria-label="Spending by month, broken down by category">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD_L} x2={width - 8} y1={y(t)} y2={y(t)} className="viz-grid" />
                <text x={PAD_L - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" className="viz-axis">
                  ${compact(t)}
                </text>
              </g>
            ))}
            <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={CHART_H - PAD_B} className="viz-baseline" />
            <line x1={PAD_L} x2={width - 8} y1={CHART_H - PAD_B} y2={CHART_H - PAD_B} className="viz-baseline" />

            {months.map((m, i) => {
              const cx = PAD_L + i * BAND + BAND / 2;
              const segs = m.segments.filter((s) => s.value > 0);
              let acc = 0;
              const focused = tip?.month.key === m.key;
              return (
                <g
                  key={m.key}
                  tabIndex={0}
                  role="group"
                  aria-label={`${m.label}, total ${money(m.total)}`}
                  className="viz-bargroup"
                  onPointerMove={(e) => setTip({ month: m, x: e.clientX, y: e.clientY })}
                  onPointerLeave={() => setTip(null)}
                  onFocus={(e) => {
                    const r = (e.target as SVGElement).getBoundingClientRect();
                    setTip({ month: m, x: r.left + r.width / 2, y: r.top });
                  }}
                  onBlur={() => setTip(null)}
                >
                  <rect x={cx - BAR_W / 2 - 10} y={PAD_T} width={BAR_W + 20} height={innerH} fill="transparent" />
                  {segs.map((s, si) => {
                    const h = Math.max(0, (s.value / max) * innerH - (si < segs.length - 1 ? GAP : 0));
                    const top = y(acc + s.value);
                    acc += s.value;
                    const isTop = si === segs.length - 1;
                    return (
                      <rect
                        key={s.category}
                        x={cx - BAR_W / 2}
                        y={top}
                        width={BAR_W}
                        height={h}
                        fill={CATEGORY_COLOR[s.category]}
                        opacity={focused ? 1 : 0.92}
                        rx={isTop ? 4 : 0}
                        ry={isTop ? 4 : 0}
                      />
                    );
                  })}
                  <text x={cx} y={CHART_H - PAD_B + 16} textAnchor="middle" className="viz-axis">
                    {m.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {present.length > 0 && (
            <div className="viz-legend">
              {present.map((c) => (
                <span className="viz-legend-item" key={c}>
                  <span className="viz-swatch" style={{ background: CATEGORY_COLOR[c] }} />
                  {c}
                </span>
              ))}
            </div>
          )}

          {tip && (
            <div className="viz-tooltip" style={{ left: tip.x + 12, top: tip.y - 8 }} role="status">
              <strong>{tip.month.label}</strong>
              <span className="viz-tooltip-total">{money(tip.month.total)} total</span>
              {tip.month.segments
                .filter((s) => s.value > 0)
                .map((s) => (
                  <span className="viz-tooltip-row" key={s.category}>
                    <span className="viz-swatch" style={{ background: CATEGORY_COLOR[s.category] }} />
                    {s.category}: <strong>{money(s.value)}</strong>
                  </span>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
