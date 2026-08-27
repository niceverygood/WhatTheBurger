-- ============================================================================
-- 왓더버거 ERP — 0001 스키마
-- 본사(HQ) 총괄관리자 / 지점(Store) 관리자 2단계 권한 구조를 전제로 한다.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- enum
create type public.user_role       as enum ('hq_admin', 'store_manager');
create type public.store_status    as enum ('operating', 'suspended', 'closed');
create type public.store_grade     as enum ('franchise', 'direct');
create type public.temp_zone       as enum ('frozen', 'cold', 'ambient');
create type public.order_stage     as enum ('received', 'approved', 'picking', 'shipped', 'delivering', 'done', 'hold', 'canceled');
create type public.order_source    as enum ('manual', 'kiosk_auto', 'ai_replenish');
create type public.kiosk_status    as enum ('paid', 'canceled');
create type public.ledger_reason   as enum ('kiosk_sale', 'po_receive', 'adjust', 'waste', 'opening');

-- ---------------------------------------------------------------- 배송 노선
create table public.routes (
  id            text primary key,
  name          text not null,
  driver_name   text,
  vehicle       text,
  sort          int  not null default 0
);

-- ---------------------------------------------------------------- 공급사
create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  contact     text,
  lead_days   int  not null default 2,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- 가맹점
create table public.stores (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name           text not null,
  sido           text not null,
  district       text,
  route_id       text references public.routes(id) on delete set null,
  grade          public.store_grade  not null default 'franchise',
  status         public.store_status not null default 'operating',
  manager_name   text,
  tel            text,
  address        text,
  opened_at      date,
  credit_limit   bigint not null default 0,
  -- 키오스크 단말이 로그인 없이 접속하는 비밀 경로. 유출 시 재발급한다.
  kiosk_token    text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  kiosk_enabled  boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index stores_route_idx  on public.stores (route_id);
create index stores_status_idx on public.stores (status);
create index stores_sido_idx   on public.stores (sido);

-- ---------------------------------------------------------------- 사용자 프로필
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null,
  full_name            text not null,
  role                 public.user_role not null default 'store_manager',
  store_id             uuid references public.stores(id) on delete set null,
  phone                text,
  is_active            boolean not null default true,
  must_change_password boolean not null default true,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  last_login_at        timestamptz,
  -- 지점관리자는 반드시 담당 지점이 있어야 하고, 총괄관리자는 지점에 매이지 않는다.
  constraint profiles_role_store_ck check (
    (role = 'store_manager' and store_id is not null) or
    (role = 'hq_admin'      and store_id is null)
  )
);
create index profiles_store_idx on public.profiles (store_id);
create index profiles_role_idx  on public.profiles (role);

-- ---------------------------------------------------------------- 품목 마스터
create table public.items (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null unique,
  name          text not null,
  category      text not null,
  unit          text not null,               -- BOX(40ea)
  ea_per_unit   int  not null default 1,     -- 구매단위당 낱개 수
  price         bigint not null,             -- 가맹점 공급가
  cost          bigint not null,             -- 본사 매입원가
  temp          public.temp_zone not null default 'ambient',
  supplier_id   uuid references public.suppliers(id) on delete set null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index items_category_idx on public.items (category);
create index items_supplier_idx on public.items (supplier_id);

-- ---------------------------------------------------------------- 물류센터 재고
create table public.warehouse_stock (
  item_id       uuid primary key references public.items(id) on delete cascade,
  on_hand       int not null default 0,      -- 실물 재고
  allocated     int not null default 0,      -- 승인된 발주에 할당된 수량
  safety_stock  int not null default 0,
  updated_at    timestamptz not null default now(),
  constraint warehouse_stock_nonneg_ck check (on_hand >= 0 and allocated >= 0)
);

-- ---------------------------------------------------------------- 지점 재고
create table public.store_stock (
  store_id      uuid not null references public.stores(id) on delete cascade,
  item_id       uuid not null references public.items(id) on delete cascade,
  on_hand       numeric(12,2) not null default 0,   -- 낱개(ea) 기준
  safety_stock  numeric(12,2) not null default 0,
  daily_usage   numeric(12,2) not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (store_id, item_id),
  constraint store_stock_nonneg_ck check (on_hand >= 0)
);
create index store_stock_item_idx on public.store_stock (item_id);

-- ---------------------------------------------------------------- 발주
create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      text not null unique,
  store_id      uuid not null references public.stores(id) on delete restrict,
  route_id      text references public.routes(id) on delete set null,
  stage         public.order_stage  not null default 'received',
  source        public.order_source not null default 'manual',
  is_urgent     boolean not null default false,
  ordered_at    date not null default (now() at time zone 'Asia/Seoul')::date,
  ordered_ts    timestamptz not null default now(),
  due_date      date,
  total_amount  bigint not null default 0,
  memo          text,
  driver_name   text,
  created_by    uuid references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now()
);
create index po_store_idx  on public.purchase_orders (store_id);
create index po_stage_idx  on public.purchase_orders (stage);
create index po_date_idx   on public.purchase_orders (ordered_at desc);
create index po_route_idx  on public.purchase_orders (route_id);

