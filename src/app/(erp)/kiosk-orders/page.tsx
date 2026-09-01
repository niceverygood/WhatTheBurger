import type { Metadata } from 'next';
import { requireSession, scopeStoreId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import { Card, Empty, Kpi, Pill } from '@/components/ui';
import { dateTime, n0, won } from '@/lib/format';

export const metadata: Metadata = { title: '키오스크 주문 내역 · 왓더버거 ERP' };
export const dynamic = 'force-dynamic';

interface OrderLine {
  menu_name: string;
  qty: number;
  unit_price: number;
  amount: number;
}

interface KioskOrder {
  id: string;
  order_no: string;
  total: number;
  item_count: number;
  status: string;
  order_type: string;
  paid_at: string;
  store: { code: string; name: string } | null;
  lines: OrderLine[];
}

export default async function KioskOrdersPage() {
  const session = await requireSession();
  const storeId = scopeStoreId(session);
  const supabase = await createClient();

  let ordersQuery = supabase
    .from('kiosk_orders')
    .select(`
      id, order_no, total, item_count, status, order_type, paid_at,
      store:stores(code, name),
      lines:kiosk_order_lines(menu_name, qty, unit_price, amount)
    `)
    .order('paid_at', { ascending: false })
    .limit(100);
  if (storeId) ordersQuery = ordersQuery.eq('store_id', storeId);

  const [ordersRes, summaryRes] = await Promise.all([
    ordersQuery,
    supabase.rpc('dashboard_summary', { p_store: storeId }),
  ]);

  const orders = (ordersRes.data ?? []) as unknown as KioskOrder[];
  const summary = (summaryRes.data ?? {}) as {
    kiosk_today?: { sales: number; cnt: number; avg: number };
  };
  const today = summary.kiosk_today ?? { sales: 0, cnt: 0, avg: 0 };

  return (
    <>
      <Topbar
        crumb="키오스크"
        title="주문 내역"
        sub={session.isHQ ? '전 지점 키오스크 결제 주문' : `${session.store?.name ?? ''} 키오스크 결제 주문`}
        name={session.profile.full_name}
        role={session.profile.role}
      />

      <div className="view">
        <div className="kpis">
          <Kpi label="오늘 결제" value={n0(today.cnt)} unit="건" />
          <Kpi label="오늘 매출" value={won(today.sales)} />
          <Kpi label="오늘 객단가" value={won(today.avg)} />
          <Kpi label="조회된 주문" value={n0(orders.length)} unit="건" foot="최근 100건 기준" />
        </div>

        <Card
          title="키오스크 결제 주문"
          sub="최신 결제 순"
          aside={<Pill state="ok" label="Supabase 실데이터" />}
        >
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>주문번호</th>
                  {session.isHQ && <th>지점</th>}
                  <th>결제 시각</th>
                  <th>유형</th>
                  <th>메뉴</th>
                  <th style={{ textAlign: 'right' }}>금액</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <span className="code" style={{ color: 'var(--ink)', fontWeight: 700 }}>{order.order_no}</span>
                      <div style={{ marginTop: 4 }}><Pill state="ok" label="결제 완료" /></div>
                    </td>
                    {session.isHQ && (
                      <td>
                        <div>{order.store?.name ?? '—'}</div>
                        <div className="code t-mute" style={{ marginTop: 2 }}>{order.store?.code ?? ''}</div>
                      </td>
                    )}
                    <td className="num t-mute" style={{ whiteSpace: 'nowrap' }}>{dateTime(order.paid_at)}</td>
                    <td>{order.order_type === 'takeout' ? '포장' : '매장'}</td>
                    <td>
                      <details className="kiosk-order-detail">
                        <summary>{n0(order.item_count)}개 · 상세보기</summary>
                        <div className="kod-lines">
                          {order.lines.map((line) => (
                            <div className="kod-line" key={`${line.menu_name}-${line.unit_price}`}>
                              <span>{line.menu_name} × {n0(line.qty)}</span>
                              <b>{won(line.amount)}</b>
                            </div>
                          ))}
                        </div>
                      </details>
                    </td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{won(order.total)}</td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={session.isHQ ? 6 : 5}>
                      <Empty>아직 키오스크 결제 주문이 없습니다.</Empty>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
