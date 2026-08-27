import type { Metadata } from 'next';
import { requireHQ } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import { Kpi } from '@/components/ui';
import StoresClient, { type RouteOpt, type StoreRow } from './StoresClient';
import { n0, seoulToday, wonC } from '@/lib/format';

export const metadata: Metadata = { title: '가맹점 · 왓더버거 ERP' };
export const dynamic = 'force-dynamic';

export default async function StoresPage() {
  const session = await requireHQ();
  const supabase = await createClient();
  const period = `${seoulToday().slice(0, 7)}-01`;

  const [{ data: storeData }, { data: routeData }] = await Promise.all([
    supabase
      .from('stores')
      .select(
        'id, code, name, sido, district, grade, status, manager_name, tel, opened_at, credit_limit, kiosk_enabled, route:routes(id, name), manager:profiles(full_name, email), settlement:settlements(carry_amount, mtd_amount, overdue_days)',
      )
      .eq('settlement.period', period)
      .eq('manager.is_active', true)
      .order('code'),
    supabase.from('routes').select('id, name').order('sort'),
  ]);

  const rows = (storeData ?? []) as unknown as StoreRow[];
  const routes = (routeData ?? []) as RouteOpt[];
  const operating = rows.filter((r) => r.status === 'operating');
  const noManager = operating.filter((r) => !r.manager?.[0]);
  const totalCredit = rows.reduce((a, r) => a + r.credit_limit, 0);

  return (
    <>
      <Topbar
        crumb="채권"
        title="가맹점"
        sub="지점 등록과 여신한도, 담당 지점관리자 배정 현황"
        name={session.profile.full_name}
        role={session.profile.role}
      />
      <div className="view">
        <div className="kpis">
          <Kpi label="운영 가맹점" value={n0(operating.length)} unit="개점"
               foot={<span className="t-mute">전체 {n0(rows.length)}개점</span>} />
          <Kpi label="직영점" value={n0(rows.filter((r) => r.grade === 'direct').length)} unit="개점" />
          <Kpi label="여신한도 총액" value={wonC(totalCredit)} />
          <Kpi
            label="담당자 미지정" value={n0(noManager.length)} unit="개점"
            foot={
              noManager.length > 0
                ? <span style={{ color: 'var(--warn)' }}>계정 관리에서 지점관리자를 배정하세요</span>
                : <span className="t-mute">전 지점 배정 완료</span>
            }
          />
        </div>

        <StoresClient rows={rows} routes={routes} />
      </div>
    </>
  );
}
