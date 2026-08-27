'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { LedgerReason } from '@/lib/types';

export interface StockResult { ok: boolean; error?: string; message?: string }

/** 지점 재고 수동 조정(실사·폐기). 권한 검증은 DB 함수가 다시 한 번 한다. */
export async function adjustStock(
  storeId: string,
  itemId: string,
  delta: number,
  reason: LedgerReason,
  note: string,
): Promise<StockResult> {
  await requireSession();
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: '증감 수량이 올바르지 않습니다.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('adjust_store_stock', {
    p_store: storeId,
    p_item: itemId,
    p_delta: Math.round(delta * 100) / 100,
    p_reason: reason,
    p_note: note.trim() || null,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes('FORBIDDEN')
        ? '이 지점의 재고를 조정할 권한이 없습니다.'
        : `조정에 실패했습니다. (${error.message})`,
    };
  }

  revalidatePath('/inventory');
  revalidatePath('/kiosk-link');
  revalidatePath('/dashboard');
  return { ok: true, message: '재고를 조정했습니다.' };
}

/** 안전재고 기준 변경 (본사·해당 지점) */
export async function setSafetyStock(
  storeId: string,
  itemId: string,
  safety: number,
): Promise<StockResult> {
  await requireSession();
  if (!Number.isFinite(safety) || safety < 0) {
    return { ok: false, error: '안전재고는 0 이상이어야 합니다.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('store_stock')
    .update({ safety_stock: Math.round(safety) })
    .eq('store_id', storeId)
    .eq('item_id', itemId);

  if (error) return { ok: false, error: `변경에 실패했습니다. (${error.message})` };

  revalidatePath('/inventory');
  return { ok: true, message: '안전재고 기준을 변경했습니다.' };
}
