/**
 * 운영 데이터를 유지한 채 키오스크 메뉴와 BOM만 동기화한다.
 *
 *   npx tsx scripts/sync-kiosk-menu.ts
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { buildMenus } from './data';

config({ path: '.env.local' });
config({ path: '.env' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
}

const db = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const menuSeeds = buildMenus();
  const { data: items, error: itemError } = await db.from('items').select('id,sku');
  if (itemError) throw itemError;

  const itemBySku = new Map((items ?? []).map((item) => [item.sku, item.id]));
  const requiredSkus = new Set(menuSeeds.flatMap((menu) => menu.bom.map(([sku]) => sku)));
  const missingSkus = [...requiredSkus].filter((sku) => !itemBySku.has(sku));
  if (missingSkus.length) throw new Error(`BOM 품목 누락: ${missingSkus.join(', ')}`);

  const { data: menus, error: menuError } = await db
    .from('menus')
    .upsert(
      menuSeeds.map((menu, index) => ({
        code: menu.code,
        category: menu.category,
        name: menu.name,
        price: menu.price,
        emoji: menu.emoji,
        sort: index + 1,
        is_active: true,
      })),
      { onConflict: 'code' },
    )
    .select('id,code,category,name,price,is_active');
  if (menuError) throw menuError;

  const menuByCode = new Map((menus ?? []).map((menu) => [menu.code, menu.id]));
  const menuIds = [...menuByCode.values()];

  const bomRows = menuSeeds.flatMap((menu) => {
    const merged = new Map<string, number>();
    menu.bom.forEach(([sku, qty]) => merged.set(sku, (merged.get(sku) ?? 0) + qty));
    return [...merged].map(([sku, qty]) => ({
      menu_id: menuByCode.get(menu.code)!,
      item_id: itemBySku.get(sku)!,
      qty,
    }));
  });

  const { error: deleteError } = await db.from('menu_bom').delete().in('menu_id', menuIds);
  if (deleteError) throw deleteError;

  for (let index = 0; index < bomRows.length; index += 500) {
    const { error } = await db.from('menu_bom').insert(bomRows.slice(index, index + 500));
    if (error) throw error;
  }

  const { data: verified, error: verifyError } = await db
    .from('menus')
    .select('code,category,name,price,is_active')
    .in('code', menuSeeds.map((menu) => menu.code))
    .order('sort');
  if (verifyError) throw verifyError;

  const categoryCount = (verified ?? []).reduce<Record<string, number>>((counts, menu) => {
    counts[menu.category] = (counts[menu.category] ?? 0) + 1;
    return counts;
  }, {});

  console.log(`메뉴 ${verified?.length ?? 0}개, BOM ${bomRows.length}행 동기화 완료`);
  console.log(categoryCount);
  console.log((verified ?? []).slice(0, 5));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
