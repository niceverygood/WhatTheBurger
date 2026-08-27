import type { Metadata } from 'next';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import { Card, Empty, Kpi } from '@/components/ui';
import ItemsClient, { type ItemRow } from './ItemsClient';
import { n0 } from '@/lib/format';

export const metadata: Metadata = { title: '품목 마스터 · 왓더버거 ERP' };
export const dynamic = 'force-dynamic';

export default async function ItemsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from('items')
    .select('id, sku, name, category, unit, ea_per_unit, price, cost, temp, is_active, supplier:suppliers(name, lead_days)')
    .order('sku');

  const rows = (data ?? []) as unknown as ItemRow[];
  const cats = new Set(rows.map((r) => r.category));
  const margin = rows.length
    ? Math.round(
        (rows.reduce((a, r) => a + (r.price - r.cost) / Math.max(1, r.price), 0) / rows.length) * 1000,
      ) / 10
    : 0;

  return (
    <>
      <Topbar
        crumb="자산"
        title="품목 마스터"
        sub={
          session.isHQ
            ? '본사가 관리하는 공급 품목과 단가 · 공급사 정보'
            : '본사가 관리하는 공급 품목입니다 (읽기 전용)'
        }
        name={session.profile.full_name}
        role={session.profile.role}
      />
      <div className="view">
        <div className="kpis">
          <Kpi label="등록 품목" value={n0(rows.length)} unit="SKU" />
          <Kpi label="분류" value={n0(cats.size)} unit="종" />
          <Kpi label="평균 공급 마진" value={`${margin}`} unit="%"
               foot={<span className="t-mute">(공급가 − 매입원가) ÷ 공급가</span>} />
          <Kpi label="공급 중단" value={n0(rows.filter((r) => !r.is_active).length)} unit="SKU" />
        </div>

        {rows.length === 0 ? (
          <Card><Empty>등록된 품목이 없습니다.</Empty></Card>
        ) : (
          <ItemsClient rows={rows} isHQ={session.isHQ} />
        )}
      </div>
    </>
  );
}
