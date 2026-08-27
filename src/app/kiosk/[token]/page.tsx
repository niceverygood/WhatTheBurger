import type { Metadata, Viewport } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import KioskTerminal, { type KioskMenu, type KioskStore } from './KioskTerminal';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '왓더버거 키오스크',
  // 매장 단말 링크가 검색에 노출되면 안 된다.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#12100E',
};

interface Bootstrap {
  ok: boolean;
  error?: string;
  store?: KioskStore & { name: string };
  menus?: KioskMenu[];
  stats?: { sales: number; count: number; avg: number };
  recent?: { order_no: string; total: number; paid_at: string }[];
}

function Gate({ title, body }: { title: string; body: string }) {
  return (
    <div className="kio-gate">
      <div>
        <div className="brand-mark" style={{ color: '#fff' }}>
          WHAT THE<em style={{ color: 'var(--red)', fontStyle: 'normal', display: 'block', fontSize: 26 }}>BURGER</em>
        </div>
        <div className="g-t">{title}</div>
        <div className="g-s">{body}</div>
        <div style={{ marginTop: 22 }}>
          <span className="kio-badge">KIOSK TERMINAL</span>
        </div>
      </div>
    </div>
  );
}

export default async function KioskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let body: Bootstrap = { ok: false, error: 'SERVER_ERROR' };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('kiosk_bootstrap', { p_token: token });
    if (!error && data) body = data as Bootstrap;
  } catch (e) {
    console.error('[kiosk] page bootstrap error', e);
  }

  if (!body.ok || !body.store || !body.menus) {
    if (body.error === 'KIOSK_DISABLED') {
      return (
        <Gate
          title="현재 주문을 받을 수 없습니다"
          body="이 매장의 키오스크가 일시 중지되었거나 휴점 상태입니다. 매장 직원에게 문의해 주세요."
        />
      );
    }
    if (body.error === 'SERVER_ERROR') {
      return (
        <Gate
          title="시스템에 연결할 수 없습니다"
          body="잠시 후 화면을 새로 고쳐 주세요. 문제가 계속되면 본사 운영팀에 연락해 주세요."
        />
      );
    }
    return (
      <Gate
        title="사용할 수 없는 링크입니다"
        body="키오스크 주소가 올바르지 않거나 만료되었습니다. 본사 ERP의 키오스크 연동 화면에서 이 매장의 링크를 다시 확인해 주세요."
      />
    );
  }

  return (
    <KioskTerminal
      token={token}
      initial={{
        ok: true,
        store: body.store,
        menus: body.menus,
        stats: body.stats ?? { sales: 0, count: 0, avg: 0 },
        recent: body.recent ?? [],
      }}
    />
  );
}
