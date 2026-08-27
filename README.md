# 왓더버거 ERP

버거 프랜차이즈 본사 운영 시스템. 발주 · 물류 · 정산을 관리하고,
매장 태블릿의 **키오스크와 실시간으로 연동**됩니다.

- **Next.js 15** (App Router, TypeScript)
- **Supabase** — PostgreSQL · Auth · Row Level Security · Realtime
- **Vercel** 배포

---

## 무엇이 되는가

### 1. 권한 2단계 — 본사 총괄관리자 / 지점관리자

| | 본사 총괄관리자 | 지점관리자 |
|---|---|---|
| 가맹점 | 전 지점 조회·등록·수정 | 본인 지점만 |
| 발주 | 전 지점 조회, 승인~납품 확인 전 단계 | 본인 지점 등록 / 접수 건 보류·취소 |
| 출고·배차 | ○ | — |
| 물류센터 재고 | 조회·수정 | 조회만 |
| 지점 재고 | 전 지점 | 본인 지점 |
| 정산·여신 | 전 지점 | 본인 지점 |
| 계정 관리 | ○ (발급·재발급·비활성화) | — |
| 키오스크 링크 | 전 지점 · 재발급 가능 | 본인 지점 · 사용/중지만 |

권한은 화면에서 메뉴를 숨기는 수준이 아니라 **DB의 Row Level Security로 강제**됩니다.
지점관리자가 API를 직접 호출해도 남의 지점 데이터는 한 행도 나오지 않습니다.

### 2. 가입 없음 — 총괄관리자가 계정을 발급

지점관리자는 스스로 가입할 수 없습니다.
본사 총괄관리자가 **계정 관리** 화면에서 아이디(이메일)와 초기 비밀번호를 만들고
담당 지점을 지정해 전달합니다.

- 초기 비밀번호는 자동 생성하거나 직접 지정
- 발급 직후 **한 번만** 화면에 표시 (저장하지 않음) → 이후에는 재발급만 가능
- 담당 지점 변경, 비활성화(세션 즉시 종료), 삭제 지원
- 마지막 본사 관리자 계정은 삭제할 수 없음
- 모든 계정 작업은 `audit_log`에 기록

### 3. 키오스크 — 별도 링크로 태블릿에 띄우고 ERP와 실시간 연동

지점마다 고유한 비밀 링크가 발급됩니다.

```
https://<배포주소>/kiosk/<지점별 토큰>
```

이 주소를 태블릿 브라우저에서 열면 **로그인 없이** 그 매장 전용 키오스크가 뜹니다.
(ERP의 *키오스크 연동* 화면에서 QR 코드로도 바로 연결할 수 있습니다.)

결제 한 건이 일으키는 일 — **전부 하나의 트랜잭션**:

```
태블릿 결제
  → 메뉴 레시피(BOM)대로 지점 재고 차감
  → 재고 원장 기록
  → 안전재고 아래로 처음 내려간 품목 판정
  → 자동발주 생성 (안전재고 2배까지 채우도록 구매단위로 올림)
  → 본사 발주 파이프라인에 접수
  → ERP 화면에 실시간 표시
```

중간에 실패하면 판매도 차감도 남지 않습니다.
재료가 모자라면 결제 자체가 거부되고, 부족한 품목을 알려 줍니다.

키오스크 단말에는 Supabase 키가 전혀 내려가지 않습니다.
토큰으로 서버 라우트를 부르고, 서버만 DB에 접근합니다.
금액도 클라이언트 값을 쓰지 않고 DB에서 다시 계산합니다.

---

## 설치

### 0. 필요한 것

- Node.js 20 이상
- Supabase 프로젝트 (무료 플랜으로 충분)
- Vercel 계정

### 1. 저장소 준비

```bash
git clone https://github.com/niceverygood/WhatTheBurger.git
cd WhatTheBurger
npm install
```

