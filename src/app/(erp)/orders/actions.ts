'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { OrderStage } from '@/lib/types';

export interface OrderActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  orderNo?: string;
  orderId?: string;
}

const STAGE_SET: OrderStage[] = [
  'received', 'approved', 'picking', 'shipped', 'delivering', 'done', 'hold', 'canceled',
];

/** 발주 단계 이동. 권한과 전이 규칙 검증은 DB 함수(advance_order)가 맡는다. */
export async function advanceStage(
  orderId: string,
  stage: OrderStage,
  note?: string,
): Promise<OrderActionResult> {
  await requireSession();
  if (!STAGE_SET.includes(stage)) return { ok: false, error: '알 수 없는 단계입니다.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('advance_order', {
    p_order: orderId,
    p_stage: stage,
    p_note: note ?? null,
  });

  if (error) {
    const map: Record<string, string> = {
      FORBIDDEN: '이 발주를 변경할 권한이 없습니다.',
      FORBIDDEN_TRANSITION: '지점관리자는 접수 상태의 발주만 보류·취소할 수 있습니다.',
      ORDER_CLOSED: '이미 완료·취소된 발주는 변경할 수 없습니다.',
      ORDER_NOT_FOUND: '발주를 찾을 수 없습니다.',
      NOT_AUTHENTICATED: '로그인이 필요합니다.',
    };
    const key = Object.keys(map).find((k) => error.message.includes(k));
    return { ok: false, error: key ? map[key] : `처리에 실패했습니다. (${error.message})` };
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/shipping');
  revalidatePath('/dashboard');
  revalidatePath('/inventory');
  return { ok: true, message: '발주 단계를 변경했습니다.' };
}

/** 여러 건을 한꺼번에 이동(출고 화면의 일괄 처리). */
export async function advanceMany(
  orderIds: string[],
  stage: OrderStage,
  note?: string,
): Promise<OrderActionResult> {
  await requireSession();
  if (orderIds.length === 0) return { ok: false, error: '선택된 발주가 없습니다.' };

  const supabase = await createClient();
  let done = 0;
  const failures: string[] = [];

  for (const id of orderIds) {
    const { error } = await supabase.rpc('advance_order', {
      p_order: id, p_stage: stage, p_note: note ?? '일괄 처리',
    });
    if (error) failures.push(error.message);
    else done += 1;
  }

  revalidatePath('/orders');
  revalidatePath('/shipping');
  revalidatePath('/dashboard');

  if (done === 0) return { ok: false, error: `처리하지 못했습니다. (${failures[0] ?? '알 수 없는 오류'})` };
  return {
    ok: true,
    message: failures.length
      ? `${done}건 처리, ${failures.length}건 실패했습니다.`
      : `${done}건을 처리했습니다.`,
  };
}

/** 발주 등록. 지점관리자는 본인 지점만(DB 함수에서 재검증). */
export async function submitOrder(
  storeId: string,
  lines: { item_id: string; qty: number }[],
  memo: string,
  urgent: boolean,
): Promise<OrderActionResult> {
  await requireSession();

  const clean = lines
    .filter((l) => l.item_id && Number.isFinite(l.qty) && l.qty > 0)
    .map((l) => ({ item_id: l.item_id, qty: Math.min(9999, Math.floor(l.qty)) }));

  if (clean.length === 0) return { ok: false, error: '발주할 품목과 수량을 입력해 주세요.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_purchase_order', {
    p_store: storeId,
    p_lines: clean,
    p_memo: memo || null,
    p_urgent: urgent,
  });

  if (error) {
    if (error.message.includes('FORBIDDEN')) {
      return { ok: false, error: '이 지점에 발주할 권한이 없습니다.' };
    }
    if (error.message.includes('EMPTY_ORDER')) {
      return { ok: false, error: '유효한 발주 품목이 없습니다.' };
    }
    return { ok: false, error: `발주 등록에 실패했습니다. (${error.message})` };
  }

  const res = data as { order_no: string; id: string };
  revalidatePath('/orders');
  revalidatePath('/dashboard');
  return { ok: true, message: `발주 ${res.order_no} 를 등록했습니다.`, orderNo: res.order_no, orderId: res.id };
}
