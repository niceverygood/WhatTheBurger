import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function DemoKioskPage() {
  const admin = createAdminClient();
  const { data: store } = await admin
    .from('stores')
    .select('kiosk_token')
    .eq('status', 'operating')
    .eq('kiosk_enabled', true)
    .order('code')
    .limit(1)
    .maybeSingle();

  if (store?.kiosk_token) redirect(`/kiosk/${store.kiosk_token}`);

  return (
    <div className="kio-gate">
      <div>
        <div className="brand-mark" style={{ color: '#fff' }}>
          WHAT THE<em style={{ color: 'var(--red)', fontStyle: 'normal', display: 'block', fontSize: 26 }}>BURGER</em>
        </div>
        <div className="g-t">연결할 매장이 없습니다</div>
        <div className="g-s">ERP에서 운영 중인 매장의 키오스크 사용 설정을 확인해 주세요.</div>
      </div>
    </div>
  );
}
