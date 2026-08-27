'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { hms, n0 } from '@/lib/format';
import { STAGE_KO, type OrderStage } from '@/lib/types';

interface Entry {
  id: string;
  kind: '' | 'ok' | 'warn' | 'crit' | 'ai';
  time: string;
  store: string | null;
  body: ReactNode;
}

interface KioskRow {
  id: string; order_no: string; store_id: string; total: number; item_count: number; paid_at: string;
}
interface OrderRow {
  id: string; order_no: string; store_id: string; source: string; total_amount: number; stage: OrderStage;
}

/**
 * 키오스크 판매와 자동발주를 실시간으로 받아 보여 준다.
 * Supabase Realtime 은 RLS 를 그대로 적용하므로, 지점관리자에게는
 * 본인 지점 이벤트만 도착한다.
 */
export default function LiveTicker({ storeId, isHQ }: { storeId: string | null; isHQ: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [live, setLive] = useState(false);
  const router = useRouter();
  const names = useRef<Map<string, string>>(new Map());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // 지점 이름은 한 번만 읽어 캐시해 둔다(이벤트마다 조회하지 않기 위해).
    supabase.from('stores').select('id, name').then(({ data }) => {
      (data ?? []).forEach((s: { id: string; name: string }) => names.current.set(s.id, s.name));
    });

    const add = (e: Omit<Entry, 'id'>) =>
      setEntries((v) => [{ ...e, id: `${Date.now()}-${Math.random()}` }, ...v].slice(0, 40));

    // 화면 숫자가 어긋나지 않게 잠깐 모아서 한 번만 새로 고친다.
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 1500);
    };

    const storeName = (id: string) => (isHQ ? names.current.get(id) ?? null : null);
    const filter = storeId ? `store_id=eq.${storeId}` : undefined;

    const channel = supabase
      .channel('erp-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'kiosk_orders', ...(filter ? { filter } : {}) },
        (payload) => {
          const r = payload.new as KioskRow;
          add({
            kind: 'ok',
            time: hms(r.paid_at),
            store: storeName(r.store_id),
            body: (
              <>
                키오스크 <b>{r.order_no}</b> 결제 · {r.item_count}개 · <b>{n0(r.total)}원</b>
              </>
            ),
          });
          scheduleRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'purchase_orders', ...(filter ? { filter } : {}) },
        (payload) => {
          const r = payload.new as OrderRow;
          const auto = r.source === 'kiosk_auto';
          add({
            kind: auto ? 'ai' : '',
            time: hms(new Date()),
            store: storeName(r.store_id),
            body: auto ? (
              <>
                안전재고 미달 → 자동발주 <b>{r.order_no}</b> 생성
              </>
            ) : (
              <>
                발주 <b>{r.order_no}</b> 접수 · <b>{n0(r.total_amount)}원</b>
              </>
            ),
          });
          scheduleRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'purchase_orders', ...(filter ? { filter } : {}) },
        (payload) => {
          const before = payload.old as Partial<OrderRow>;
          const after = payload.new as OrderRow;
          if (before?.stage === after.stage) return;
          add({
            kind: after.stage === 'done' ? 'ok' : after.stage === 'hold' ? 'crit' : '',
            time: hms(new Date()),
            store: storeName(after.store_id),
            body: (
              <>
                발주 <b>{after.order_no}</b> → <b>{STAGE_KO[after.stage] ?? after.stage}</b>
              </>
            ),
          });
          scheduleRefresh();
        },
      )
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [storeId, isHQ, router]);

  return (
    <section className="card">
      <div className="card-h">
        <h2 className="card-t">실시간 이벤트</h2>
        <span className="card-s">키오스크 판매 · 발주 단계 변화</span>
        <span className="card-a">
          <span className="live-chip">
            <span className={`live-dot ${live ? '' : 'off'}`} />
            {live ? '연결됨' : '연결 대기'}
          </span>
        </span>
      </div>
      <div className="log-b" style={{ maxHeight: 260 }}>
        {entries.length === 0 ? (
          <div className="log-empty">
            아직 들어온 이벤트가 없습니다.
            <br />
            키오스크에서 결제가 일어나면 여기에 바로 기록됩니다.
          </div>
        ) : (
          entries.map((e) => (
            <div className={`log-i ${e.kind}`} key={e.id}>
              <div className="tm">{e.time}</div>
              <div className="tx">
                {e.store && (
                  <>
                    <b>{e.store}</b>{' '}
                  </>
                )}
                {e.body}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
