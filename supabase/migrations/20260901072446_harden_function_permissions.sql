-- Supabase security advisor hardening.
-- Trigger functions are invoked by PostgreSQL itself; application roles never
-- need to call them as RPC endpoints.
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.guard_profile_self_update() from public, anon, authenticated;
revoke all on function public.guard_store_self_update() from public, anon, authenticated;

-- Pin every remaining invoker function to trusted schemas so that a caller
-- cannot influence name resolution through a mutable search_path.
alter function public.daily_order_series(uuid, integer)
  set search_path = public, pg_temp;
alter function public.category_totals(uuid, date)
  set search_path = public, pg_temp;
alter function public.kiosk_sales_series(uuid, integer)
  set search_path = public, pg_temp;
alter function public.menu_ranking(uuid, integer)
  set search_path = public, pg_temp;
alter function public.low_store_stock(uuid)
  set search_path = public, pg_temp;
alter function public.warehouse_status()
  set search_path = public, pg_temp;
alter function public.dashboard_summary(uuid)
  set search_path = public, pg_temp;
