/* 표시 형식 — 프로토타입의 표기 규칙을 그대로 옮겼다. */

export const n0 = (n: number) => Math.round(n || 0).toLocaleString('ko-KR');

export const won = (n: number) => n0(n) + '원';

/** 큰 금액을 억/만 단위로 줄여 쓴다. 표·KPI 처럼 폭이 좁은 곳에서 사용. */
export function wonC(n: number): string {
  const a = Math.abs(n || 0);
  const sg = n < 0 ? '-' : '';
  if (a >= 1e8) return sg + (a / 1e8).toFixed(a >= 1e9 ? 0 : 1).replace(/\.0$/, '') + '억';
  if (a >= 1e4) return sg + n0(a / 1e4) + '만';
  return sg + n0(a);
}

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export const WD = ['일', '월', '화', '수', '목', '금', '토'];

/** Asia/Seoul 기준 오늘 (YYYY-MM-DD) */
export function seoulToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function seoulNow(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const md = (s: string) => {
  const [, m, d] = s.split('-');
  return `${+m}/${+d}`;
};

export function dayAdd(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(iso: string): string {
  return WD[new Date(iso + 'T00:00:00Z').getUTCDay()];
}

/** 타임스탬프 → 'HH:MM:SS' (서울) */
export const hms = (ts: string | Date) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(ts));

/** 타임스탬프 → 'HH:MM' (서울) */
export const hm = (ts: string | Date) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ts));

/** 타임스탬프 → 'M/D HH:MM' (서울) */
export const dateTime = (ts: string | Date) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(ts));

export function relative(ts: string | Date): string {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

/** 개월 수 → '3년 2개월' */
export function monthsKo(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return (y ? `${y}년 ` : '') + `${m}개월`;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 목록 → 'A, B 외 3' */
export function summarize(list: string[], keep = 2): string {
  if (list.length <= keep) return list.join(', ');
  return `${list.slice(0, keep).join(', ')} 외 ${list.length - keep}`;
}
