-- ============================================================================
-- 왓더버거 ERP — 0002 권한 (RLS)
--
-- 권한 모델
--   hq_admin      본사 총괄관리자 — 전 지점/전 데이터 read+write, 계정 발급
--   store_manager 지점관리자     — 본인 지점 데이터만. 마스터 데이터는 읽기 전용
--   anon          로그인 없음     — 아무것도 볼 수 없음. 키오스크는 서버 라우트를
--                                   통해 service_role 로만 접근한다.
-- ============================================================================

-- ---------------------------------------------------------------- 헬퍼
-- SECURITY DEFINER 로 profiles 를 직접 읽는다.
-- 정책 안에서 profiles 를 다시 select 하면 RLS 재귀에 빠지므로 반드시 이 함수를 쓴다.
create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.auth_store_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.store_id from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_hq()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'hq_admin'
  )
$$;

-- 지점관리자가 이 지점을 다룰 수 있는가
create or replace function public.can_touch_store(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and (p.role = 'hq_admin' or p.store_id = target)
  )
$$;

revoke execute on function public.auth_role()             from anon;
revoke execute on function public.auth_store_id()         from anon;
revoke execute on function public.is_hq()                 from anon;
revoke execute on function public.can_touch_store(uuid)   from anon;

-- ---------------------------------------------------------------- RLS on
alter table public.routes                enable row level security;
alter table public.suppliers             enable row level security;
alter table public.stores                enable row level security;
alter table public.profiles              enable row level security;
alter table public.items                 enable row level security;
alter table public.warehouse_stock       enable row level security;
alter table public.store_stock           enable row level security;
alter table public.purchase_orders       enable row level security;
alter table public.purchase_order_lines  enable row level security;
alter table public.purchase_order_events enable row level security;
alter table public.menus                 enable row level security;
alter table public.menu_bom              enable row level security;
alter table public.kiosk_orders          enable row level security;
alter table public.kiosk_order_lines     enable row level security;
alter table public.inventory_ledger      enable row level security;
alter table public.settlements           enable row level security;
alter table public.audit_log             enable row level security;

-- ---------------------------------------------------------------- 프로필
-- 본인 것은 보고, 본사는 전부 본다.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_hq());

-- 계정 생성/삭제는 서버의 service_role(Admin API)로만 한다.
-- 본사 관리자는 역할/소속/활성 상태를 바꿀 수 있다.
create policy profiles_hq_write on public.profiles for update to authenticated
  using (public.is_hq()) with check (public.is_hq());

create policy profiles_hq_delete on public.profiles for delete to authenticated
  using (public.is_hq() and id <> auth.uid());

-- 본인은 이름/연락처만 고칠 수 있다. role·store_id 변경은 아래 트리거가 막는다.
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_hq() then
    return new;
  end if;
  -- 본인 수정: 권한에 관계된 컬럼은 되돌린다.
  new.role                 := old.role;
  new.store_id             := old.store_id;
  new.is_active            := old.is_active;
  new.email                := old.email;
  new.created_by           := old.created_by;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_self_update();

