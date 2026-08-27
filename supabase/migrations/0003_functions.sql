-- ============================================================================
-- 왓더버거 ERP — 0003 업무 로직
--
-- 키오스크 결제 → 레시피(BOM) 차감 → 안전재고 판정 → 자동발주 까지를
-- 하나의 트랜잭션 안에서 처리한다. 중간에 실패하면 판매도 차감도 남지 않는다.
-- ============================================================================

-- ---------------------------------------------------------------- 채번
-- 같은 지점의 동시 결제를 직렬화해 번호 충돌을 막는다.
create or replace function public.next_kiosk_no(p_store uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_seq   int;
begin
  perform pg_advisory_xact_lock(hashtext('kiosk:' || p_store::text));
  select count(*) + 1 into v_seq
    from public.kiosk_orders
   where store_id = p_store
     and (paid_at at time zone 'Asia/Seoul')::date = v_today;
  return 'A' || lpad(v_seq::text, 4, '0');
end;
$$;

create or replace function public.next_po_no()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_seq   int;
begin
  perform pg_advisory_xact_lock(hashtext('po:' || v_today::text));
  select count(*) + 1 into v_seq
    from public.purchase_orders
   where ordered_at = v_today;
  return 'PO' || to_char(v_today, 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------- 자동발주
-- 안전재고를 깨뜨린 품목을 모아 '자동발주' 한 건을 만든다.
-- 목표 재고는 안전재고의 2배(약 3일치)이고, 발주 수량은 구매단위로 올림한다.
create or replace function public.create_replenish_order(
  p_store uuid,
  p_items uuid[],
  p_source public.order_source default 'kiosk_auto'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_no       text;
  v_route    text;
  v_total    bigint := 0;
  r          record;
  v_qty      int;
begin
  if p_items is null or array_length(p_items, 1) is null then
    return null;
  end if;

  select route_id into v_route from public.stores where id = p_store;
  v_no := public.next_po_no();

  insert into public.purchase_orders (order_no, store_id, route_id, stage, source, is_urgent, due_date, memo)
  values (v_no, p_store, v_route, 'received', p_source, true,
          ((now() at time zone 'Asia/Seoul')::date + 1),
          '안전재고 미달 자동 감지 — 시스템 발주')
  returning id into v_order_id;

  for r in
    select i.id as item_id, i.price, greatest(i.ea_per_unit, 1) as ea,
           ss.on_hand, ss.safety_stock
      from public.store_stock ss
      join public.items i on i.id = ss.item_id
     where ss.store_id = p_store
       and ss.item_id = any(p_items)
  loop
    -- 목표(안전재고 ×2)까지 채우는 데 필요한 낱개 수 → 구매단위로 올림
    v_qty := greatest(1, ceil((r.safety_stock * 2 - r.on_hand) / r.ea)::int);
    insert into public.purchase_order_lines (order_id, item_id, qty, unit_price, amount)
    values (v_order_id, r.item_id, v_qty, r.price, v_qty * r.price);
    v_total := v_total + v_qty * r.price;
  end loop;

  if v_total = 0 then
    delete from public.purchase_orders where id = v_order_id;
    return null;
  end if;

  update public.purchase_orders set total_amount = v_total where id = v_order_id;

  insert into public.purchase_order_events (order_id, stage, actor_name, note)
  values (v_order_id, 'received', 'SYSTEM', '키오스크 판매로 안전재고 미달 감지 — 자동 발주 생성');

  return v_order_id;
end;
$$;

-- ---------------------------------------------------------------- 키오스크 부트스트랩
-- 태블릿이 토큰으로 접속했을 때 필요한 모든 것을 한 번에 내려준다.
create or replace function public.kiosk_bootstrap(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_store  record;
  v_menus  jsonb;
  v_stats  jsonb;
  v_recent jsonb;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
begin
  select s.id, s.code, s.name, s.kiosk_enabled, s.status
    into v_store
    from public.stores s
   where s.kiosk_token = p_token;

  if v_store.id is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN');
  end if;
  if not v_store.kiosk_enabled or v_store.status <> 'operating' then
    return jsonb_build_object('ok', false, 'error', 'KIOSK_DISABLED',
                              'store', jsonb_build_object('name', v_store.name));
  end if;

  -- 메뉴별로 지금 재고로 몇 개까지 만들 수 있는지 계산한다.
  select coalesce(jsonb_agg(m order by m.sort), '[]'::jsonb) into v_menus
  from (
    select mn.id, mn.code, mn.category, mn.name, mn.price, mn.emoji, mn.sort,
           coalesce((
             select floor(min(ss.on_hand / b.qty))
               from public.menu_bom b
               left join public.store_stock ss
                 on ss.item_id = b.item_id and ss.store_id = v_store.id
              where b.menu_id = mn.id
           ), 0)::int as servable
      from public.menus mn
     where mn.is_active
  ) m;

  select jsonb_build_object(
           'sales', coalesce(sum(total), 0),
           'count', count(*),
           'avg',   case when count(*) = 0 then 0 else round(coalesce(sum(total),0)::numeric / count(*)) end
         ) into v_stats
    from public.kiosk_orders
   where store_id = v_store.id
     and status = 'paid'
     and (paid_at at time zone 'Asia/Seoul')::date = v_today;

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_no', order_no, 'total', total, 'paid_at', paid_at
         ) order by paid_at desc), '[]'::jsonb) into v_recent
    from (select order_no, total, paid_at from public.kiosk_orders
           where store_id = v_store.id and status = 'paid'
           order by paid_at desc limit 8) t;

  return jsonb_build_object(
    'ok', true,
    'store', jsonb_build_object('id', v_store.id, 'code', v_store.code, 'name', v_store.name),
    'menus', v_menus,
    'stats', v_stats,
    'recent', v_recent
  );
end;
$$;

-- ---------------------------------------------------------------- 키오스크 결제
-- 반환: { ok, order_no, total, deducted[], crossed[], auto_order }
create or replace function public.kiosk_checkout(
  p_token      text,
  p_lines      jsonb,
  p_order_type text default 'dine_in'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_store    record;
  v_order_id uuid;
  v_no       text;
  v_total    bigint := 0;
  v_count    int := 0;
  v_crossed  uuid[] := '{}';
  v_auto     uuid;
  v_auto_no  text;
  r          record;
  v_new      numeric;
  v_short    jsonb := '[]'::jsonb;
  v_deducted jsonb := '[]'::jsonb;
begin
  if p_order_type not in ('dine_in', 'takeout') then
    p_order_type := 'dine_in';
  end if;

  select s.id, s.code, s.name, s.kiosk_enabled, s.status
    into v_store
    from public.stores s
   where s.kiosk_token = p_token;

  if v_store.id is null then
    return jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN');
  end if;
  if not v_store.kiosk_enabled or v_store.status <> 'operating' then
    return jsonb_build_object('ok', false, 'error', 'KIOSK_DISABLED');
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'error', 'EMPTY_CART');
  end if;

  -- 요청 라인을 정규화한다. 가격은 클라이언트 값을 절대 믿지 않고 DB에서 다시 읽는다.
  create temporary table _cart on commit drop as
  select mn.id as menu_id, mn.name, mn.price, sum(l.qty)::int as qty
    from jsonb_to_recordset(p_lines) as l(menu_id uuid, qty int)
    join public.menus mn on mn.id = l.menu_id and mn.is_active
   where l.qty > 0
   group by mn.id, mn.name, mn.price;

  if (select count(*) from _cart) = 0 then
    return jsonb_build_object('ok', false, 'error', 'NO_VALID_ITEMS');
  end if;

  select coalesce(sum(price * qty), 0), coalesce(sum(qty), 0)
    into v_total, v_count from _cart;

  -- 필요한 품목 소요량을 합산한다.
  create temporary table _need on commit drop as
  select b.item_id, sum(b.qty * c.qty)::numeric(12,2) as need
    from _cart c
    join public.menu_bom b on b.menu_id = c.menu_id
   group by b.item_id;

  -- 재고 행을 item_id 순으로 잠근다(교착 방지). 없는 행은 0으로 만든다.
  insert into public.store_stock (store_id, item_id, on_hand, safety_stock, daily_usage)
  select v_store.id, n.item_id, 0, 0, 0
    from _need n
   where not exists (
     select 1 from public.store_stock ss
      where ss.store_id = v_store.id and ss.item_id = n.item_id);

  perform 1
     from public.store_stock ss
     join _need n on n.item_id = ss.item_id
    where ss.store_id = v_store.id
    order by ss.item_id
      for update;

  -- 재고 부족 검사
  select coalesce(jsonb_agg(jsonb_build_object(
           'sku', i.sku, 'name', i.name, 'need', n.need, 'have', ss.on_hand)), '[]'::jsonb)
    into v_short
    from _need n
    join public.store_stock ss on ss.store_id = v_store.id and ss.item_id = n.item_id
    join public.items i on i.id = n.item_id
   where ss.on_hand < n.need;

  if jsonb_array_length(v_short) > 0 then
    return jsonb_build_object('ok', false, 'error', 'OUT_OF_STOCK', 'shortages', v_short);
  end if;

  v_no := public.next_kiosk_no(v_store.id);

  insert into public.kiosk_orders (order_no, store_id, total, item_count, order_type)
  values (v_no, v_store.id, v_total, v_count, p_order_type)
  returning id into v_order_id;

  insert into public.kiosk_order_lines (kiosk_order_id, menu_id, menu_name, qty, unit_price, amount)
  select v_order_id, c.menu_id, c.name, c.qty, c.price, c.price * c.qty from _cart c;

  -- 차감 + 원장 기록 + 안전재고 교차 판정
  for r in
    select n.item_id, n.need, ss.on_hand, ss.safety_stock, i.sku, i.name
      from _need n
      join public.store_stock ss on ss.store_id = v_store.id and ss.item_id = n.item_id
      join public.items i on i.id = n.item_id
     order by n.item_id
  loop
    v_new := r.on_hand - r.need;

    update public.store_stock
       set on_hand = v_new
     where store_id = v_store.id and item_id = r.item_id;

    insert into public.inventory_ledger (store_id, item_id, delta, balance, reason, ref_type, ref_id)
    values (v_store.id, r.item_id, -r.need, v_new, 'kiosk_sale', 'kiosk_order', v_order_id);

    v_deducted := v_deducted || jsonb_build_object(
      'sku', r.sku, 'name', r.name, 'used', r.need, 'left', v_new, 'safety', r.safety_stock);

    -- 이번 판매로 처음 안전재고 아래로 내려간 품목만 자동발주 대상이다.
    if r.safety_stock > 0 and r.on_hand >= r.safety_stock and v_new < r.safety_stock then
      v_crossed := v_crossed || r.item_id;
    end if;
  end loop;

  if array_length(v_crossed, 1) > 0 then
    v_auto := public.create_replenish_order(v_store.id, v_crossed, 'kiosk_auto');
    if v_auto is not null then
      select order_no into v_auto_no from public.purchase_orders where id = v_auto;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'order_no', v_no,
    'order_id', v_order_id,
    'total', v_total,
    'item_count', v_count,
    'deducted', v_deducted,
    'crossed', (select coalesce(jsonb_agg(jsonb_build_object(
                  'sku', i.sku, 'name', i.name,
                  'left', ss.on_hand, 'safety', ss.safety_stock)), '[]'::jsonb)
                  from public.items i
                  join public.store_stock ss on ss.item_id = i.id and ss.store_id = v_store.id
                 where i.id = any(v_crossed)),
    'auto_order', case when v_auto is null then null
                  else jsonb_build_object('id', v_auto, 'order_no', v_auto_no) end
  );