### 2. Supabase 프로젝트 만들기

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. 리전은 **Northeast Asia (Seoul)** 을 권장합니다.
3. 생성 후 **Project Settings → API** 에서 세 가지를 복사합니다.
   - `Project URL`
   - `anon public` 키
   - `service_role` 키 ← **서버 전용. 절대 공개 저장소나 브라우저에 넣지 마세요.**

### 3. 환경변수

```bash
cp .env.example .env.local
```

`.env.local` 을 채웁니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
NEXT_PUBLIC_SITE_URL=http://localhost:3000

SEED_HQ_EMAIL=admin@whattheburger.co.kr
SEED_HQ_PASSWORD=충분히-긴-비밀번호
```

### 4. 스키마 적용

**방법 A — Supabase CLI (권장)**

```bash
npx supabase link --project-ref <프로젝트 ref>
npx supabase db push
```

**방법 B — 대시보드 SQL Editor**

`supabase/migrations/` 의 파일을 **번호 순서대로** 실행합니다.

| 파일 | 내용 |
|---|---|
| `0001_schema.sql` | 테이블 · 인덱스 · enum |
| `0002_rls.sql` | Row Level Security 정책, 권한 승격 차단 트리거, Realtime 발행 |
| `0003_functions.sql` | 키오스크 결제 · 자동발주 · 발주 단계 이동 |
| `0004_reporting.sql` | 대시보드 집계 함수 |
| `0005_grants.sql` | 역할별 실행/테이블 권한 정리 |

> 스키마를 바꾼 뒤 PostgREST 가 새 함수를 못 찾으면
> 대시보드에서 **Settings → API → Reload schema cache** 를 눌러 주세요.

### 5. 시드 데이터

```bash
npm run seed
```

만들어지는 것:

- 배송 노선 7개, 공급사 14곳, 품목 38종
- 메뉴 21종 + 레시피(BOM)
- 가맹점 약 60개점 (전국 17개 시·도)
- 물류센터 재고 · 지점 재고
- 최근 6주 발주 이력 (요일 계절성과 성장 추세가 들어 있어 차트가 실제처럼 움직입니다)
- 당월 정산 · 여신 데이터
- **본사 총괄관리자 1명 + 지점관리자 6명**

끝나면 접속 정보와 **키오스크 데모 링크**를 출력합니다.
데모 지점은 패티 · 번 · 포장지 재고를 재주문점 바로 위에 두었기 때문에,
버거를 몇 개만 결제하면 자동발주가 실제로 생성되는 것을 볼 수 있습니다.

다시 시드하려면:

```bash
npm run seed -- --reset
```

### 6. 실행

```bash
npm run dev
```

`http://localhost:3000` → 시드가 출력한 본사 계정으로 로그인.

---

## Vercel 배포

1. Vercel 에서 **New Project → 이 저장소 Import** (Next.js 자동 인식)
2. **Environment Variables** 에 넣습니다.

   | 이름 | 값 | 노출 |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | 공개 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 키 | 공개 |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 | **서버 전용** |
   | `NEXT_PUBLIC_SITE_URL` | `https://<배포주소>` | 공개 |

   > `NEXT_PUBLIC_SITE_URL` 이 키오스크 링크와 QR 코드의 주소가 됩니다.
   > 커스텀 도메인을 붙였다면 그 주소를 넣으세요.

3. Deploy
4. Supabase 대시보드 **Authentication → URL Configuration** 에서
   Site URL 을 배포 주소로 맞춰 줍니다.

### 태블릿에 키오스크 띄우기

1. ERP 로그인 → **키오스크 연동**
2. 지점을 고르고, QR 을 태블릿으로 찍거나 링크를 복사해 전달
3. 태블릿 브라우저에서 열고 **홈 화면에 추가** → 전체화면으로 실행

링크가 유출됐다면 같은 화면에서 **링크 재발급**을 누르세요.
기존 주소는 즉시 무효가 됩니다.

---

## 구조

