'use server';

import { revalidatePath } from 'next/cache';
import { requireHQ } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { StoreGrade, StoreStatus } from '@/lib/types';

export interface StoreResult { ok: boolean; error?: string; message?: string }

interface StoreInput {
  id?: string;
  code: string;
  name: string;
  sido: string;
  district: string;
  route_id: string;
  grade: StoreGrade;
  status: StoreStatus;
  manager_name: string;
  tel: string;
  address: string;
  opened_at: string;
  credit_limit: number;
}

export async function saveStore(input: StoreInput): Promise<StoreResult> {
  await requireHQ();

  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();

  if (!/^[A-Z0-9-]{3,20}$/.test(code)) {
    return { ok: false, error: '지점 코드는 영문 대문자·숫자·하이픈 3~20자로 입력해 주세요.' };
  }
  if (name.length < 2) return { ok: false, error: '지점명을 2자 이상 입력해 주세요.' };
  if (!input.sido.trim()) return { ok: false, error: '지역(시·도)을 입력해 주세요.' };
  if (!Number.isFinite(input.credit_limit) || input.credit_limit < 0) {
    return { ok: false, error: '여신한도는 0 이상의 숫자여야 합니다.' };
  }

  const supabase = await createClient();
  const payload = {
    code,
    name,
    sido: input.sido.trim(),
    district: input.district.trim() || null,
    route_id: input.route_id || null,
    grade: input.grade,
    status: input.status,
    manager_name: input.manager_name.trim() || null,
    tel: input.tel.trim() || null,
    address: input.address.trim() || null,
    opened_at: input.opened_at || null,
    credit_limit: Math.round(input.credit_limit),
  };

  const { error } = input.id
    ? await supabase.from('stores').update(payload).eq('id', input.id)
    : await supabase.from('stores').insert(payload);

  if (error) {
    if (error.code === '23505') return { ok: false, error: '이미 사용 중인 지점 코드입니다.' };
    return { ok: false, error: `저장에 실패했습니다. (${error.message})` };
  }

  revalidatePath('/stores');
  revalidatePath('/kiosk-link');
  return { ok: true, message: input.id ? '가맹점 정보를 수정했습니다.' : `${name}을(를) 등록했습니다.` };
}
