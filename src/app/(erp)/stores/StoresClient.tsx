'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card, Empty, Pill } from '@/components/ui';
import { n0, wonC } from '@/lib/format';
import { GRADE_KO, STORE_STATUS_KO, type StoreGrade, type StoreStatus } from '@/lib/types';
import StoreForm from './StoreForm';

export interface StoreRow {
  id: string; code: string; name: string; sido: string; district: string | null;
  grade: StoreGrade; status: StoreStatus; manager_name: string | null; tel: string | null;
  opened_at: string | null; credit_limit: number; kiosk_enabled: boolean;
  route: { id: string; name: string } | null;
  manager: { full_name: string; email: string }[] | null;
  settlement: { carry_amount: number; mtd_amount: number; overdue_days: number }[] | null;
}

export interface RouteOpt { id: string; name: string }

export default function StoresClient({ rows, routes }: { rows: StoreRow[]; routes: RouteOpt[] }) {
  const [sido, setSido] = useState('전체');
  const [status, setStatus] = useState('전체');
  const [q, setQ] = useState('');

  const sidos = useMemo(() => ['전체', ...Array.from(new Set(rows.map((r) => r.sido)))], [rows]);

  const filtered = rows.filter((r) => {
    if (sido !== '전체' && r.sido !== sido) return false;
    if (status !== '전체' && STORE_STATUS_KO[r.status] !== status) return false;
    if (!q) return true;
    const hay = `${r.code} ${r.name} ${r.manager_name ?? ''} ${r.manager?.[0]?.full_name ?? ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="s-sido">지역</label>
          <select id="s-sido" className="ctl" value={sido} onChange={(e) => setSido(e.target.value)}>
            {sidos.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="s-status">상태</label>
          <select id="s-status" className="ctl" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>전체</option><option>운영중</option><option>휴점</option><option>폐점</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="s-q">검색</label>
          <input id="s-q" className="ctl" style={{ width: 190 }} value={q}
                 onChange={(e) => setQ(e.target.value)} placeholder="코드 · 지점명 · 담당자" />
        </div>
        <span className="spacer" />
        <StoreForm routes={routes} />
      </div>

      <Card title="가맹점 목록" sub={`${filtered.length}개점`}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>코드</th>
                <th>지점</th>
                <th>지역 · 노선</th>
                <th>구분</th>
                <th>ERP 담당자</th>
                <th style={{ textAlign: 'right' }}>여신한도</th>
                <th style={{ textAlign: 'right' }}>미수금</th>
                <th>키오스크</th>
                <th>상태</th>
                <th style={{ textAlign: 'right' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const se = r.settlement?.[0];
                const ar = (se?.carry_amount ?? 0) + (se?.mtd_amount ?? 0);
                const mgr = r.manager?.[0];
                return (
                  <tr key={r.id}>
                    <td className="code t-mute">{r.code}</td>
                    <td>
                      <b>{r.name}</b>
                      {r.tel && <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{r.tel}</div>}
                    </td>
                    <td className="t-mute">
                      {r.sido}
                      <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{r.route?.name ?? '노선 미지정'}</div>
                    </td>
                    <td className="t-mute">{GRADE_KO[r.grade]}</td>
                    <td>
                      {mgr ? (
                        <>
                          {mgr.full_name}
                          <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{mgr.email}</div>
                        </>
                      ) : (
                        <span className="badge b-warn">담당자 미지정</span>
                      )}
                    </td>
                    <td className="num t-mute" style={{ textAlign: 'right' }}>{wonC(r.credit_limit)}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: ar > 0 ? 600 : 400 }}>
                      {ar > 0 ? wonC(ar) : '—'}
                      {(se?.overdue_days ?? 0) > 0 && (
                        <div style={{ fontSize: 10.5, color: 'var(--crit)' }}>연체 {se!.overdue_days}일</div>
                      )}
                    </td>
                    <td>
                      {r.kiosk_enabled
                        ? <Pill state="ok" label="사용" />
                        : <Pill state="idle" label="중지" />}
                    </td>
                    <td>
                      {r.status === 'operating'
                        ? <Pill state="ok" label="운영중" />
                        : r.status === 'suspended'
                          ? <Pill state="warn" label="휴점" />
                          : <Pill state="idle" label="폐점" />}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <StoreForm routes={routes} store={r} />{' '}
                      <Link className="btn btn-sm" href={`/kiosk-link?store=${r.id}`}>키오스크</Link>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10}><Empty>조건에 맞는 가맹점이 없습니다.</Empty></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>
            운영중 <b className="num">{n0(rows.filter((r) => r.status === 'operating').length)}</b>개점 · 전체{' '}
            <b className="num">{n0(rows.length)}</b>개점
          </span>
        </div>
      </Card>
    </>
  );
}
