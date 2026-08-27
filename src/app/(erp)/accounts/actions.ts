'use server';

import { revalidatePath } from 'next/cache';
import { requireHQ } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/lib/types';

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  /** 계정 발급 직후 한 번만 보여 주는 초기 비밀번호 */
  credentials?: { email: string; password: string; name: string };
}

/** 사람이 옮겨 적기 쉬운 임시 비밀번호. 헷갈리는 글자(O0Il1)는 뺐다. */
function tempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digit = '23456789';
  const mark = '!@#$%';
  const all = upper + lower + digit;
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  const pick = (set: string, i: number) => set[bytes[i] % set.length];

  const body = Array.from({ length: 9 }, (_, i) => pick(all, i + 4)).join('');
  return pick(upper, 0) + pick(lower, 1) + body + pick(digit, 2) + pick(mark, 3);
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

async function logAudit(
  action: string,
  entityId: string,
  detail: Record<string, unknown>,
  actorId: string,
  actorName: string,
) {
  try {
    const admin = createAdminClient();
    await admin.from('audit_log').insert({
      actor_id: actorId, actor_name: actorName, action, entity: 'profile', entity_id: entityId, detail,
    });
  } catch {
    /* 감사 로그 실패가 본 작업을 막지는 않는다 */
  }
}

/* ------------------------------------------------------------------ 계정 발급 */
export async function createAccount(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireHQ();

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const fullName = String(formData.get('full_name') ?? '').trim();
  const role = String(formData.get('role') ?? 'store_manager') as UserRole;
  const storeId = String(formData.get('store_id') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const custom = String(formData.get('password') ?? '').trim();

  if (!isEmail(email)) return { ok: false, error: '올바른 이메일 형식이 아닙니다.' };
  if (fullName.length < 2) return { ok: false, error: '이름을 2자 이상 입력해 주세요.' };
  if (role !== 'hq_admin' && role !== 'store_manager') {
    return { ok: false, error: '권한 값이 올바르지 않습니다.' };
  }
  if (role === 'store_manager' && !storeId) {
    return { ok: false, error: '지점관리자는 담당 지점을 반드시 지정해야 합니다.' };
  }
  if (custom && custom.length < 8) {
    return { ok: false, error: '비밀번호는 8자 이상이어야 합니다.' };
  }

  const password = custom || tempPassword();
  const admin = createAdminClient();

  // 지점 존재 확인 — 잘못된 ID 로 계정이 붕 뜨는 걸 막는다.
  if (role === 'store_manager') {
    const { data: store } = await admin.from('stores').select('id').eq('id', storeId).maybeSingle();
    if (!store) return { ok: false, error: '존재하지 않는 지점입니다.' };
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 본사가 직접 발급하므로 메일 인증 절차를 두지 않는다
    user_metadata: { full_name: fullName },
  });

  if (authError || !created.user) {
    const msg = authError?.message ?? '';
    if (/already|registered|exists/i.test(msg)) {
      return { ok: false, error: '이미 등록된 이메일입니다.' };
    }
    return { ok: false, error: `계정 생성에 실패했습니다. (${msg || '알 수 없는 오류'})` };
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    email,
    full_name: fullName,
    role,
    store_id: role === 'store_manager' ? storeId : null,
    phone: phone || null,
    is_active: true,
    must_change_password: true,
    created_by: session.userId,
  });

  if (profileError) {
    // 프로필이 없으면 로그인해도 아무것도 못 하는 유령 계정이 된다. 인증 계정을 되돌린다.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: `권한 정보 저장에 실패했습니다. (${profileError.message})` };
  }

  await logAudit('create_account', created.user.id, { email, role, store_id: storeId || null },
    session.userId, session.profile.full_name);

  revalidatePath('/accounts');
  return {
    ok: true,
    message: `${fullName} 님의 계정을 발급했습니다.`,
    credentials: { email, password, name: fullName },
  };
}

