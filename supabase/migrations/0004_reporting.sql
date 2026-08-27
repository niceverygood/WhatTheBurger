-- ============================================================================
-- 왓더버거 ERP — 0004 집계
--
-- 전부 SECURITY INVOKER(기본값)다. 호출한 사람의 권한으로 실행되므로
-- 지점관리자가 부르면 RLS 가 자동으로 본인 지점만 남긴다.
-- ============================================================================

-- 최근 N 영업일 발주 추이 (일요일 제외)
create or replace function public.daily_order_series(p_store uuid default null, p_days int default 14)
returns table (d date, amount bigint, cnt int)
language sql
stable
as $$
  with days as (
    select gs::date as d
      from generate_series(
        (now() at time zone 'Asia/Seoul')::date - (p_days * 2),
        (now() at time zone 'Asia/Seoul')::date,
        interval '1 day') gs
     where extract(dow from gs) <> 0
     order by gs desc
     limit p_days
  )
  select days.d,
         coalesce(sum(o.total_amount), 0)::bigint,
         count(o.id)::int
    from days
    left join public.purchase_orders o
      on o.ordered_at = days.d
     and o.stage <> 'canceled'
     and (p_store is null or o.store_id = p_store)
   group by days.d
   order by days.d;
$$;

-- 카테고리별 발주 누계
create or replace function public.category_totals(p_store uuid default null, p_from date default null)
returns table (category text, amount bigint, qty bigint)
language sql
stable
as $$
  select i.category,
         coalesce(sum(l.amount), 0)::bigint,
         coalesce(sum(l.qty), 0)::bigint
    from public.purchase_order_lines l
    join public.purchase_orders o on o.id = l.order_id
    join public.items i on i.id = l.item_id
   where o.stage <> 'canceled'
     and o.ordered_at >= coalesce(p_from, date_trunc('month', (now() at time zone 'Asia/Seoul'))::date)
     and (p_store is null or o.store_id = p_store)
   group by i.category
   order by 2 desc;
$$;

-- 최근 N일 키오스크 매출 추이
create or replace function public.kiosk_sales_series(p_store uuid default null, p_days int default 14)
returns table (d date, amount bigint, cnt int)
language sql
stable
as $$
  with days as (
    select gs::date as d
      from generate_series(
        (now() at time zone 'Asia/Seoul')::date - (p_days - 1),
        (now() at time zone 'Asia/Seoul')::date,
        interval '1 day') gs
  )
  select days.d,
         coalesce(sum(k.total), 0)::bigint,
         count(k.id)::int
    from days
    left join public.kiosk_orders k
      on (k.paid_at at time zone 'Asia/Seoul')::date = days.d
     and k.status = 'paid'
     and (p_store is null or k.store_id = p_store)
   group by days.d
   order by days.d;
$$;

-- 메뉴별 판매 순위
create or replace function public.menu_ranking(p_store uuid default null, p_days int default 7)
returns table (menu_name text, qty bigint, amount bigint)
language sql
stable
as $$
  select l.menu_name,
         sum(l.qty)::bigint,
         sum(l.amount)::bigint
    from public.kiosk_order_lines l
    join public.kiosk_orders k on k.id = l.kiosk_order_id
   where k.status = 'paid'
     and k.paid_at >= now() - (p_days || ' days')::interval
     and (p_store is null or k.store_id = p_store)
   group by l.menu_name
   order by 2 desc
   limit 12;
$$;

