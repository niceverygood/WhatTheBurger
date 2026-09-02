import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import LiveTicker from '@/components/LiveTicker';
import { AreaChart, BarChart, type Point } from '@/components/charts';
import { Card, Empty, Kpi, Meter, Pill, StageBadge, type State } from '@/components/ui';
import StorePicker from '../kiosk-link/StorePicker';
import { dateTime, md, n0, seoulToday, summarize, weekdayOf, won, wonC } from '@/lib/format';
import { SOURCE_KO, type OrderSource, type OrderStage } from '@/lib/types';

export const metadata: Metadata = { title: '지점 운영센터 · 왓더버거 ERP' };
export const dynamic = 'force-dynamic';

interface StoreRow {
  id: string;
  code: string;
  name: string;
  status: string;
  kiosk_token: string;
  kiosk_enabled: boolean;
  credit_limit: number;
  manager_name: string | null;
  tel: string | null;
  route: { name: string; driver_name: string | null; vehicle: string | null } | null;
}

interface Summary {
  open: { total: number; received: number; in_transit: number; urgent: number; auto: number };
  receivable: { carry: number; mtd: number; overdue_stores: number };
  kiosk_today: { sales: number; cnt: number; avg: number };
}

interface KioskOrder {
  id: string;
  order_no: string;
  total: number;
  item_count: number;
  order_type: string;
  paid_at: string;
  lines: { menu_name: string; qty: number; amount: number }[];
}

interface PurchaseOrder {
  id: string;
  order_no: string;
  stage: OrderStage;
  source: OrderSource;
  is_urgent: boolean;
  total_amount: number;
  due_date: string | null;
  ordered_ts: string;
}

interface LowStock {
  item_id: string;
  sku: string;
  item_name: string;
  category: string;
  on_hand: number;
  safety_stock: number;
  daily_usage: number;
  ratio: number | null;
}

const stockState = (ratio: number | null): State =>
  ratio == null ? 'idle' : ratio <= 0.5 ? 'crit' : ratio <= 1 ? 'warn' : 'ok';

