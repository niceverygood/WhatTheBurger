'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface LoginState {
  error?: string;
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/dashboard');

  if (!email || !password) {
    return { error: '아이디와 비밀번호를 모두 입력해 주세요.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase 의 원문 메시지는 계정 존재 여부를 흘릴 수 있어 그대로 쓰지 않는다.
    return { error: '아이디 또는 비밀번호가 올바르지 않습니다.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active, role')
    .eq('id', data.user.id)
    .maybeSingle<{ is_active: boolean; role: 'hq_admin' | 'store_manager' }>();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: '권한 정보가 없는 계정입니다. 본사 관리자에게 문의해 주세요.' };
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: '비활성화된 계정입니다. 본사 관리자에게 문의해 주세요.' };
  }

  // 마지막 접속 시각 기록 (실패해도 로그인은 진행)
  try {
    const admin = createAdminClient();
    await admin
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.user.id);
  } catch {
    /* 서비스 키가 없는 환경에서는 건너뛴다 */
  }

  revalidatePath('/', 'layout');
  const requested = next.startsWith('/') ? next : '/dashboard';
  redirect(profile.role === 'store_manager' && requested === '/dashboard' ? '/store-dashboard' : requested);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
