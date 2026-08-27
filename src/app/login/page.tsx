import type { Metadata } from 'next';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: '로그인 · 왓더버거 ERP' };

const POINTS = [
  ['전 지점 발주·출고·정산을 한 화면에서', '본사 총괄관리자'],
  ['우리 지점 발주와 재고만 정확하게', '지점관리자'],
  ['판매가 곧 재고 차감, 결품 전에 자동발주', '키오스크 실시간 연동'],
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = next && next.startsWith('/') ? next : '/dashboard';

  return (
    <div className="auth-wrap">
      <aside className="auth-side">
        <div>
          <div className="brand-mark">
            WHAT THE<em>BURGER</em>
          </div>
          <div className="brand-sub">ENTERPRISE RESOURCE PLANNING</div>
          <div className="checker" />
        </div>

        <div>
          <h1 className="auth-lede">
            매장에서 팔린 버거 하나가<br />
            <span>본사 재고까지</span> 바로 이어집니다.
          </h1>
          <div className="auth-points">
            {POINTS.map(([text, who]) => (
              <div className="auth-point" key={who}>
                <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9.5l4 4L15 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>
                  <b>{who}</b> — {text}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 11, color: '#6E675E', lineHeight: 1.7 }}>
          계정은 본사 총괄관리자가 발급합니다.<br />
          접속에 문제가 있으면 본사 운영팀으로 연락해 주세요.
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h2 className="auth-h">운영 시스템 로그인</h2>
          <p className="auth-s">
            본사 총괄관리자와 지점관리자 모두 이 화면에서 로그인합니다.<br />
            권한에 따라 보이는 메뉴와 데이터가 달라집니다.
          </p>

          <LoginForm next={target} />

          <div className="auth-foot">
            비밀번호를 잊으셨나요? 본사 총괄관리자가 <b>계정 관리</b> 화면에서
            새 비밀번호를 재발급해 드립니다. 키오스크 단말은 로그인 없이
            지점별 전용 링크로 접속합니다.
          </div>
        </div>
      </main>
    </div>
  );
}
