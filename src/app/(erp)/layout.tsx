import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Sidebar, { type NavBadges } from '@/components/Sidebar';
import { ToastProvider } from '@/components/Toast';
import KioskOrderPopup from '@/components/KioskOrderPopup';

export const dynamic = 'force-dynamic';

/** 사이드바 배지 숫자. RLS 가 이미 범위를 좁히므로 count 만 세면 된다. */
async function loadBadges(storeId: string | null): Promise<{ badges: NavBadges; storeCount: number }> {
  const supabase = await createClient();

  const openQ = supabase
    .from('purchase_orders')
    .select('id', { count: 'exact', head: true })
    .not('stage', 'in', '(done,hold,canceled)');
  if (storeId) openQ.eq('store_id', storeId);

  const storeQ = supabase
    .from('stores')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'operating');

  const overdueQ = supabase
    .from('settlements')
    .select('id', { count: 'exact', head: true })
    .gt('overdue_days', 0);
  if (storeId) overdueQ.eq('store_id', storeId);

  // 안전재고 미달은 컬럼 간 비교라 SQL 로 세야 한다. 지점은 지점재고, 본사는 물류센터 재고 기준.
  const lowQ = storeId
    ? supabase.from('store_stock').select('on_hand,safety_stock').eq('store_id', storeId)
    : supabase.from('warehouse_stock').select('on_hand,allocated,safety_stock');

  const [open, stores, overdue, low] = await Promise.all([openQ, storeQ, overdueQ, lowQ]);

  const lowStock = (low.data ?? []).filter((r: Record<string, number>) => {
    const avail = 'allocated' in r ? r.on_hand - r.allocated : r.on_hand;
    return r.safety_stock > 0 && avail <= r.safety_stock;
  }).length;

  return {
    badges: {
      openOrders: open.count ?? 0,
      lowStock,
      overdue: overdue.count ?? 0,
    },
    storeCount: stores.count ?? 0,
  };
}

export default async function ErpLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { badges, storeCount } = await loadBadges(session.isHQ ? null : session.profile.store_id);

  return (
    <ToastProvider>
      <KioskOrderPopup
        storeId={session.isHQ ? null : session.profile.store_id}
        storeName={session.store?.name ?? null}
      />
      <div className="app">
        <Sidebar
          isHQ={session.isHQ}
          badges={badges}
          storeCount={storeCount}
          storeName={session.store?.name ?? null}
        />
        <div className="main">{children}</div>
      </div>
    </ToastProvider>
  );
}
