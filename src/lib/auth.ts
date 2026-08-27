import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile, Store } from '@/lib/types';

export interface Session {
  userId: string;
  email: string;
  profile: Profile;
  store: Store | null;
  isHQ: boolean;
}

/**
 * 현재 로그인 사용자와 프로필/소속 지점을 함께 읽는다.
 * 프로필이 없거나 비활성 계정이면 로그인 화면으로 돌린다.
 */
export async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<Profile>();

  if (!profile || !profile.is_active) return null;

  let store: Store | null = null;
  if (profile.store_id) {
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('id', profile.store_id)
      .maybeSingle<Store>();
    store = data ?? null;
  }

  return {
    userId: user.id,
    email: user.email ?? profile.email,
    profile,
    store,
    isHQ: profile.role === 'hq_admin',
  };
}

/** 로그인 필수 화면에서 사용. 세션이 없으면 즉시 리다이렉트한다. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/** 본사 전용 화면에서 사용. */
export async function requireHQ(): Promise<Session> {
  const session = await requireSession();
  if (!session.isHQ) redirect('/');
  return session;
}

/**
 * 조회 범위를 정하는 지점 ID.
 * 본사는 null(전 지점), 지점관리자는 본인 지점 ID.
 * RLS 가 이미 막고 있지만, 쿼리 단계에서도 범위를 좁혀 불필요한 스캔을 줄인다.
 */
export function scopeStoreId(session: Session): string | null {
  return session.isHQ ? null : session.profile.store_id;
}
