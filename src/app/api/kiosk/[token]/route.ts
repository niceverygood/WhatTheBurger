import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * 키오스크 단말 부트스트랩.
 *
 * 태블릿에는 로그인 세션이 없다. 지점별 비밀 토큰만으로 신원을 확인하고,
 * 서버(service_role)에서만 DB 에 접근한다. 브라우저에는 Supabase 키를
 * 전혀 내려보내지 않는다.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token || token.length < 16) {
    return NextResponse.json({ ok: false, error: 'INVALID_TOKEN' }, { status: 404 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('kiosk_bootstrap', { p_token: token });

    if (error) {
      console.error('[kiosk] bootstrap failed', error.message);
      return NextResponse.json({ ok: false, error: 'SERVER_ERROR' }, { status: 500 });
    }

    const body = data as { ok: boolean; error?: string };
    if (!body?.ok) {
      return NextResponse.json(body ?? { ok: false, error: 'INVALID_TOKEN' }, { status: 404 });
    }

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[kiosk] bootstrap error', e);
    return NextResponse.json({ ok: false, error: 'SERVER_ERROR' }, { status: 500 });
  }
}
