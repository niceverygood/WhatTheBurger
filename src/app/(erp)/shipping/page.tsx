import type { Metadata } from 'next';
import { requireHQ } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import ShippingClient, { type ShipRow } from './ShippingClient';

export const metadata: Metadata = { title: '출고 · 배차 · 왓더버거 ERP' };
export const dynamic = 'force-dynamic';

export default async function ShippingPage() {
  const session = await requireHQ();
  const supabase = await createClient();

  const { data } = await supabase
    .from('purchase_orders')
    .select(
      'id, order_no, stage, total_amount, is_urgent, due_date, store:stores(code, name, sido), route:routes(id, name, driver_name, vehicle), purchase_order_lines(count)',
    )
    .in('stage', ['approved', 'picking', 'shipped', 'delivering'])
    .order('is_urgent', { ascending: false })
    .order('due_date', { ascending: true })
    .limit(300);

  type Raw = Omit<ShipRow, 'line_count'> & { purchase_order_lines: { count: number }[] };
  const rows: ShipRow[] = ((data ?? []) as unknown as Raw[]).map((o) => ({
    ...o,
    line_count: o.purchase_order_lines?.[0]?.count ?? 0,
  }));

  return (
    <>
      <Topbar
        crumb="운영"
        title="출고 · 배차"
        sub="승인된 발주를 노선별로 묶어 피킹부터 납품 확인까지 진행합니다"
        name={session.profile.full_name}
        role={session.profile.role}
      />
      <div className="view">
        <ShippingClient rows={rows} />
      </div>
    </>
  );
}
