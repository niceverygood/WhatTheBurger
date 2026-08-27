'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Card, Empty, StageBadge } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { n0, wonC } from '@/lib/format';
import { STAGE_KO, type OrderStage } from '@/lib/types';
import { advanceMany } from '../orders/actions';

export interface ShipRow {
  id: string; order_no: string; stage: OrderStage; total_amount: number;
  is_urgent: boolean; due_date: string | null; line_count: number;
  store: { code: string; name: string; sido: string } | null;
  route: { id: string; name: string; driver_name: string | null; vehicle: string | null } | null;
}

/** 출고 파이프라인에서 다음으로 밀 수 있는 단계 */
const NEXT_OF: Partial<Record<OrderStage, OrderStage>> = {
  approved: 'picking',
  picking: 'shipped',
  shipped: 'delivering',
  delivering: 'done',
};

export default function ShippingClient({ rows }: { rows: ShipRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const routes = new Map<string, { name: string; driver: string; vehicle: string; rows: ShipRow[] }>();
  rows.forEach((r) => {
    const key = r.route?.id ?? 'none';
    if (!routes.has(key)) {
      routes.set(key, {
        name: r.route?.name ?? '노선 미지정',
        driver: r.route?.driver_name ?? '—',
        vehicle: r.route?.vehicle ?? '—',
        rows: [],
      });
    }
    routes.get(key)!.rows.push(r);
  });

  const run = (ids: string[], stage: OrderStage, label: string) => {
    if (ids.length === 0) { toast('선택된 발주가 없습니다.', 'err'); return; }
    if (!confirm(`${ids.length}건을 ${label} 상태로 옮길까요?`)) return;
    start(async () => {
      const r = await advanceMany(ids, stage, `출고 화면 일괄 처리 → ${label}`);
      toast(r.error ?? r.message ?? '', r.ok ? 'ok' : 'err');
      if (r.ok) { setPicked(new Set()); router.refresh(); }
    });
  };

  /** 선택된 건들이 모두 같은 단계일 때만 일괄 이동을 허용한다. */
  const pickedRows = rows.filter((r) => picked.has(r.id));
  const uniqueStage = new Set(pickedRows.map((r) => r.stage));
  const batchStage = uniqueStage.size === 1 ? NEXT_OF[[...uniqueStage][0]] : undefined;

  return (
    <>
      <div className="toolbar">
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
          선택 <b className="num" style={{ color: 'var(--ink)' }}>{picked.size}</b>건
        </span>
        {picked.size > 0 && uniqueStage.size > 1 && (
          <span className="badge b-warn">단계가 서로 다른 건은 함께 처리할 수 없습니다</span>
        )}
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending || !batchStage}
          onClick={() => batchStage && run([...picked], batchStage, STAGE_KO[batchStage])}
        >
          {batchStage ? `선택 ${picked.size}건 → ${STAGE_KO[batchStage]}` : '일괄 처리'}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>
          선택 해제
        </button>
      </div>

      {[...routes.entries()].map(([key, r]) => {
        const ids = r.rows.map((x) => x.id);
        const allPicked = ids.every((id) => picked.has(id));
        return (
          <div key={key} style={{ marginBottom: 14 }}>
            <Card
              title={r.name}
              sub={`${r.driver} · ${r.vehicle}`}
              aside={
                <>
                  {r.rows.length}건 · <b className="num">{wonC(r.rows.reduce((a, b) => a + b.total_amount, 0))}</b>
                </>
              }
            >
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}>
                        <input
                          type="checkbox"
                          checked={allPicked}
                          aria-label={`${r.name} 전체 선택`}
                          onChange={() =>
                            setPicked((s) => {
                              const next = new Set(s);
                              if (allPicked) ids.forEach((id) => next.delete(id));
                              else ids.forEach((id) => next.add(id));
                              return next;
                            })
                          }
                        />
                      </th>
                      <th>발주번호</th>
                      <th>지점</th>
                      <th>납기</th>
                      <th style={{ textAlign: 'right' }}>품목</th>
                      <th style={{ textAlign: 'right' }}>금액</th>
                      <th>단계</th>
                      <th style={{ textAlign: 'right' }}>처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((o) => {
                      const next = NEXT_OF[o.stage];
                      return (
                        <tr key={o.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={picked.has(o.id)}
                              onChange={() => toggle(o.id)}
                              aria-label={`${o.order_no} 선택`}
                            />
                          </td>
                          <td>
                            <Link href={`/orders/${o.id}`} className="code" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                              {o.order_no}
                            </Link>
                            {o.is_urgent && <span className="badge b-crit" style={{ marginLeft: 6 }}>긴급</span>}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className="code t-mute">{o.store?.code}</span> {o.store?.name}
                          </td>
                          <td className="num t-mute">{o.due_date ?? '—'}</td>
                          <td className="num" style={{ textAlign: 'right' }}>{o.line_count}</td>
                          <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{n0(o.total_amount)}</td>
                          <td><StageBadge stage={o.stage} /></td>
                          <td style={{ textAlign: 'right' }}>
                            {next && (
                              <button
                                type="button" className="btn btn-sm" disabled={pending}
                                onClick={() => run([o.id], next, STAGE_KO[next])}
                              >
                                {STAGE_KO[next]}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        );
      })}

      {rows.length === 0 && (
        <div className="card">
          <Empty>
            출고를 기다리는 발주가 없습니다.
            <br />
            <span style={{ fontSize: 11.5 }}>발주 관리에서 접수 건을 승인하면 이 화면에 나타납니다.</span>
          </Empty>
        </div>
      )}
    </>
  );
}
