'use client';

import { useRef, useState } from 'react';
import { wonC } from '@/lib/format';

export interface Point { k: string; full?: string; v: number; sub?: string }
export interface BarRow { k: string; v: number; sub?: string }

/** 축 눈금을 1/2/2.5/5/10 배수로 떨어뜨린다. */
function niceStep(max: number) {
  const raw = (max || 1) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const nz = raw / mag;
  return (nz <= 1 ? 1 : nz <= 2 ? 2 : nz <= 2.5 ? 2.5 : nz <= 5 ? 5 : 10) * mag;
}

/* ---------------------------------------------------------------- 면적 차트 */
export function AreaChart({
  data, height = 190, fmt = wonC, label = '',
}: {
  data: Point[];
  height?: number;
  fmt?: (n: number) => string;
  label?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (data.length < 2) {
    return <div className="empty">표시할 데이터가 아직 없습니다.</div>;
  }

  const W = 760;
  const H = height;
  const [pt, pr, pb, pl] = [12, 54, 26, 46];
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const max = Math.max(...data.map((d) => d.v)) || 1;
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step || 1;
  const ticks = Math.round(top / step);

  const X = (i: number) => pl + (i * iw) / (data.length - 1);
  const Y = (v: number) => pt + ih - (v / top) * ih;

  const dLine = data.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(d.v).toFixed(1)}`).join(' ');
  const li = data.length - 1;
  const hd = hover != null ? data[hover] : null;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) * W) / r.width;
    const i = Math.max(0, Math.min(data.length - 1, Math.round((px - pl) / (iw / (data.length - 1)))));
    setHover(i);
  };

  return (
    <div className="chart-wrap">
      {hd && hover != null && (
        <div
          className="tip on"
          style={{
            left: `calc(${((X(hover) / W) * 100).toFixed(2)}% - 52px)`,
            top: `${((Y(hd.v) / H) * 100).toFixed(2)}%`,
            transform: 'translateY(-46px)',
          }}
        >
          <i>{hd.full || hd.k}</i>
          <br />
          <b>{fmt(hd.v)}</b>
          {hd.sub && <i> {hd.sub}</i>}
        </div>
      )}
      <svg ref={svgRef} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = step * i;
          return (
            <g key={i}>
              <line x1={pl} x2={pl + iw} y1={Y(v)} y2={Y(v)} stroke="#E4DED4" strokeWidth={1} />
              <text x={pl - 8} y={Y(v) + 4} textAnchor="end" fill="#7A736A" fontSize={10.5}
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(v)}
              </text>
            </g>
          );
        })}

        <path d={`${dLine} L${X(li).toFixed(1)},${Y(0)} L${X(0).toFixed(1)},${Y(0)} Z`}
              fill="var(--red)" fillOpacity={0.1} />
        <path d={dLine} fill="none" stroke="var(--red)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) =>
          i % 2 && i !== li ? null : (
            <text key={i} x={X(i)} y={H - 8} textAnchor="middle" fill="#A79E93" fontSize={10}
                  style={{ fontVariantNumeric: 'tabular-nums' }}>
              {d.k}
            </text>
          ),
        )}

        <circle cx={X(li)} cy={Y(data[li].v)} r={5} fill="var(--red)" stroke="#fff" strokeWidth={2} />
        <text x={X(li) + 9} y={Y(data[li].v) + 4} fill="#16130F" fontSize={11.5} fontWeight={700}>
          {fmt(data[li].v)}
        </text>

        {hover != null && (
          <>
            <line x1={X(hover)} x2={X(hover)} y1={pt} y2={pt + ih} stroke="#16130F" strokeWidth={1} opacity={0.18} />
            <circle cx={X(hover)} cy={Y(data[hover].v)} r={4.5} fill="var(--red)" stroke="#fff" strokeWidth={2} />
          </>
        )}

        <rect x={0} y={0} width={W} height={H} fill="transparent"
              onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
    </div>
  );
}

/* ---------------------------------------------------------------- 가로 막대 */
export function BarChart({
  rows, fmt = wonC, labelW = 96, label = '',
}: {
  rows: BarRow[];
  fmt?: (n: number) => string;
  labelW?: number;
  label?: string;
}) {
  if (rows.length === 0) return <div className="empty">표시할 데이터가 아직 없습니다.</div>;

  const W = 420;
  const band = 26;
  const thick = 18;
  const pr = 74;
  const pl = labelW;
  const H = rows.length * band + 6;
  const max = Math.max(...rows.map((r) => r.v)) || 1;
  const iw = W - pl - pr;

  return (
    <div className="chart-wrap">
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {rows.map((r, i) => {
          const y = i * band + (band - thick) / 2;
          const w = Math.max(2, (r.v / max) * iw);
          const rr = Math.min(4, w);
          return (
            <g key={r.k}>
              <path
                d={`M${pl},${y} h${(w - rr).toFixed(1)} a${rr},${rr} 0 0 1 ${rr},${rr} v${thick - rr * 2} a${rr},${rr} 0 0 1 ${-rr},${rr} h${(-(w - rr)).toFixed(1)} Z`}
                fill="var(--red)"
              />
              <text x={pl - 9} y={y + thick / 2 + 4} textAnchor="end" fill="#443E36" fontSize={11.5}>
                {r.k}
              </text>
              <text x={pl + w + 8} y={y + thick / 2 + 4} fill="#16130F" fontSize={11.5} fontWeight={650}
                    style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(r.v)}
              </text>
              {r.sub && (
                <text x={W - 4} y={y + thick / 2 + 4} textAnchor="end" fill="#A79E93" fontSize={10.5}>
                  {r.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
