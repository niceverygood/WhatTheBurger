import type { ReactNode } from 'react';
import { STAGE_KO, type OrderStage } from '@/lib/types';

export type State = 'ok' | 'warn' | 'crit' | 'idle';

/* 색만으로 의미를 전달하지 않도록 상태 배지는 항상 아이콘 + 라벨을 함께 낸다. */
export function StateIcon({ state }: { state: State | 'up' | 'dn' }) {
  switch (state) {
    case 'ok':
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8.5l3.2 3.2L13 5" />
        </svg>
      );
    case 'warn':
      return (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M8 3.5v5.2" /><path d="M8 12.2v.1" />
        </svg>
      );
    case 'crit':
      return (
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1.6l6.6 11.6H1.4L8 1.6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M7.2 5.8h1.6v3.6H7.2zM7.2 10.6h1.6v1.5H7.2z" />
        </svg>
      );
    case 'up':
      return <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor"><path d="M6 2l4 5H2z" /></svg>;
    case 'dn':
      return <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor"><path d="M6 10L2 5h8z" /></svg>;
    default:
      return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="8" r="5.2" /></svg>;
  }
}

export function Pill({ state, label }: { state: State; label: string }) {
  return (
    <span className={`badge b-${state}`}>
      <StateIcon state={state} />
      {label}
    </span>
  );
}

const STAGE_COLOR: Partial<Record<OrderStage, string>> = {
  received: '#A79E93',
  approved: '#C98A05',
  picking: '#C6202C',
  shipped: '#A81823',
  delivering: '#8E1119',
};

export function StageBadge({ stage }: { stage: OrderStage }) {
  if (stage === 'done') return <Pill state="ok" label="완료" />;
  if (stage === 'hold') return <Pill state="crit" label="보류" />;
  if (stage === 'canceled') return <Pill state="idle" label="취소" />;
  return (
    <span className="badge b-idle">
      <svg viewBox="0 0 12 12" fill={STAGE_COLOR[stage] ?? '#A79E93'}>
        <circle cx="6" cy="6" r="3.4" />
      </svg>
      {STAGE_KO[stage]}
    </span>
  );
}

/* ---------------- KPI ---------------- */
export function Kpi({
  label, value, unit, delta, foot, spark,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  delta?: { good: boolean; text: string; vs: string };
  foot?: ReactNode;
  spark?: number[];
}) {
  return (
    <div className="card kpi">
      <div className="kpi-l">{label}</div>
      <div className="kpi-v">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {delta ? (
        <div className="kpi-d">
          <span className={delta.good ? 'd-up' : 'd-dn'}>
            <StateIcon state={delta.good ? 'up' : 'dn'} /> <b>{delta.text}</b>
          </span>{' '}
          {delta.vs}
        </div>
      ) : (
        <div className="kpi-d">{foot ?? ''}</div>
      )}
      {spark && spark.length > 1 && <Spark values={spark} w={66} h={26} />}
    </div>
  );
}

export function Spark({ values, w, h }: { values: number[]; w: number; h: number }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const rg = max - min || 1;
  const X = (i: number) => (i * w) / (values.length - 1);
  const Y = (v: number) => h - ((v - min) / rg) * (h - 3) - 1.5;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const n = values.length;
  return (
    <svg className="kpi-spark" width={w} height={h} aria-hidden="true">
      <path d={d} fill="none" stroke="#D3CBBE" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <path
        d={`M${X(n - 2).toFixed(1)},${Y(values[n - 2]).toFixed(1)} L${X(n - 1).toFixed(1)},${Y(values[n - 1]).toFixed(1)}`}
        fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round"
      />
      <circle cx={X(n - 1).toFixed(1)} cy={Y(values[n - 1]).toFixed(1)} r="2.6" fill="var(--red)" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

/* ---------------- 카드 ---------------- */
export function Card({
  title, sub, aside, children, style,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section className="card" style={style}>
      {(title || sub || aside) && (
        <div className="card-h">
          {title && <h2 className="card-t">{title}</h2>}
          {sub && <span className="card-s">{sub}</span>}
          {aside && <span className="card-a">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/* ---------------- 재고 게이지 ---------------- */
export function Meter({ ratio, state }: { ratio: number; state: State }) {
  const w = Math.min(100, Math.max(2, Math.round(ratio * 100)));
  return (
    <div className={`meter m-${state === 'idle' ? 'ok' : state}`} aria-hidden="true">
      <span style={{ width: `${w}%` }} />
    </div>
  );
}