async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function StoreDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: storeData } = await supabase
    .from('stores')
    .select('id, code, name, status, kiosk_token, kiosk_enabled, credit_limit, manager_name, tel, route:routes(name, driver_name, vehicle)')
    .eq('status', 'operating')
    .order('code');
  const stores = (storeData ?? []) as unknown as StoreRow[];
  const selectedId = session.isHQ ? sp.store : session.profile.store_id;
  const store = stores.find((item) => item.id === selectedId) ?? stores[0];

  if (!store) {
    return (
      <>
        <Topbar crumb="매장 운영" title="지점 운영센터" sub="연결된 운영 지점이 없습니다"
          name={session.profile.full_name} role={session.profile.role} />
        <div className="view"><Card><Empty>운영 중인 지점 또는 담당 지점이 없습니다.</Empty></Card></div>
      </>
    );
  }

  const [summaryRes, salesSeriesRes, rankingRes, stockRes, kioskOrdersRes, purchaseOrdersRes] = await Promise.all([
    supabase.rpc('dashboard_summary', { p_store: store.id }),
    supabase.rpc('kiosk_sales_series', { p_store: store.id, p_days: 7 }),
    supabase.rpc('menu_ranking', { p_store: store.id, p_days: 7 }),
    supabase.rpc('low_store_stock', { p_store: store.id }),
    supabase
      .from('kiosk_orders')
      .select('id, order_no, total, item_count, order_type, paid_at, lines:kiosk_order_lines(menu_name, qty, amount)')
      .eq('store_id', store.id)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(8),
    supabase
      .from('purchase_orders')
      .select('id, order_no, stage, source, is_urgent, total_amount, due_date, ordered_ts')
      .eq('store_id', store.id)
      .not('stage', 'in', '(done,canceled)')
      .order('ordered_ts', { ascending: false })
      .limit(6),
  ]);

  const summary = (summaryRes.data ?? {}) as Partial<Summary>;
  const kiosk = summary.kiosk_today ?? { sales: 0, cnt: 0, avg: 0 };
  const open = summary.open ?? { total: 0, received: 0, in_transit: 0, urgent: 0, auto: 0 };
  const recv = summary.receivable ?? { carry: 0, mtd: 0, overdue_stores: 0 };
  const stocks = (stockRes.data ?? []) as LowStock[];
  const orders = (kioskOrdersRes.data ?? []) as unknown as KioskOrder[];
  const purchaseOrders = (purchaseOrdersRes.data ?? []) as PurchaseOrder[];
  const salesSeries: Point[] = ((salesSeriesRes.data ?? []) as { d: string; amount: number; cnt: number }[]).map((row) => ({
    k: md(row.d),
    full: `${md(row.d)} (${weekdayOf(row.d)})`,
    v: Number(row.amount),
    sub: `· ${n0(row.cnt)}건`,
  }));
  const ranking = ((rankingRes.data ?? []) as { menu_name: string; qty: number; amount: number }[]).slice(0, 6).map((row) => ({
    k: row.menu_name,
    v: Number(row.qty),
    sub: won(Number(row.amount)),
  }));
  const critical = stocks.filter((row) => stockState(row.ratio == null ? null : Number(row.ratio)) === 'crit').length;
  const origin = await siteOrigin();
  const kioskUrl = `${origin}/kiosk/${store.kiosk_token}`;
  const today = seoulToday();

  return (
    <>
      <Topbar
        crumb="매장 운영"
        title={`${store.name} 운영센터`}
        sub={`${today} (${weekdayOf(today)}) · 키오스크와 본사 ERP 통합 운영`}
        name={session.profile.full_name}
        role={session.profile.role}
        action={session.isHQ && stores.length > 1
          ? <StorePicker stores={stores} current={store.id} basePath="/store-dashboard" />
          : undefined}
      />

      <div className="view store-dashboard">
        <section className="store-hero">
          <div className="store-hero-copy">
            <div className="store-eyebrow">STORE CONTROL · {store.code}</div>
            <h2>키오스크 판매부터 본사 발주까지<br />한 흐름으로 관리합니다.</h2>
            <p>
              결제 즉시 원재료 재고가 차감되고, 안전재고 아래로 내려가면 본사 ERP에 자동발주가 접수됩니다.
            </p>
            <div className="store-hero-badges">
              <Pill state={store.kiosk_enabled ? 'ok' : 'crit'} label={store.kiosk_enabled ? '키오스크 정상' : '키오스크 중지'} />
              <Pill state="ok" label="본사 ERP 연결됨" />
              {open.auto > 0 && <Pill state="warn" label={`자동발주 ${open.auto}건`} />}
            </div>
            <div className="store-hero-actions">
              <a className="btn btn-primary" href={kioskUrl} target="_blank" rel="noreferrer">우리 지점 키오스크 열기</a>
              <Link className="btn" href="/orders">발주 등록·조회</Link>
              <Link className="btn" href="/kiosk-orders">주문 상세</Link>
            </div>
          </div>
          <div className="store-hero-status">
            <div><span>담당 점장</span><b>{store.manager_name ?? session.profile.full_name}</b></div>
            <div><span>본사 배송 노선</span><b>{store.route?.name ?? '배정 대기'}</b></div>
            <div><span>배송 기사</span><b>{store.route?.driver_name ?? '배정 대기'}</b></div>
            <div><span>매장 연락처</span><b>{store.tel ?? '미등록'}</b></div>
          </div>
        </section>

        <div className="kpis store-kpis">
          <Kpi label="오늘 키오스크 매출" value={wonC(kiosk.sales)} foot={<><b className="num">{n0(kiosk.cnt)}</b>건 결제 완료</>} />
          <Kpi label="오늘 객단가" value={wonC(kiosk.avg)} foot={<span className="t-mute">결제 완료 주문 기준</span>} />
          <Kpi label="진행 중 발주" value={n0(open.total)} unit="건" foot={<>본사 승인 대기 <b className="num">{n0(open.received)}</b>건</>} />
          <Kpi label="재고 경고" value={n0(stocks.length)} unit="종" foot={<><span className="t-neg">결품 위험 {critical}</span> · 안전재고 이하</>} />
        </div>

        <div className="grid store-chart-grid">
          <Card title="최근 7일 키오스크 매출" sub="결제 완료 기준" aside={<Pill state="ok" label="실시간 집계" />}>
            <div style={{ padding: '8px 10px 10px' }}>
              <AreaChart data={salesSeries} label="최근 7일 키오스크 매출" />
            </div>
          </Card>
          <Card title="잘 팔리는 메뉴" sub="최근 7일 판매수량">
            <div style={{ padding: '10px 9px 12px' }}>
              {ranking.length > 0
                ? <BarChart rows={ranking} label="메뉴별 판매 순위" labelW={130} unit="개" />
                : <Empty>아직 판매 데이터가 없습니다.</Empty>}
            </div>
          </Card>
        </div>

        <div className="grid store-main-grid">
          <Card title="최근 키오스크 주문" sub="결제 즉시 반영" aside={<Link className="btn btn-sm" href="/kiosk-orders">전체 주문</Link>}>
            <div className="store-order-list">
              {orders.map((order) => (
                <div className="store-order-row" key={order.id}>
                  <div className="store-order-no">
                    <b className="code">{order.order_no}</b>
                    <span>{order.order_type === 'takeout' ? '포장' : '매장'}</span>
                  </div>
                  <div className="store-order-menu">
                    {summarize(order.lines.map((line) => `${line.menu_name} ×${line.qty}`), 2) || `${order.item_count}개 상품`}
                    <span>{dateTime(order.paid_at)}</span>
                  </div>
                  <b className="num">{won(order.total)}</b>
                </div>
              ))}
              {orders.length === 0 && <Empty>아직 키오스크 결제 주문이 없습니다.</Empty>}
            </div>
          </Card>

          <Card title="본사 ERP 연동" sub="자동발주 처리 흐름" aside={<Pill state="ok" label="동기화 정상" />}>
            <div className="store-sync-flow">
              <div className="store-sync-step done"><b>1</b><span>키오스크 결제<small>주문·매출 저장</small></span></div>
              <i>→</i>
              <div className="store-sync-step done"><b>2</b><span>재고 자동 차감<small>BOM 원재료 반영</small></span></div>
              <i>→</i>
              <div className="store-sync-step done"><b>3</b><span>본사 자동발주<small>안전재고 감지</small></span></div>
            </div>
            <div className="store-hq-summary">
              <div><span>승인 대기</span><b>{n0(open.received)}건</b></div>
              <div><span>배송 중</span><b>{n0(open.in_transit)}건</b></div>
              <div><span>이번 달 매입</span><b>{wonC(recv.mtd)}</b></div>
              <div><span>이월 미수금</span><b>{wonC(recv.carry)}</b></div>
            </div>
          </Card>
        </div>

        <div className="grid store-main-grid">
          <Card title="재고 주의 품목" sub="안전재고 이하" aside={<Link className="btn btn-sm" href="/inventory">재고 전체</Link>}>
            <div className="store-stock-list">
              {stocks.slice(0, 6).map((stock) => {
                const ratio = Number(stock.ratio ?? 0);
                const state = stockState(ratio);
                return (
                  <div className="store-stock-row" key={stock.item_id}>
                    <div>
                      <span className="code t-mute">{stock.sku}</span>
                      <b>{stock.item_name}</b>
                    </div>
                    <Meter ratio={ratio} state={state} />
                    <span className="num">{n0(stock.on_hand)} / {n0(stock.safety_stock)}</span>
                    <Pill state={state} label={state === 'crit' ? '위험' : '주의'} />
                  </div>
                );
              })}
              {stocks.length === 0 && <Empty>안전재고 이하 품목이 없습니다.</Empty>}
            </div>
          </Card>

          <Card title="진행 중 발주" sub="본사 처리 상태" aside={<Link className="btn btn-sm" href="/orders">발주 관리</Link>}>
            <div className="store-po-list">
              {purchaseOrders.map((order) => (
                <Link className="store-po-row" href={`/orders/${order.id}`} key={order.id}>
                  <div>
                    <b className="code">{order.order_no}</b>
                    <span>{SOURCE_KO[order.source]}{order.due_date ? ` · 납기 ${md(order.due_date)}` : ''}</span>
                  </div>
                  <b className="num">{won(order.total_amount)}</b>
                  <StageBadge stage={order.stage} />
                </Link>
              ))}
              {purchaseOrders.length === 0 && <Empty>진행 중인 발주가 없습니다.</Empty>}
            </div>
          </Card>
        </div>

        <div className="store-live-wrap">
          <LiveTicker storeId={store.id} isHQ={session.isHQ} />
        </div>
      </div>
    </>
  );
}
