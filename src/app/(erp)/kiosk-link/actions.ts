'use server';

import { revalidatePath } from 'next/cache';
import { requireHQ, requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export interface KioskActionResult { ok: boolean; error?: string; message?: string; token?: string }

/** 링크가 유출됐을 때 즉시 무효화한다. 기존 단말은 새 링크로 다시 열어야 한다. */
export async function rotateToken(storeId: string): Promise<KioskActionResult> {
  await requireHQ();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('rotate_kiosk_token', { p_store: storeId });
  if (error) {
    return {
      ok: false,
      error: error.message.includes('FORBIDDEN')
        ? '본사 총괄관리자만 링크를 재발급할 수 있습니다.'
        : `재발급에 실패했습니다. (${error.message})`,
    };
  }

  revalidatePath('/kiosk-link');
  return { ok: true, message: '키오스크 링크를 재발급했습니다. 기존 링크는 즉시 사용할 수 없습니다.', token: data as string };
}

/** 단말 사용 중지/재개. 지점관리자도 본인 지점은 조작할 수 있다. */
export async function setKioskEnabled(storeId: string, enabled: boolean): Promise<KioskActionResult> {
  const session = await requireSession();
  if (!session.isHQ && session.profile.store_id !== storeId) {
    return { ok: false, error: '다른 지점의 키오스크는 조작할 수 없습니다.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('stores').update({ kiosk_enabled: enabled }).eq('id', storeId);
  if (error) return { ok: false, error: `변경에 실패했습니다. (${error.message})` };

  revalidatePath('/kiosk-link');
  return { ok: true, message: enabled ? '키오스크를 사용 상태로 전환했습니다.' : '키오스크를 일시 중지했습니다.' };
}
