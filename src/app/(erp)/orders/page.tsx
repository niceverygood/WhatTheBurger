import type { Metadata } from 'next';
import { requireSession, scopeStoreId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import OrdersClient, { type OrderRow } from './OrdersClient';
import type { ItemOpt } from './NewOrderModal';

export const metadata: Metadata = { title: '발주 관리 · 왓더버거 ERP' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 40;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireSession();
  const storeId = scopeStoreId(session);
  const sp = await searchParams;

  const stage = sp.stage ?? 'open';
  const storeFilter = session.isHQ ? (sp.store ?? '') : '';
  const source = sp.source ?? '';
  const q = (sp.q ?? '').trim();
  const page = Math.max(1, Number(sp.page) || 1);

  const supabase = await createClient();

  let query = supabase
    .from('purchase_orders')
    .select(
      'id, order_no, store_id, stage, source, is_urgent, ordered_at, ordered_ts, due_date, total_amount, memo, store:stores(code, name, sido), purchase_order_lines(count)',
      { count: 'exact' },
    )
    .order('ordered_ts', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (stage === 'open') query = query.not('stage', 'in', '(done,canceled)');
  else if (stage) query = query.eq('stage', stage);

  if (storeId) query = query.eq('store_id', storeId);
  else if (storeFilter) query = query.eq('store_id', storeFilter);

  if (source) query = query.eq('source', source);
  if (q) query = query.ilike('order_no', `%${q}%`);

  const [ordersRes, storesRes, itemsRes] = await Promise.all([
    query,
    supabase.from('stores').select('id, code, name').eq('status', 'operating').order('code'),
    supabase
      .from('items')
      .select('id, sku, name, category, unit, price')
      .eq('is_active', true)
      .order('sku'),
  ]);

  type Raw = Omit<OrderRow, 'line_count'> & { purchase_order_lines: { count: number }[] };
  const rows: OrderRow[] = ((ordersRes.data ?? []) as unknown as Raw[]).map((o) => ({
    ...o,
    line_count: o.purchase_order_lines?.[0]?.count ?? 0,
  }));

  return (
    <>
      <Topbar
        crumb="운영"
        title="발주 관리"
        sub={
          session.isHQ
            ? '전 지점 발주를 접수부터 납품 확인까지 한 파이프라인에서 처리합니다'
            : `${session.store?.name ?? ''} 발주 등록과 진행 상황`
        }
        name={session.profile.full_name}
        role={session.profile.role}
      />
      <div className="view">
        <OrdersClient
          rows={rows}
          stores={storesRes.data ?? []}
          items={(itemsRes.data ?? []) as ItemOpt[]}
          isHQ={session.isHQ}
          myStoreId={session.profile.store_id}
          total={ordersRes.count ?? rows.length}
          page={page}
          pageSize={PAGE_SIZE}
          filters={{ stage, store: storeFilter, q, source }}
        />
      </div>
    </>
  );
}