/* ------------------------------------------------------------------ 비밀번호 재발급 */
export async function resetPassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireHQ();
  const userId = String(formData.get('user_id') ?? '');
  const custom = String(formData.get('password') ?? '').trim();

  if (!userId) return { ok: false, error: '대상 계정이 지정되지 않았습니다.' };
  if (custom && custom.length < 8) return { ok: false, error: '비밀번호는 8자 이상이어야 합니다.' };

  const password = custom || tempPassword();
  const admin = createAdminClient();

  const { data: target } = await admin
    .from('profiles').select('email, full_name').eq('id', userId).maybeSingle<{ email: string; full_name: string }>();
  if (!target) return { ok: false, error: '존재하지 않는 계정입니다.' };

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, error: `재발급에 실패했습니다. (${error.message})` };

  await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
  await logAudit('reset_password', userId, { email: target.email },
    session.userId, session.profile.full_name);

  revalidatePath('/accounts');
  return {
    ok: true,
    message: `${target.full_name} 님의 비밀번호를 재발급했습니다.`,
    credentials: { email: target.email, password, name: target.full_name },
  };
}

/* ------------------------------------------------------------------ 활성/비활성 */
export async function setActive(userId: string, active: boolean): Promise<ActionResult> {
  const session = await requireHQ();
  if (userId === session.userId) {
    return { ok: false, error: '본인 계정은 비활성화할 수 없습니다.' };
  }

  const admin = createAdminClient();
  const { error } = await admin.from('profiles').update({ is_active: active }).eq('id', userId);
  if (error) return { ok: false, error: error.message };

  // 비활성 계정은 남아 있는 세션도 끊는다.
  if (!active) {
    await admin.auth.admin.signOut(userId, 'global').catch(() => {});
  }

  await logAudit(active ? 'activate_account' : 'deactivate_account', userId, {},
    session.userId, session.profile.full_name);

  revalidatePath('/accounts');
  return { ok: true, message: active ? '계정을 활성화했습니다.' : '계정을 비활성화했습니다.' };
}

/* ------------------------------------------------------------------ 담당 지점 변경 */
export async function reassignStore(userId: string, storeId: string): Promise<ActionResult> {
  const session = await requireHQ();
  const admin = createAdminClient();

  const { data: store } = await admin.from('stores').select('id,name').eq('id', storeId)
    .maybeSingle<{ id: string; name: string }>();
  if (!store) return { ok: false, error: '존재하지 않는 지점입니다.' };

  const { error } = await admin.from('profiles')
    .update({ store_id: storeId, role: 'store_manager' })
    .eq('id', userId);
  if (error) return { ok: false, error: error.message };

  await logAudit('reassign_store', userId, { store_id: storeId },
    session.userId, session.profile.full_name);

  revalidatePath('/accounts');
  return { ok: true, message: `담당 지점을 ${store.name}(으)로 변경했습니다.` };
}

/* ------------------------------------------------------------------ 삭제 */
export async function deleteAccount(userId: string): Promise<ActionResult> {
  const session = await requireHQ();
  if (userId === session.userId) {
    return { ok: false, error: '본인 계정은 삭제할 수 없습니다.' };
  }

  const admin = createAdminClient();

  // 본사 관리자가 한 명도 남지 않는 상황을 막는다.
  const { data: target } = await admin
    .from('profiles').select('role, full_name').eq('id', userId).maybeSingle<{ role: UserRole; full_name: string }>();
  if (!target) return { ok: false, error: '존재하지 않는 계정입니다.' };

  if (target.role === 'hq_admin') {
    const { count } = await admin
      .from('profiles').select('id', { count: 'exact', head: true })
      .eq('role', 'hq_admin').eq('is_active', true);
    if ((count ?? 0) <= 1) {
      return { ok: false, error: '마지막 본사 총괄관리자 계정은 삭제할 수 없습니다.' };
    }
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: `삭제에 실패했습니다. (${error.message})` };

  await logAudit('delete_account', userId, { name: target.full_name },
    session.userId, session.profile.full_name);

  revalidatePath('/accounts');
  return { ok: true, message: `${target.full_name} 님의 계정을 삭제했습니다.` };
}