-- ---------------------------------------------------------------- 마스터 데이터
-- 노선 · 공급사 · 품목 · 메뉴 · 레시피: 로그인한 사람은 읽고, 본사만 고친다.
do $$
declare t text;
begin
  foreach t in array array['routes','suppliers','items','menus','menu_bom'] loop
    execute format(
      'create policy %1$s_read on public.%1$s for select to authenticated using (true)', t);
    execute format(
      'create policy %1$s_hq_all on public.%1$s for all to authenticated using (public.is_hq()) with check (public.is_hq())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- 가맹점
create policy stores_select on public.stores for select to authenticated
  using (public.is_hq() or id = public.auth_store_id());

create policy stores_hq_write on public.stores for all to authenticated
  using (public.is_hq()) with check (public.is_hq());

-- 지점관리자는 본인 지점의 연락처 정도만 갱신한다(민감 컬럼은 트리거로 고정).
create policy stores_self_update on public.stores for update to authenticated
  using (id = public.auth_store_id()) with check (id = public.auth_store_id());

create or replace function public.guard_store_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_hq() then
    return new;
  end if;
  new.code          := old.code;
  new.credit_limit  := old.credit_limit;
  new.grade         := old.grade;
  new.status        := old.status;
  new.kiosk_token   := old.kiosk_token;
  new.route_id      := old.route_id;
  return new;
end;
$$;

create trigger stores_guard
  before update on public.stores
  for each row execute function public.guard_store_self_update();

-- ---------------------------------------------------------------- 물류센터 재고
-- 지점도 결품 여부를 알아야 발주를 판단할 수 있으므로 읽기는 허용, 쓰기는 본사만.
create policy ws_read on public.warehouse_stock for select to authenticated using (true);
create policy ws_hq_all on public.warehouse_stock for all to authenticated
  using (public.is_hq()) with check (public.is_hq());

-- ---------------------------------------------------------------- 지점 재고
create policy ss_select on public.store_stock for select to authenticated
  using (public.can_touch_store(store_id));
create policy ss_write on public.store_stock for all to authenticated
  using (public.can_touch_store(store_id)) with check (public.can_touch_store(store_id));

-- ---------------------------------------------------------------- 발주
create policy po_select on public.purchase_orders for select to authenticated
  using (public.can_touch_store(store_id));

-- 지점은 본인 지점 발주를 등록할 수 있다.
create policy po_insert on public.purchase_orders for insert to authenticated
  with check (public.can_touch_store(store_id));

-- 본사는 모든 단계를 움직일 수 있고, 지점은 '접수' 상태의 본인 발주만 손댈 수 있다.
create policy po_update on public.purchase_orders for update to authenticated
  using (public.is_hq() or (store_id = public.auth_store_id() and stage = 'received'))
  with check (public.is_hq() or store_id = public.auth_store_id());

create policy po_delete on public.purchase_orders for delete to authenticated
  using (public.is_hq());

create policy pol_select on public.purchase_order_lines for select to authenticated
  using (exists (select 1 from public.purchase_orders o
                 where o.id = order_id and public.can_touch_store(o.store_id)));

create policy pol_write on public.purchase_order_lines for all to authenticated
  using (exists (select 1 from public.purchase_orders o
                 where o.id = order_id
                   and (public.is_hq() or (o.store_id = public.auth_store_id() and o.stage = 'received'))))
  with check (exists (select 1 from public.purchase_orders o
                 where o.id = order_id
                   and (public.is_hq() or (o.store_id = public.auth_store_id() and o.stage = 'received'))));

create policy poe_select on public.purchase_order_events for select to authenticated
  using (exists (select 1 from public.purchase_orders o
                 where o.id = order_id and public.can_touch_store(o.store_id)));

create policy poe_insert on public.purchase_order_events for insert to authenticated
  with check (exists (select 1 from public.purchase_orders o
                 where o.id = order_id and public.can_touch_store(o.store_id)));

-- ---------------------------------------------------------------- 키오스크 주문
-- 쓰기는 오직 service_role(서버 라우트). 여기서는 읽기만 연다.
create policy ko_select on public.kiosk_orders for select to authenticated
  using (public.can_touch_store(store_id));

create policy kol_select on public.kiosk_order_lines for select to authenticated
  using (exists (select 1 from public.kiosk_orders k
                 where k.id = kiosk_order_id and public.can_touch_store(k.store_id)));

-- ---------------------------------------------------------------- 재고 원장
create policy led_select on public.inventory_ledger for select to authenticated
  using (store_id is null and public.is_hq() or public.can_touch_store(store_id));

create policy led_insert on public.inventory_ledger for insert to authenticated
  with check (public.can_touch_store(store_id));

-- ---------------------------------------------------------------- 정산
create policy settle_select on public.settlements for select to authenticated
  using (public.can_touch_store(store_id));

create policy settle_hq_write on public.settlements for all to authenticated
  using (public.is_hq()) with check (public.is_hq());

-- ---------------------------------------------------------------- 감사 로그
create policy audit_select on public.audit_log for select to authenticated
  using (public.is_hq() or actor_id = auth.uid());

create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor_id = auth.uid());

-- ---------------------------------------------------------------- 실시간 구독
-- ERP 대시보드가 키오스크 판매/발주/재고 변화를 즉시 받아 보게 한다.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['kiosk_orders','purchase_orders','store_stock','warehouse_stock'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- 실시간 payload 에 이전 값(old record)을 담아 재고 증감을 계산할 수 있게 한다.
alter table public.store_stock     replica identity full;
alter table public.purchase_orders replica identity full;
