"use client";

import { useEffect, useMemo, useState } from "react";
import { formatUnits } from "viem";
import { formatAmount, type AssetMeta } from "@/lib/format";
import type { ActivityItem } from "@/lib/hooks";

// Validated with the dataviz palette script against the white surface: lightness, chroma and 3:1 contrast pass.
const LINE = "#2E9E5B";
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

type Point = { t: number; total: bigint; step?: bigint };

const fmtTime = (t: number) =>
  new Date(t * 1000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Cumulative contributions over time for one campaign (single series → no legend; the title names it).
 * Step line because the total only changes at each contribution. Goal is a dashed reference line.
 */
export function RaisedChart({
  events,
  goal,
  meta,
  start,
  end,
}: {
  events: readonly ActivityItem[];
  goal: bigint;
  meta: AssetMeta | undefined;
  start: bigint | undefined;
  end: bigint | undefined;
}) {
  // Callback-ref state: the wrapper only mounts once data is ready, so observe it whenever it appears.
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!wrap) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [wrap]);

  const points = useMemo<Point[]>(() => {
    const contribs = events
      .filter((e) => e.kind === "Contributed" && e.timestamp !== undefined)
      .slice()
      .sort((a, b) => Number(a.timestamp! - b.timestamp!) || Number(a.blockNumber - b.blockNumber));
    const out: Point[] = start !== undefined ? [{ t: Number(start), total: 0n }] : [];
    let total = 0n;
    for (const e of contribs) {
      total += e.amount ?? 0n;
      out.push({ t: Number(e.timestamp), total, step: e.amount });
    }
    return out;
  }, [events, start]);

  if (!meta || points.length === 0) return <p className="text-sm text-muted">No contributions yet.</p>;

  const dec = meta.decimals;
  const num = (v: bigint) => Number(formatUnits(v, dec)); // display-only conversion
  const t0 = points[0].t;
  const t1 = Math.max(end !== undefined ? Number(end) : t0, points[points.length - 1].t, t0 + 1);
  const yMax = Math.max(num(goal), num(points[points.length - 1].total)) * 1.12 || 1;
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - t0) / (t1 - t0)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  // Step path: horizontal to each event time, then vertical to the new total; extend to the end.
  let d = `M${x(points[0].t)},${y(num(points[0].total))}`;
  for (let i = 1; i < points.length; i++) d += ` H${x(points[i].t)} V${y(num(points[i].total))}`;
  d += ` H${x(t1)}`;

  const ticks = [0, yMax / 2 / 1.12, yMax / 1.12].map((v) => ({ v, label: formatTick(v) }));
  const goalY = y(num(goal));

  // Hover: value at pointer time = last point at or before it.
  const hoverT = hover === null ? null : t0 + ((hover - PAD.left) / innerW) * (t1 - t0);
  const at = hoverT === null ? null : [...points].reverse().find((p) => p.t <= hoverT) ?? points[0];

  return (
    <div>
      {/* w-full + overflow-hidden: the observer must measure the card, not the SVG's own width. */}
      <div ref={setWrap} className="relative w-full overflow-hidden">
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`Total contributed over time, reaching ${formatAmount(points[points.length - 1].total, dec)} ${meta.symbol} of a ${formatAmount(goal, dec)} ${meta.symbol} goal`}
          className="block touch-none"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = e.clientX - r.left;
            setHover(px >= PAD.left && px <= width - PAD.right ? px : null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((tk) => (
            <g key={tk.v}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(tk.v)} y2={y(tk.v)} stroke="#E6EAE5" strokeWidth="1" />
              <text x={PAD.left - 8} y={y(tk.v)} textAnchor="end" dominantBaseline="middle" className="fill-muted font-mono text-[11px]">
                {tk.label}
              </text>
            </g>
          ))}
          <line x1={PAD.left} x2={width - PAD.right} y1={goalY} y2={goalY} stroke="#59625A" strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={width - PAD.right} y={goalY - 6} textAnchor="end" className="fill-ink-2 text-[11px] font-semibold">
            Goal {formatAmount(goal, dec)} {meta.symbol}
          </text>
          <path d={d} fill="none" stroke={LINE} strokeWidth="2" strokeLinejoin="round" />
          {points.slice(1).map((p, i) => (
            <circle key={i} cx={x(p.t)} cy={y(num(p.total))} r="4" fill={LINE} stroke="#fff" strokeWidth="2" />
          ))}
          <text x={PAD.left} y={H - 8} className="fill-muted text-[11px]">{fmtTime(t0)}</text>
          <text x={width - PAD.right} y={H - 8} textAnchor="end" className="fill-muted text-[11px]">{fmtTime(t1)}</text>
          {hover !== null && <line x1={hover} x2={hover} y1={PAD.top} y2={PAD.top + innerH} stroke="#8A938B" strokeWidth="1" />}
        </svg>
        {hover !== null && at && (
          <div
            className="pointer-events-none absolute top-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs shadow-[0_12px_24px_-16px_rgba(0,0,0,0.4)]"
            style={{ left: Math.min(hover + 12, width - 180) }}
          >
            <div className="font-mono text-sm font-bold text-ink">
              {formatAmount(at.total, dec)} {meta.symbol}
            </div>
            <div className="text-muted">total contributed · {fmtTime(at.t)}</div>
            {at.step !== undefined && <div className="text-muted">last: +{formatAmount(at.step, dec)} {meta.symbol}</div>}
          </div>
        )}
      </div>
      <button type="button" onClick={() => setShowTable((v) => !v)} className="mt-2 text-xs font-semibold text-forest underline">
        {showTable ? "Hide data table" : "Show data table"}
      </button>
      {showTable && (
        <div className="mt-2 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-wash text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Time</th>
                <th className="px-3 py-2 font-semibold">Contribution</th>
                <th className="px-3 py-2 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {points.slice(1).map((p, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-3 py-2 text-muted">{fmtTime(p.t)}</td>
                  <td className="px-3 py-2 font-mono">+{formatAmount(p.step ?? 0n, dec)}</td>
                  <td className="px-3 py-2 font-mono">{formatAmount(p.total, dec)} {meta.symbol}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatTick(v: number): string {
  if (v === 0) return "0";
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return v >= 10 ? v.toFixed(0) : v.toFixed(v >= 1 ? 1 : 2);
}
