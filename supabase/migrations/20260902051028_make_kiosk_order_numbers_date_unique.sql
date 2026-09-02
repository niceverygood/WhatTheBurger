-- 키오스크 주문번호는 지점별 UNIQUE 이므로 일련번호를 매일 A0001부터
-- 다시 시작하면 전날 주문과 충돌한다. 날짜를 번호에 포함하고, 삭제된 주문이
-- 있더라도 다음 번호가 재사용되지 않도록 해당 날짜의 최댓값을 기준으로 채번한다.
create or replace function public.next_kiosk_no(p_store uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_prefix text := 'A' || to_char(v_today, 'YYMMDD') || '-';
  v_seq    int;
begin
  -- 같은 지점의 동시 결제를 직렬화해 번호 충돌을 막는다.
  perform pg_advisory_xact_lock(hashtext('kiosk:' || p_store::text));

  select coalesce(max(substring(ko.order_no from length(v_prefix) + 1)::int), 0) + 1
    into v_seq
    from public.kiosk_orders ko
   where ko.store_id = p_store
     and ko.order_no ~ ('^' || v_prefix || '[0-9]+$');

  return v_prefix || lpad(v_seq::text, 4, '0');
end;
$$;

revoke all on function public.next_kiosk_no(uuid) from public, anon, authenticated;
