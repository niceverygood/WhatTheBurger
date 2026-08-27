import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * service_role 클라이언트 — RLS 를 우회한다.
 *
 * 반드시 서버에서만, 그리고 아래 두 경우에만 쓴다.
 *   1) 총괄관리자의 계정 발급/삭제 (Auth Admin API)
 *   2) 키오스크 단말 (로그인 세션이 없으므로 토큰으로만 신원을 확인)
 * 그 외 조회는 전부 사용자 세션 클라이언트를 써서 RLS 로 검증받는다.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다. Vercel 환경변수를 확인하세요.',
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