end;
$$;

-- ---------------------------------------------------------------- 발주 단계 이동
create or replace function public.advance_order(
  p_order uuid,
  p_stage public.order_stage,
  p_note  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_o     record;
  v_actor text;
  v_role  public.user_role;
  r       record;
begin
  select role into v_role from public.profiles where id = auth.uid() and is_active;
  if v_role is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_o from public.purchase_orders where id = p_order for update;
  if v_o.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 지점관리자는 본인 지점의 '접수' 건을 보류/취소만 할 수 있다.
  if v_role = 'store_manager' then
    if v_o.store_id <> (select store_id from public.profiles where id = auth.uid()) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if v_o.stage <> 'received' or p_stage not in ('hold', 'canceled') then
      raise exception 'FORBIDDEN_TRANSITION' using errcode = '42501';
    end if;
  end if;

  if v_o.stage = p_stage then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;
  if v_o.stage in ('done', 'canceled') then
    raise exception 'ORDER_CLOSED' using errcode = '22023';
  end if;

  -- 승인: 물류센터 재고를 할당한다.
  if p_stage = 'approved' and v_o.stage = 'received' then
    for r in select item_id, qty from public.purchase_order_lines where order_id = p_order loop
      insert into public.warehouse_stock (item_id, on_hand, allocated)
      values (r.item_id, 0, 0)
      on conflict (item_id) do nothing;

      update public.warehouse_stock
         set allocated = allocated + r.qty
       where item_id = r.item_id;
    end loop;
  end if;

  -- 출고: 할당을 실물 재고에서 덜어낸다.
  if p_stage = 'shipped' and v_o.stage in ('approved', 'picking') then
    for r in select item_id, qty from public.purchase_order_lines where order_id = p_order loop
      update public.warehouse_stock
         set on_hand   = greatest(0, on_hand - r.qty),
             allocated = greatest(0, allocated - r.qty)
       where item_id = r.item_id;
    end loop;
  end if;

  -- 납품 확인: 지점 재고를 채우고 원장에 남긴다.
  if p_stage = 'done' then
    for r in
      select l.item_id, l.qty, greatest(i.ea_per_unit, 1) as ea
        from public.purchase_order_lines l
        join public.items i on i.id = l.item_id
       where l.order_id = p_order
       order by l.item_id
    loop
      insert into public.store_stock (store_id, item_id, on_hand, safety_stock, daily_usage)
      values (v_o.store_id, r.item_id, 0, 0, 0)
      on conflict (store_id, item_id) do nothing;

      update public.store_stock
         set on_hand = on_hand + r.qty * r.ea
       where store_id = v_o.store_id and item_id = r.item_id;

      insert into public.inventory_ledger (store_id, item_id, delta, balance, reason, ref_type, ref_id, actor_id)
      select v_o.store_id, r.item_id, r.qty * r.ea, ss.on_hand, 'po_receive', 'purchase_order', p_order, auth.uid()
        from public.store_stock ss
       where ss.store_id = v_o.store_id and ss.item_id = r.item_id;
    end loop;
  end if;

  -- 보류/취소: 잡아 둔 할당을 풀어 준다.
  if p_stage in ('hold', 'canceled') and v_o.stage in ('approved', 'picking') then
    for r in select item_id, qty from public.purchase_order_lines where order_id = p_order loop
      update public.warehouse_stock
         set allocated = greatest(0, allocated - r.qty)
       where item_id = r.item_id;
    end loop;
  end if;

  select full_name into v_actor from public.profiles where id = auth.uid();

  update public.purchase_orders
     set stage = p_stage,
         driver_name = case
           when p_stage in ('shipped', 'delivering')
             then coalesce(driver_name, (select driver_name from public.routes where id = v_o.route_id))
           else driver_name end
   where id = p_order;

  insert into public.purchase_order_events (order_id, stage, actor_id, actor_name, note)
  values (p_order, p_stage, auth.uid(), coalesce(v_actor, 'SYSTEM'), p_note);

  return jsonb_build_object('ok', true, 'stage', p_stage);
end;
$$;

-- ---------------------------------------------------------------- 수동 발주 등록
create or replace function public.create_purchase_order(
  p_store  uuid,
  p_lines  jsonb,           -- [{ "item_id": "...", "qty": 3 }]
  p_memo   text default null,
  p_urgent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_no    text;
  v_route text;
  v_total bigint := 0;
  v_actor text;
begin
  if not public.can_touch_store(p_store) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'EMPTY_ORDER' using errcode = '22023';
  end if;

  select route_id into v_route from public.stores where id = p_store;
  v_no := public.next_po_no();

  insert into public.purchase_orders (order_no, store_id, route_id, stage, source, is_urgent, due_date, memo, created_by)
  values (v_no, p_store, v_route, 'received', 'manual', coalesce(p_urgent, false),
          ((now() at time zone 'Asia/Seoul')::date + 1), nullif(trim(coalesce(p_memo, '')), ''), auth.uid())
  returning id into v_id;

  insert into public.purchase_order_lines (order_id, item_id, qty, unit_price, amount)
  select v_id, i.id, l.qty, i.price, i.price * l.qty
    from jsonb_to_recordset(p_lines) as l(item_id uuid, qty int)
    join public.items i on i.id = l.item_id and i.is_active
   where l.qty > 0;

  select coalesce(sum(amount), 0) into v_total from public.purchase_order_lines where order_id = v_id;
  if v_total = 0 then
    delete from public.purchase_orders where id = v_id;
    raise exception 'EMPTY_ORDER' using errcode = '22023';
  end if;

  update public.purchase_orders set total_amount = v_total where id = v_id;

  select full_name into v_actor from public.profiles where id = auth.uid();
  insert into public.purchase_order_events (order_id, stage, actor_id, actor_name, note)
  values (v_id, 'received', auth.uid(), coalesce(v_actor, 'SYSTEM'), '발주 등록');

  return jsonb_build_object('ok', true, 'id', v_id, 'order_no', v_no, 'total', v_total);
end;
$$;

-- ---------------------------------------------------------------- 지점 재고 수동 조정
create or replace function public.adjust_store_stock(
  p_store uuid,
  p_item  uuid,
  p_delta numeric,
  p_reason public.ledger_reason default 'adjust',
  p_note  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_new numeric;
begin
  if not public.can_touch_store(p_store) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.store_stock (store_id, item_id, on_hand, safety_stock, daily_usage)
  values (p_store, p_item, 0, 0, 0)
  on conflict (store_id, item_id) do nothing;

  update public.store_stock
     set on_hand = greatest(0, on_hand + p_delta)
   where store_id = p_store and item_id = p_item
  returning on_hand into v_new;

  insert into public.inventory_ledger (store_id, item_id, delta, balance, reason, ref_type, actor_id)
  values (p_store, p_item, p_delta, v_new, p_reason, coalesce(p_note, 'manual'), auth.uid());

  return jsonb_build_object('ok', true, 'on_hand', v_new);
end;
$$;

-- ---------------------------------------------------------------- 키오스크 토큰 재발급
create or replace function public.rotate_kiosk_token(p_store uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp, extensions
as $$
declare v_token text;
begin
  if not public.is_hq() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  v_token := encode(extensions.gen_random_bytes(18), 'hex');
  update public.stores set kiosk_token = v_token where id = p_store;

  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id)
  select auth.uid(), p.full_name, 'rotate_kiosk_token', 'store', p_store::text
    from public.profiles p where p.id = auth.uid();

  return v_token;
end;
$$;

-- ---------------------------------------------------------------- 실행 권한
-- 키오스크용 함수는 서버(service_role)만 호출한다. 브라우저에는 열지 않는다.
revoke all on function public.kiosk_bootstrap(text)            from public, anon, authenticated;
revoke all on function public.kiosk_checkout(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.next_kiosk_no(uuid)              from public, anon, authenticated;
revoke all on function public.next_po_no()                     from public, anon, authenticated;
revoke all on function public.create_replenish_order(uuid, uuid[], public.order_source)
                                                               from public, anon, authenticated;

grant execute on function public.advance_order(uuid, public.order_stage, text)              to authenticated;
grant execute on function public.create_purchase_order(uuid, jsonb, text, boolean)          to authenticated;
grant execute on function public.adjust_store_stock(uuid, uuid, numeric, public.ledger_reason, text) to authenticated;
grant execute on function public.rotate_kiosk_token(uuid)                                   to authenticated;