-- 안전재고 미달 지점 재고 (컬럼 간 비교라 SQL 로 뽑는다)
create or replace function public.low_store_stock(p_store uuid default null)
returns table (
  store_id uuid, store_name text, item_id uuid, sku text, item_name text,
  category text, on_hand numeric, safety_stock numeric, daily_usage numeric, ratio numeric
)
language sql
stable
as $$
  select ss.store_id, s.name, ss.item_id, i.sku, i.name, i.category,
         ss.on_hand, ss.safety_stock, ss.daily_usage,
         case when ss.safety_stock > 0 then round(ss.on_hand / ss.safety_stock, 3) else null end
    from public.store_stock ss
    join public.items i on i.id = ss.item_id
    join public.stores s on s.id = ss.store_id
   where ss.safety_stock > 0
     and ss.on_hand <= ss.safety_stock
     and (p_store is null or ss.store_id = p_store)
   order by (ss.on_hand / nullif(ss.safety_stock, 0)) asc
   limit 200;
$$;

-- 물류센터 재고 현황 (가용 = 실물 - 할당)
create or replace function public.warehouse_status()
returns table (
  item_id uuid, sku text, item_name text, category text, unit text,
  on_hand int, allocated int, available int, safety_stock int, ratio numeric,
  supplier text, price bigint
)
language sql
stable
as $$
  select w.item_id, i.sku, i.name, i.category, i.unit,
         w.on_hand, w.allocated, (w.on_hand - w.allocated) as available, w.safety_stock,
         case when w.safety_stock > 0
              then round((w.on_hand - w.allocated)::numeric / w.safety_stock, 3) else null end,
         sp.name, i.price
    from public.warehouse_stock w
    join public.items i on i.id = w.item_id
    left join public.suppliers sp on sp.id = i.supplier_id
   where i.is_active
   order by (w.on_hand - w.allocated)::numeric / nullif(w.safety_stock, 0) asc nulls last;
$$;

-- 대시보드 요약
create or replace function public.dashboard_summary(p_store uuid default null)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'today_orders', (
      select jsonb_build_object('cnt', count(*), 'amount', coalesce(sum(total_amount), 0))
        from public.purchase_orders
       where ordered_at = (now() at time zone 'Asia/Seoul')::date
         and stage <> 'canceled'
         and (p_store is null or store_id = p_store)),
    'yesterday_orders', (
      select jsonb_build_object('cnt', count(*), 'amount', coalesce(sum(total_amount), 0))
        from public.purchase_orders
       where ordered_at = (now() at time zone 'Asia/Seoul')::date - 1
         and stage <> 'canceled'
         and (p_store is null or store_id = p_store)),
    'open', (
      select jsonb_build_object(
               'total', count(*),
               'received', count(*) filter (where stage = 'received'),
               'in_transit', count(*) filter (where stage in ('shipped', 'delivering')),
               'urgent', count(*) filter (where is_urgent),
               'auto', count(*) filter (where source = 'kiosk_auto'))
        from public.purchase_orders
       where stage not in ('done', 'canceled')
         and (p_store is null or store_id = p_store)),
    'receivable', (
      select jsonb_build_object(
               'carry', coalesce(sum(carry_amount), 0),
               'mtd', coalesce(sum(mtd_amount), 0),
               'overdue_stores', count(*) filter (where overdue_days > 0))
        from public.settlements
       where period = date_trunc('month', (now() at time zone 'Asia/Seoul'))::date
         and (p_store is null or store_id = p_store)),
    'kiosk_today', (
      select jsonb_build_object(
               'sales', coalesce(sum(total), 0),
               'cnt', count(*),
               'avg', case when count(*) = 0 then 0
                      else round(coalesce(sum(total), 0)::numeric / count(*)) end)
        from public.kiosk_orders
       where status = 'paid'
         and (paid_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
         and (p_store is null or store_id = p_store))
  );
$$;

grant execute on function public.daily_order_series(uuid, int)  to authenticated;
grant execute on function public.category_totals(uuid, date)    to authenticated;
grant execute on function public.kiosk_sales_series(uuid, int)  to authenticated;
grant execute on function public.menu_ranking(uuid, int)        to authenticated;
grant execute on function public.low_store_stock(uuid)          to authenticated;
grant execute on function public.warehouse_status()             to authenticated;
grant execute on function public.dashboard_summary(uuid)        to authenticated;
