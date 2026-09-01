'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { n0 } from '@/lib/format';

interface KioskOrderRow {
  id: string;
  order_no: string;
  store_id: string;
  total: number;
  item_count: number;
  order_type: 'dine_in' | 'takeout';
  paid_at: string;
}

interface PopupOrder extends KioskOrderRow {
  store_name: string;
}

interface KioskOrderWithStore extends KioskOrderRow {
  store: { name: string } | null;
}

/** ERP 어느 화면에서든 새 키오스크 결제를 알려 주는 전역 Realtime 팝업. */
export default function KioskOrderPopup({
  storeId,
  storeName,
}: {
  storeId: string | null;
  storeName: string | null;
}) {
  const [orders, setOrders] = useState<PopupOrder[]>([]);
  const seen = useRef(new Set<string>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const filter = storeId ? `store_id=eq.${storeId}` : undefined;
    const channel = supabase
      .channel(`erp-kiosk-popup-${storeId ?? 'hq'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'kiosk_orders', ...(filter ? { filter } : {}) },
        async (payload) => {
          const event = payload.new as Partial<KioskOrderRow>;
          if (!event.id || seen.current.has(event.id)) return;

          // Realtime은 새 주문 신호로만 사용하고, 표시 데이터는 RLS를 거쳐 다시 읽는다.
          // 네트워크 재연결 직후 부분 payload가 오더라도 0원 알림이 뜨지 않게 한다.
          const { data } = await supabase
            .from('kiosk_orders')
            .select('id, order_no, store_id, total, item_count, order_type, paid_at, store:stores(name)')
            .eq('id', event.id)
            .maybeSingle();
          if (!data) return;

          const order = data as unknown as KioskOrderWithStore;
          seen.current.add(order.id);

          setOrders((current) => [
            { ...order, store_name: order.store?.name ?? storeName ?? '키오스크' },
            ...current,
          ].slice(0, 3));

          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => router.refresh(), 1_200);
        },
      )
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [router, storeId, storeName]);

  const dismiss = (id: string) => {
    setOrders((current) => current.filter((item) => item.id !== id));
  };

  return (
    <div className="kiosk-order-popups" aria-live="assertive" aria-label="새 키오스크 주문 알림">
      {orders.map((order) => (
        <article className="kiosk-order-popup" key={order.id}>
          <div className="kop-icon" aria-hidden="true">✓</div>
          <div className="kop-body">
            <div className="kop-label">키오스크 결제 완료</div>
            <div className="kop-title">
              {order.store_name} · <span className="code">{order.order_no}</span>
            </div>
            <div className="kop-meta">
              {order.order_type === 'takeout' ? '포장' : '매장'} · {n0(order.item_count)}개 ·{' '}
              <b>{n0(order.total)}원</b>
            </div>
            <Link className="kop-link" href="/kiosk-orders">주문 확인하기 →</Link>
          </div>
          <button className="kop-close" type="button" onClick={() => dismiss(order.id)} aria-label="알림 닫기">
            ×
          </button>
        </article>
      ))}
    </div>
  );
}
