'use client';

import { useMemo, useState } from 'react';
import { Card, Empty, Pill } from '@/components/ui';
import { n0, pct } from '@/lib/format';
import { TEMP_KO, type TempZone } from '@/lib/types';

export interface ItemRow {
  id: string; sku: string; name: string; category: string; unit: string;
  ea_per_unit: number; price: number; cost: number; temp: TempZone; is_active: boolean;
  supplier: { name: string; lead_days: number } | null;
}

export default function ItemsClient({ rows, isHQ }: { rows: ItemRow[]; isHQ: boolean }) {
  const [cat, setCat] = useState('전체');
  const [q, setQ] = useState('');
  const [temp, setTemp] = useState('전체');

  const cats = useMemo(() => ['전체', ...Array.from(new Set(rows.map((r) => r.category)))], [rows]);

  const filtered = rows.filter((r) => {
    if (cat !== '전체' && r.category !== cat) return false;
    if (temp !== '전체' && TEMP_KO[r.temp] !== temp) return false;
    if (!q) return true;
    const hay = `${r.sku} ${r.name} ${r.supplier?.name ?? ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="i-cat">분류</label>
          <select id="i-cat" className="ctl" value={cat} onChange={(e) => setCat(e.target.value)}>
            {cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="i-temp">보관</label>
          <select id="i-temp" className="ctl" value={temp} onChange={(e) => setTemp(e.target.value)}>
            <option>전체</option><option>냉동</option><option>냉장</option><option>상온</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="i-q">검색</label>
          <input id="i-q" className="ctl" style={{ width: 190 }} value={q}
                 onChange={(e) => setQ(e.target.value)} placeholder="SKU · 품목명 · 공급사" />
        </div>
        <span className="spacer" />
        {!isHQ && (
          <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
            단가와 공급사는 본사가 관리합니다
          </span>
        )}
      </div>

      <Card title="품목 목록" sub={`${filtered.length}개 SKU`}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>품목</th>
                <th>분류</th>
                <th>보관</th>
                <th>구매단위</th>
                <th style={{ textAlign: 'right' }}>공급가</th>
                {isHQ && <th style={{ textAlign: 'right' }}>매입원가</th>}
                {isHQ && <th style={{ textAlign: 'right' }}>마진</th>}
                <th>공급사</th>
                <th style={{ textAlign: 'right' }}>리드타임</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="code t-mute">{r.sku}</td>
                  <td>{r.name}</td>
                  <td className="t-mute">{r.category}</td>
                  <td className="t-mute">{TEMP_KO[r.temp]}</td>
                  <td className="t-mute">
                    {r.unit}
                    {r.ea_per_unit > 1 && (
                      <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>
                        낱개 {n0(r.ea_per_unit)}개
                      </div>
                    )}
                  </td>
                  <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{n0(r.price)}</td>
                  {isHQ && <td className="num t-mute" style={{ textAlign: 'right' }}>{n0(r.cost)}</td>}
                  {isHQ && (
                    <td className="num" style={{ textAlign: 'right' }}>
                      {pct(r.price - r.cost, r.price)}%
                    </td>
                  )}
                  <td className="t-mute">{r.supplier?.name ?? '—'}</td>
                  <td className="num t-mute" style={{ textAlign: 'right' }}>
                    {r.supplier ? `${r.supplier.lead_days}일` : '—'}
                  </td>
                  <td>
                    {r.is_active
                      ? <Pill state="ok" label="공급중" />
                      : <Pill state="idle" label="중단" />}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isHQ ? 11 : 9}><Empty>조건에 맞는 품목이 없습니다.</Empty></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
