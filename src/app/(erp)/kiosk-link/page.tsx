import type { Metadata } from 'next';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import { Empty } from '@/components/ui';
import KioskLinkClient, { type SaleRow, type StockRow, type StoreLink } from './KioskLinkClient';
import StorePicker from './StorePicker';

export const metadata: Metadata = { title: '키오스크 연동 · 왓더버거 ERP' };
export const dynamic = 'force-dynamic';

/** 배포 주소를 알아낸다. 환경변수가 있으면 그것이 정답이고, 없으면 요청 헤더로 추정한다. */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function KioskLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: storeList } = await supabase
    .from('stores')
    .select('id, code, name, kiosk_token, kiosk_enabled')
    .eq('status', 'operating')
    .order('code');

  const stores = (storeList ?? []) as StoreLink[];
  const selected =
    stores.find((s) => s.id === (session.isHQ ? sp.store : session.profile.store_id)) ?? stores[0];

  if (!selected) {
    return (
      <>
        <Topbar
          crumb="키오스크" title="키오스크 연동"
          sub="매장 태블릿에 띄울 전용 링크와 실시간 연동 상태"
          name={session.profile.full_name} role={session.profile.role}
        />
        <div className="view">
          <div className="card">
            <Empty>
              연결할 수 있는 지점이 없습니다.
              {session.isHQ && ' 가맹점을 먼저 등록해 주세요.'}
            </Empty>
          </div>
        </div>
      </>
    );
  }

  const origin = await siteOrigin();
  const url = `${origin}/kiosk/${selected.kiosk_token}`;

  const [qrSvg, stockRes, salesRes, statsRes] = await Promise.all([
    QRCode.toString(url, { type: 'svg', margin: 1, width: 132, color: { dark: '#16130F', light: '#FFFFFF' } }),
    supabase
      .from('store_stock')
      .select('item_id, on_hand, safety_stock, item:items(sku, name)')
      .eq('store_id', selected.id)
      .gt('safety_stock', 0)
      .order('on_hand', { ascending: true })
      .limit(60),
    supabase
      .from('kiosk_orders')
      .select('id, order_no, total, item_count, paid_at, order_type')
      .eq('store_id', selected.id)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(20),
    supabase.rpc('dashboard_summary', { p_store: selected.id }),
  ]);

  type RawStock = { item_id: string; on_hand: number; safety_stock: number; item: { sku: string; name: string } | null };
  const stock: StockRow[] = ((stockRes.data ?? []) as unknown as RawStock[]).map((r) => ({
    item_id: r.item_id,
    sku: r.item?.sku ?? '',
    item_name: r.item?.name ?? '',
    on_hand: Number(r.on_hand),
    safety_stock: Number(r.safety_stock),
  }));

  const summary = (statsRes.data ?? {}) as { kiosk_today?: { sales: number; cnt: number; avg: number } };
  const k = summary.kiosk_today ?? { sales: 0, cnt: 0, avg: 0 };

  return (
    <>
      <Topbar
        crumb="키오스크"
        title="키오스크 연동"
        sub={`${selected.name} · 태블릿 전용 링크와 실시간 재고 연동`}
        name={session.profile.full_name}
        role={session.profile.role}
      />
      <div className="view">
        {session.isHQ && stores.length > 1 && (
          <div className="toolbar">
            <StorePicker stores={stores} current={selected.id} />
            <span className="spacer" />
            <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
              지점마다 링크가 다릅니다. 태블릿 1대당 1개 지점에 연결됩니다.
            </span>
          </div>
        )}

        <KioskLinkClient
          store={selected}
          origin={origin}
          qrSvg={qrSvg}
          stock={stock}
          sales={(salesRes.data ?? []) as SaleRow[]}
          todayStats={{ sales: k.sales, count: k.cnt, avg: k.avg }}
          isHQ={session.isHQ}
        />
      </div>
    </>
  );
}
