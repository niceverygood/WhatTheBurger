import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** 세션이 필요 없는 경로 — 키오스크 단말은 로그인하지 않는다. */
function isPublic(path: string) {
  return (
    path.startsWith('/login') ||
    path.startsWith('/kiosk') ||
    path.startsWith('/api/kiosk') ||
    path.startsWith('/auth')
  );
}

/** 요청마다 세션 쿠키를 갱신하고, 로그인하지 않은 접근을 로그인 화면으로 돌린다. */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 키오스크 태블릿은 세션이 없다. 결제할 때마다 Auth 서버를 왕복할 이유가 없으므로
  // 로그인 화면을 제외한 공개 경로는 인증 조회 없이 그대로 통과시킨다.
  if (isPublic(path) && !path.startsWith('/login')) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() 는 매번 Auth 서버에 토큰을 검증시킨다. getSession() 과 달리 위조가 통하지 않는다.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && !isPublic(path)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (user && path === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