```
src/
  app/
    login/                로그인 (본사·지점 공통)
    (erp)/                로그인 필요. 사이드바 + 상단바 셸
      dashboard/          KPI · 발주 추이 · 재고 경고 · 실시간 이벤트
      orders/             발주 파이프라인(칸반) · 목록 · 상세 · 등록
      shipping/           노선별 출고·배차 (본사 전용)
      inventory/          물류센터 재고 / 지점 재고 · 재고 원장
      items/              품목 마스터
      settlement/         정산 · 여신
      stores/             가맹점 (본사 전용)
      kiosk-link/         키오스크 링크 · QR · 실시간 연동 로그
      accounts/           계정 관리 (본사 전용)
    kiosk/[token]/        키오스크 단말 — 로그인 없음, 태블릿 전용
    api/kiosk/[token]/    키오스크 서버 라우트 (service_role)
  components/             UI 프리미티브 · 차트 · 실시간 컴포넌트
  lib/
    supabase/             브라우저 / 서버 / service_role 클라이언트
    auth.ts               세션 · 권한 확인
    types.ts              도메인 타입 (스키마와 1:1)
    format.ts             숫자 · 날짜 표기 (Asia/Seoul)
supabase/migrations/      스키마 · RLS · 함수
scripts/seed.ts           시드
```

### 보안 설계

- **인증** — Supabase Auth (이메일 + 비밀번호). 미들웨어가 매 요청마다
  `getUser()` 로 토큰을 검증합니다. 위조된 쿠키는 통과하지 못합니다.
- **권한** — 모든 테이블에 RLS. 정책은 `is_hq()` / `auth_store_id()` 같은
  `SECURITY DEFINER` 헬퍼를 통해 판단합니다 (정책 안에서 `profiles` 를
  다시 조회하면 재귀에 빠지므로).
- **권한 승격 차단** — 지점관리자가 자기 `role` 이나 `store_id` 를 바꾸려 해도
  트리거가 원래 값으로 되돌립니다. 여신한도 · 키오스크 토큰도 마찬가지입니다.
- **anon 차단** — 로그인하지 않은 요청은 `public` 스키마의 테이블도, 함수도
  전혀 실행할 수 없습니다.
- **키오스크** — 브라우저에 Supabase 키를 내리지 않습니다. 지점 토큰으로
  서버 라우트를 호출하고, 서버가 `service_role` 로 DB 함수를 실행합니다.
  가격은 클라이언트 값을 무시하고 DB 에서 다시 계산합니다.
- **service_role 키** — 계정 발급과 키오스크에만 씁니다. 나머지 조회는 전부
  사용자 세션으로 하여 RLS 검증을 받습니다.

### 발주 단계

```
접수 → 승인 → 피킹 → 출고 → 배송중 → 완료
                └ 보류 / 취소
```

- **승인** 시 물류센터 재고에 할당(`allocated`)이 잡힙니다.
- **출고** 시 할당분이 실물 재고에서 빠집니다.
- **완료** 시 지점 재고가 늘고 원장에 기록됩니다.
- **보류/취소** 시 잡아 둔 할당이 풀립니다.

각 단계 이동은 `purchase_order_events` 에 누가 언제 왜 옮겼는지 남습니다.

---

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | ESLint |
| `npm run seed` | 시드 데이터 생성 |
| `npm run seed -- --reset` | 기존 운영 데이터를 지우고 다시 시드 |

## 운영 전 체크리스트

- [ ] 시드가 만든 계정의 비밀번호를 전부 바꿨는가
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 가 저장소·브라우저에 노출되지 않았는가
- [ ] `NEXT_PUBLIC_SITE_URL` 이 실제 배포 주소인가 (키오스크 링크가 여기서 만들어짐)
- [ ] Supabase Auth 의 Site URL 을 배포 주소로 맞췄는가
- [ ] 지점별 키오스크 링크를 안전한 경로로 전달했는가
- [ ] 각 가맹점에 담당 지점관리자를 배정했는가 (*가맹점* 화면의 "담당자 미지정" 확인)
