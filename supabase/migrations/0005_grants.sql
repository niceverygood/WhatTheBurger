-- ============================================================================
-- 왓더버거 ERP — 0005 실행 권한 정리
--
-- PostgreSQL 은 함수를 만들 때 PUBLIC 에 EXECUTE 를 자동으로 준다.
-- 0002 에서 `revoke ... from anon` 만 했더니 PUBLIC 경유 권한이 남아
-- 로그인하지 않은 요청도 함수를 호출할 수 있었다.
-- 여기서 PUBLIC 을 걷어내고, 역할별로 필요한 것만 명시적으로 부여한다.
-- (트리거 함수는 호출자 권한 검사 대상이 아니므로 건드리지 않는다)
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.prorettype <> 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS 헬퍼
-- 정책 안에서 호출되므로 로그인 사용자가 실행할 수 있어야 한다.
-- 이게 막히면 모든 조회가 permission denied 로 떨어진다.
grant execute on function public.auth_role()           to authenticated;
grant execute on function public.auth_store_id()       to authenticated;
grant execute on function public.is_hq()               to authenticated;
grant execute on function public.can_touch_store(uuid) to authenticated;

-- ---------------------------------------------------------------- 업무 RPC
grant execute on function public.advance_order(uuid, public.order_stage, text)                       to authenticated;
grant execute on function public.create_purchase_order(uuid, jsonb, text, boolean)                   to authenticated;
grant execute on function public.adjust_store_stock(uuid, uuid, numeric, public.ledger_reason, text) to authenticated;
grant execute on function public.rotate_kiosk_token(uuid)                                            to authenticated;

-- ---------------------------------------------------------------- 집계
grant execute on function public.daily_order_series(uuid, int) to authenticated;
grant execute on function public.category_totals(uuid, date)   to authenticated;
grant execute on function public.kiosk_sales_series(uuid, int) to authenticated;
grant execute on function public.menu_ranking(uuid, int)       to authenticated;
grant execute on function public.low_store_stock(uuid)         to authenticated;
grant execute on function public.warehouse_status()            to authenticated;
grant execute on function public.dashboard_summary(uuid)       to authenticated;

-- ---------------------------------------------------------------- 서버 전용
-- 키오스크 단말은 로그인 세션이 없다. 서버 라우트가 service_role 로만 호출한다.
-- anon/authenticated 에게는 위 do 블록에서 이미 회수됐다.
grant execute on function public.kiosk_bootstrap(text)                              to service_role;
grant execute on function public.kiosk_checkout(text, jsonb, text)                  to service_role;
grant execute on function public.next_kiosk_no(uuid)                                to service_role;
grant execute on function public.next_po_no()                                       to service_role;
grant execute on function public.create_replenish_order(uuid, uuid[], public.order_source) to service_role;

-- ---------------------------------------------------------------- 테이블 권한
-- Supabase 프로젝트 기본 설정에 기대지 않고 명시적으로 정리한다.
-- RLS 는 "행"을 거르지만, 테이블 GRANT 가 없으면 애초에 조회 자체가 막힌다.
grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- 로그인하지 않은 요청(anon)은 이 스키마에서 아무것도 볼 수 없다.
-- 키오스크 단말도 브라우저에서 직접 DB 를 읽지 않고 서버 라우트를 거친다.
revoke all on all tables in schema public from anon;