create table public.purchase_order_lines (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.purchase_orders(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete restrict,
  qty         int    not null check (qty > 0),
  unit_price  bigint not null,
  amount      bigint not null,
  unique (order_id, item_id)
);
create index pol_order_idx on public.purchase_order_lines (order_id);
create index pol_item_idx  on public.purchase_order_lines (item_id);

create table public.purchase_order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.purchase_orders(id) on delete cascade,
  stage       public.order_stage not null,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_name  text,
  note        text,
  created_at  timestamptz not null default now()
);
create index poe_order_idx on public.purchase_order_events (order_id, created_at);

-- ---------------------------------------------------------------- 메뉴 · 레시피
create table public.menus (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- B1, S1, C1
  category    text not null,                 -- 버거 / 사이드 / 음료 / 세트
  name        text not null,
  price       bigint not null,
  emoji       text not null default '🍔',
  sort        int not null default 0,
  is_active   boolean not null default true
);

-- 메뉴 1개를 만들 때 소모되는 품목 수량(BOM). 키오스크 결제 시 이 표대로 재고를 깎는다.
create table public.menu_bom (
  menu_id   uuid not null references public.menus(id) on delete cascade,
  item_id   uuid not null references public.items(id) on delete restrict,
  qty       numeric(10,3) not null check (qty > 0),
  primary key (menu_id, item_id)
);

-- ---------------------------------------------------------------- 키오스크 주문
create table public.kiosk_orders (
  id          uuid primary key default gen_random_uuid(),
  order_no    text not null,
  store_id    uuid not null references public.stores(id) on delete cascade,
  total       bigint not null,
  item_count  int not null,
  status      public.kiosk_status not null default 'paid',
  order_type  text not null default 'dine_in',   -- dine_in | takeout
  paid_at     timestamptz not null default now(),
  unique (store_id, order_no)
);
create index ko_store_time_idx on public.kiosk_orders (store_id, paid_at desc);
create index ko_time_idx       on public.kiosk_orders (paid_at desc);

create table public.kiosk_order_lines (
  id             uuid primary key default gen_random_uuid(),
  kiosk_order_id uuid not null references public.kiosk_orders(id) on delete cascade,
  menu_id        uuid not null references public.menus(id) on delete restrict,
  menu_name      text not null,
  qty            int not null check (qty > 0),
  unit_price     bigint not null,
  amount         bigint not null
);
create index kol_order_idx on public.kiosk_order_lines (kiosk_order_id);

-- ---------------------------------------------------------------- 재고 원장
create table public.inventory_ledger (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid references public.stores(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete cascade,
  delta       numeric(12,2) not null,
  balance     numeric(12,2) not null,
  reason      public.ledger_reason not null,
  ref_type    text,
  ref_id      uuid,
  actor_id    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index led_store_time_idx on public.inventory_ledger (store_id, created_at desc);
create index led_item_idx       on public.inventory_ledger (item_id, created_at desc);

-- ---------------------------------------------------------------- 정산 · 여신
create table public.settlements (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references public.stores(id) on delete cascade,
  period        date not null,                -- 해당 월 1일
  prev_amount   bigint not null default 0,    -- 전월 청구액
  paid_amount   bigint not null default 0,    -- 전월 입금액
  carry_amount  bigint not null default 0,    -- 이월 미납
  mtd_amount    bigint not null default 0,    -- 당월 누계 매입
  overdue_days  int    not null default 0,
  tax_status    text   not null default 'pending',  -- issued | pending | hold
  due_date      date,
  updated_at    timestamptz not null default now(),
  unique (store_id, period)
);
create index settle_period_idx on public.settlements (period desc);

-- ---------------------------------------------------------------- 감사 로그
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id) on delete set null,
  actor_name  text,
  action      text not null,
  entity      text,
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index audit_time_idx on public.audit_log (created_at desc);

-- ---------------------------------------------------------------- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger stores_touch    before update on public.stores          for each row execute function public.touch_updated_at();
create trigger po_touch        before update on public.purchase_orders for each row execute function public.touch_updated_at();
create trigger ss_touch        before update on public.store_stock     for each row execute function public.touch_updated_at();
create trigger ws_touch        before update on public.warehouse_stock for each row execute function public.touch_updated_at();
create trigger settle_touch    before update on public.settlements     for each row execute function public.touch_updated_at();
