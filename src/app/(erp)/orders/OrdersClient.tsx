'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Card, Empty, StageBadge } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { dateTime, n0, won, wonC } from '@/lib/format';
import { SOURCE_KO, STAGES, STAGE_KO, type OrderSource, type OrderStage } from '@/lib/types';
import { advanceStage } from './actions';
import NewOrderModal, { type ItemOpt } from './NewOrderModal';

export interface OrderRow {
  id: string;
  order_no: string;
  store_id: string;
  stage: OrderStage;
  source: OrderSource;
  is_urgent: boolean;
  ordered_at: string;
  ordered_ts: string;
  due_date: string | null;
  total_amount: number;
  memo: string | null;
  line_count: number;
  store: { code: string; name: string; sido: string } | null;
}

export interface StoreOpt { id: string; code: string; name: string }

const PIPELINE: OrderStage[] = ['received', 'approved', 'picking', 'shipped', 'delivering', 'done'];
const STAGE_DOT: Record<string, string> = {
  received: '#A79E93', approved: '#C98A05', picking: '#C6202C',
  shipped: '#A81823', delivering: '#8E1119', done: '#1F6B3B',
};

export default function OrdersClient({
  rows, stores, items, isHQ, myStoreId, total, page, pageSize, filters,
}: {
  rows: OrderRow[];
  stores: StoreOpt[];
  items: ItemOpt[];
  isHQ: boolean;
  myStoreId: string | null;
  total: number;
  page: number;
  pageSize: number;
  filters: { stage: string; store: string; q: string; source: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [view, setView] = useState<'rail' | 'table'>('rail');

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    router.push(`/orders?${next.toString()}`);
  };

  const move = (id: string, stage: OrderStage) => {
    startTransition(async () => {
      const r = await advanceStage(id, stage);
      toast(r.error ?? r.message ?? '', r.ok ? 'ok' : 'err');
      if (r.ok) router.refresh();
    });
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const byStage = (k: OrderStage) => rows.filter((o) => o.stage === k);

  return (
    <>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="stage">단계</label>
          <select id="stage" className="ctl" value={filters.stage} onChange={(e) => setParam('stage', e.target.value)}>
            <option value="open">진행 중</option>
            <option value="">전체</option>
            {STAGES.map((s) => (
              <option key={s.k} value={s.k}>{s.ko}</option>
            ))}
          </select>
        </div>

        {isHQ && (
          <div className="field">
            <label htmlFor="store">지점</label>
            <select id="store" className="ctl" style={{ maxWidth: 180 }}
                    value={filters.store} onChange={(e) => setParam('store', e.target.value)}>
              <option value="">전체 지점</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="source">유형</label>
          <select id="source" className="ctl" value={filters.source} onChange={(e) => setParam('source', e.target.value)}>
            <option value="">전체</option>
            <option value="manual">수기 등록</option>
            <option value="kiosk_auto">키오스크 자동</option>
            <option value="ai_replenish">AI 보충</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="q">검색</label>
          <input
            id="q" className="ctl" style={{ width: 170 }} defaultValue={filters.q}
            placeholder="발주번호 · 지점"
            onKeyDown={(e) => {
              if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value.trim());
            }}
          />
        </div>

        <span className="spacer" />

        <div className="seg" style={{ width: 150 }}>
          <button type="button" aria-pressed={view === 'rail'} onClick={() => setView('rail')}>파이프라인</button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>목록</button>
        </div>

        <NewOrderModal
          stores={stores}
          items={items}
          isHQ={isHQ}
          myStoreId={myStoreId}
          onCreated={(no) => {
            toast(`발주 ${no} 를 등록했습니다.`, 'ok');
            router.refresh();
          }}
        />
      </div>

      {view === 'rail' ? (
        <div className="rail">
          {PIPELINE.map((k) => {
            const list = byStage(k);
            const sum = list.reduce((a, b) => a + b.total_amount, 0);
            return (
              <div className="rail-col" key={k}>
                <div className="rail-h">
                  <span className="dot" style={{ background: STAGE_DOT[k] }} />
                  <span className="nm">{STAGE_KO[k]}</span>
                  <span className="ct">{list.length}</span>
                </div>
                <div className="rail-body">
                  {list.map((o) => (
                    <Link className="ticket" href={`/orders/${o.id}`} key={o.id}>
                      {o.is_urgent && <span className="tk-flag" />}
                      <div className="tk-no">{o.order_no}</div>
                      <div className="tk-store">{isHQ ? o.store?.name ?? '—' : `${o.line_count}개 품목`}</div>
                      <div className="tk-meta">
                        <span>{o.line_count}품목</span>
                        <span className="tk-amt">{wonC(o.total_amount)}</span>
                      </div>
                      {o.source !== 'manual' && (
                        <div style={{ fontSize: 10.5, color: 'var(--red)', marginTop: 4 }}>
                          {SOURCE_KO[o.source]}
                        </div>
                      )}
                    </Link>
                  ))}
                  {list.length === 0 && <div className="rail-empty">없음</div>}
                </div>
                {list.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--ink-4)', padding: '8px 2px 0', fontVariantNumeric: 'tabular-nums' }}>
                    {wonC(sum)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Card title="발주 목록" sub={`${n0(total)}건`}>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>발주번호</th>
                  {isHQ && <th>지점</th>}
                  <th>등록</th>
                  <th>납기</th>
                  <th>품목</th>
                  <th style={{ textAlign: 'right' }}>금액</th>
                  <th>단계</th>
                  <th style={{ textAlign: 'right' }}>처리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}`} className="code" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                        {o.order_no}
                      </Link>
                      {o.is_urgent && <span className="badge b-crit" style={{ marginLeft: 6 }}>긴급</span>}
                      {o.source !== 'manual' && (
                        <div style={{ fontSize: 10.5, color: 'var(--red)' }}>{SOURCE_KO[o.source]}</div>
                      )}
                    </td>
                    {isHQ && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span className="code t-mute">{o.store?.code}</span> {o.store?.name}
                      </td>
                    )}
                    <td className="num t-mute">{dateTime(o.ordered_ts)}</td>
                    <td className="num t-mute">{o.due_date ?? '—'}</td>
                    <td className="num">{o.line_count}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{won(o.total_amount)}</td>
                    <td><StageBadge stage={o.stage} /></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {isHQ && o.stage === 'received' && (
                        <button type="button" className="btn btn-sm" onClick={() => move(o.id, 'approved')}>
                          승인
                        </button>
                      )}
                      {isHQ && o.stage === 'delivering' && (
                        <button type="button" className="btn btn-sm" onClick={() => move(o.id, 'done')}>
                          납품확인
                        </button>
                      )}
                      <Link className="btn btn-sm" href={`/orders/${o.id}`} style={{ marginLeft: 6 }}>상세</Link>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={isHQ ? 8 : 7}><Empty>조건에 맞는 발주가 없습니다.</Empty></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <span>{n0(total)}건 · {page}/{pages} 페이지</span>
            <span className="spacer" />
            <button type="button" className="btn btn-sm" disabled={page <= 1}
                    onClick={() => setParam('page', String(page - 1))}>
              이전
            </button>
            <button type="button" className="btn btn-sm" disabled={page >= pages}
                    onClick={() => setParam('page', String(page + 1))}>
              다음
            </button>
          </div>
        </Card>
      )}
    </>
  );
}
