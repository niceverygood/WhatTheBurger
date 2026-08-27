import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface Line { menu_id: string; qty: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 키오스크 결제.
 *
 * 금액은 클라이언트가 보낸 값을 쓰지 않는다. menu_id 와 수량만 받고
 * 가격·레시피·재고 판정은 전부 DB 함수(kiosk_checkout) 안에서 처리한다.
 * 차감과 자동발주까지 한 트랜잭션이라 중간 실패가 남지 않는다.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ ok: false, error: 'INVALID_TOKEN' }, { status: 404 });
  }

  let payload: { lines?: unknown; order_type?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'BAD_REQUEST' }, { status: 400 });
  }

  const raw = Array.isArray(payload.lines) ? payload.lines : [];
  const lines: Line[] = raw
    .filter((l): l is Line => {
      if (typeof l !== 'object' || l === null) return false;
      const v = l as Record<string, unknown>;
      return typeof v.menu_id === 'string' && UUID.test(v.menu_id) && Number.isFinite(Number(v.qty));
    })
    .map((l) => ({ menu_id: l.menu_id, qty: Math.floor(Number(l.qty)) }))
    .filter((l) => l.qty > 0 && l.qty <= 99)
    .slice(0, 40);

  if (lines.length === 0) {
    return NextResponse.json({ ok: false, error: 'EMPTY_CART' }, { status: 400 });
  }

  const orderType = payload.order_type === 'takeout' ? 'takeout' : 'dine_in';

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('kiosk_checkout', {
      p_token: token,
      p_lines: lines,
      p_order_type: orderType,
    });

    if (error) {
      console.error('[kiosk] checkout failed', error.message);
      return NextResponse.json({ ok: false, error: 'SERVER_ERROR' }, { status: 500 });
    }

    const body = data as { ok: boolean; error?: string };
    if (!body?.ok) {
      const status = body?.error === 'INVALID_TOKEN' || body?.error === 'KIOSK_DISABLED' ? 404 : 409;
      return NextResponse.json(body, { status });
    }

    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[kiosk] checkout error', e);
    return NextResponse.json({ ok: false, error: 'SERVER_ERROR' }, { status: 500 });
  }
}
