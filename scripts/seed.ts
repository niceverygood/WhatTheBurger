/**
 * 왓더버거 ERP 시드 스크립트
 *
 *   npx tsx scripts/seed.ts            기본 시드 (이미 데이터가 있으면 중단)
 *   npx tsx scripts/seed.ts --reset    기존 운영 데이터를 지우고 다시 시드
 *
 * .env.local 의 SUPABASE_SERVICE_ROLE_KEY 로 접속한다. 절대 브라우저에서 실행하지 말 것.
 */
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ROUTES, SUPPLIERS, ITEMS, CAT_CODE, YIELD, buildMenus, DISTRICTS, MANAGER_NAMES,
} from './data';

config({ path: '.env.local' });
config({ path: '.env' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HQ_EMAIL = process.env.SEED_HQ_EMAIL ?? 'admin@whattheburger.co.kr';
const HQ_PASSWORD = process.env.SEED_HQ_PASSWORD ?? '';

if (!URL || !KEY) {
  console.error('✖ NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 를 .env.local 에 설정해 주세요.');
  process.exit(1);
}
if (HQ_PASSWORD.length < 8) {
  console.error('✖ SEED_HQ_PASSWORD 를 8자 이상으로 설정해 주세요.');
  process.exit(1);
}

const db: SupabaseClient = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const RESET = process.argv.includes('--reset');

/* ---------------------------------------------------------------- 결정적 난수 */
let _s = 20260812;
const rnd = () => ((_s = (_s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ---------------------------------------------------------------- 날짜 */
const TODAY = new Date();
const DAY = 86_400_000;
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayAdd = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

function ok<T>(label: string, res: { error: { message: string } | null; data?: T }): T {
  if (res.error) {
    console.error(`✖ ${label}: ${res.error.message}`);
    process.exit(1);
  }
  return res.data as T;
}

/** Supabase 는 한 번에 넣을 수 있는 행 수에 한계가 있으므로 나눠서 넣는다. */
async function insertChunked<T extends object>(table: string, rows: T[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await db.from(table).insert(chunk);
    if (error) {
      console.error(`✖ ${table} 삽입 실패 (${i}~${i + chunk.length}): ${error.message}`);
      process.exit(1);
    }
  }
}

async function main() {
  console.log('▶ 왓더버거 ERP 시드 시작\n');

  /* ------------------------------------------------------------ 0. 초기화 */
  const { count: existing } = await db.from('stores').select('id', { count: 'exact', head: true });

  if ((existing ?? 0) > 0 && !RESET) {
    console.log(`이미 ${existing}개 지점이 등록되어 있습니다.`);
    console.log('다시 시드하려면: npx tsx scripts/seed.ts --reset');
    process.exit(0);
  }

  if (RESET) {
    console.log('· 기존 운영 데이터 삭제');
    // FK 역순으로 지운다. 계정(auth.users)은 건드리지 않는다.
    for (const t of [
      'inventory_ledger', 'kiosk_order_lines', 'kiosk_orders',
      'purchase_order_events', 'purchase_order_lines', 'purchase_orders',
      'settlements', 'store_stock', 'warehouse_stock', 'menu_bom', 'menus',
      'items', 'suppliers',
    ]) {
      const { error } = await db.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      // 복합키 테이블은 id 컬럼이 없으므로 다른 조건으로 지운다.
      if (error) {
        const { error: e2 } = await db.from(t).delete().gte('created_at', '1900-01-01');
        if (e2) {
          const { error: e3 } = await db.from(t).delete().not('item_id', 'is', null);
          if (e3) console.warn(`  · ${t} 정리 건너뜀 (${error.message})`);
        }
      }
    }
    // 지점은 프로필이 참조하므로 담당자를 먼저 떼어 낸다.
    await db.from('profiles').update({ store_id: null }).eq('role', 'store_manager');
    await db.from('profiles').delete().eq('role', 'store_manager');
    await db.from('stores').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  /* ------------------------------------------------------------ 1. 노선 */
  console.log('· 배송 노선');
  await db.from('routes').upsert(
    ROUTES.map(({ id, name, driver_name, vehicle, sort }) => ({ id, name, driver_name, vehicle, sort })),
  );
  const sidoRoute: Record<string, string> = {};
  ROUTES.forEach((r) => r.sido.forEach((s) => (sidoRoute[s] = r.id)));

  /* ------------------------------------------------------------ 2. 공급사 */
  console.log('· 공급사');
  const suppliers = ok(
    '공급사',
    await db.from('suppliers').insert(SUPPLIERS).select('id, name'),
  ) as { id: string; name: string }[];
  const supplierId = new Map(suppliers.map((s) => [s.name, s.id]));

  /* ------------------------------------------------------------ 3. 품목 */
  console.log('· 품목 마스터');
  const catN: Record<string, number> = {};
  const itemRows = ITEMS.map(([name, category, unit, price, cost, temp, supplier]) => {
    catN[category] = (catN[category] ?? 0) + 1;
    const sku = `${CAT_CODE[category]}-${String(catN[category]).padStart(3, '0')}`;
    return {
      sku, name, category, unit,
      ea_per_unit: YIELD[sku] ?? Number((unit.match(/(\d+)\s*(?:ea|set)/i) ?? [, '1'])[1]) ?? 1,
      price, cost, temp,
      supplier_id: supplierId.get(supplier) ?? null,
      is_active: true,
    };
  });
  const items = ok('품목', await db.from('items').insert(itemRows).select('id, sku, price, ea_per_unit')) as
    { id: string; sku: string; price: number; ea_per_unit: number }[];
  const itemBySku = new Map(items.map((i) => [i.sku, i]));

  /* ------------------------------------------------------------ 4. 메뉴 · 레시피 */
  console.log('· 메뉴 · 레시피(BOM)');
  const menuSeeds = buildMenus();
  const menus = ok(
    '메뉴',
    await db.from('menus').insert(
      menuSeeds.map((m, i) => ({
        code: m.code, category: m.category, name: m.name,
        price: m.price, emoji: m.emoji, sort: i + 1, is_active: true,
      })),
    ).select('id, code'),
  ) as { id: string; code: string }[];
  const menuId = new Map(menus.map((m) => [m.code, m.id]));

  const bomRows: { menu_id: string; item_id: string; qty: number }[] = [];
  menuSeeds.forEach((m) => {
    // 같은 SKU 가 두 번 들어가는 조합(세트 등)은 합쳐야 복합키 충돌이 나지 않는다.
    const merged = new Map<string, number>();
    m.bom.forEach(([sku, q]) => merged.set(sku, (merged.get(sku) ?? 0) + q));
    merged.forEach((qty, sku) => {
      const item = itemBySku.get(sku);
      if (!item) return;
      bomRows.push({ menu_id: menuId.get(m.code)!, item_id: item.id, qty });
    });
  });
  await insertChunked('menu_bom', bomRows);

  /* 메뉴별 일 판매량에서 지점의 일 소요량(EA)을 역산한다 */
  const dailyEA: Record<string, number> = {};
  menuSeeds.forEach((m) =>
    m.bom.forEach(([sku, q]) => (dailyEA[sku] = (dailyEA[sku] ?? 0) + q * m.daily)),
  );

  /* ------------------------------------------------------------ 5. 가맹점 */
  console.log('· 가맹점');
  let sn = 0;
  const storeRows: Record<string, unknown>[] = [];
  Object.entries(DISTRICTS).forEach(([sido, districts]) => {
    districts.forEach((district) => {
      sn += 1;
      const openM = ri(0, 46);
      storeRows.push({
        code: `WTB-${String(sn).padStart(3, '0')}`,
        name: `${district}점`,
        sido,
        district,
        route_id: sidoRoute[sido] ?? null,
        grade: sn % 17 === 0 ? 'direct' : 'franchise',
        status: chance(0.03) ? 'suspended' : 'operating',
        manager_name: pick(MANAGER_NAMES),
        tel: `010-${ri(2000, 9999)}-${String(ri(0, 9999)).padStart(4, '0')}`,
        opened_at: ymd(dayAdd(TODAY, -openM * 30 - ri(0, 25))),
        credit_limit: ri(2, 6) * 10_000_000,
        kiosk_enabled: true,
      });
    });
  });
  const stores = ok(
    '가맹점',
    await db.from('stores').insert(storeRows).select('id, code, name, route_id, status, credit_limit'),
  ) as { id: string; code: string; name: string; route_id: string | null; status: string; credit_limit: number }[];
  const active = stores.filter((s) => s.status === 'operating');
  console.log(`  → ${stores.length}개점 (운영중 ${active.length})`);

  /* ------------------------------------------------------------ 6. 물류센터 재고 */
  console.log('· 물류센터 재고');
  await insertChunked(
    'warehouse_stock',
    items.map((i) => {
      // 전 지점 하루 소요량의 대략 12일치를 안전재고로 잡는다.
      const perStoreDaily = dailyEA[i.sku] ?? 0;
      const daily = (perStoreDaily * active.length) / Math.max(1, i.ea_per_unit);
      const safety = Math.max(30, Math.round(daily * 3));
      const r = rnd();
      const onHand =
        r < 0.1 ? ri(0, Math.round(safety * 0.4))
        : r < 0.24 ? ri(Math.round(safety * 0.5), safety)
        : ri(safety, Math.round(safety * 3.6));
      return { item_id: i.id, on_hand: onHand, allocated: 0, safety_stock: safety };
    }),
  );

  /* ------------------------------------------------------------ 7. 지점 재고 */
  console.log('· 지점 재고');
  const stockRows: Record<string, unknown>[] = [];
  // 데모에서 몇 번의 키오스크 결제만으로 자동발주까지 도달하도록,
  // 첫 번째 지점의 핵심 3개 품목은 재주문점 바로 위에 둔다.
  const demoStore = active[0];
  const TIGHT = ['PT-001', 'BN-001', 'PK-001'];

  active.forEach((store) => {
    Object.entries(dailyEA).forEach(([sku, daily], idx) => {
      const item = itemBySku.get(sku);
      if (!item) return;
      const safety = Math.ceil(daily * 1.5);
      const tight = store.id === demoStore.id && TIGHT.includes(sku);
      stockRows.push({
        store_id: store.id,
        item_id: item.id,
        on_hand: tight
          ? safety + Math.ceil(daily * 0.06)
          : Math.ceil(safety * (1.5 + ((idx + sn) % 5) * 0.3)),
        safety_stock: safety,
        daily_usage: Math.round(daily),
      });
    });
  });
  await insertChunked('store_stock', stockRows);
  console.log(`  → ${stockRows.length}행`);

  /* ------------------------------------------------------------ 8. 발주 이력 */
  console.log('· 발주 이력 (최근 6주)');
  const DOWF: Record<number, number> = { 1: 1.04, 2: 0.95, 3: 1.0, 4: 1.07, 5: 1.14, 6: 0.58 };
  const HIST_DAYS = 41;
  const storeWeight = new Map(active.map((s) => [s.id, 0.7 + rnd() * 0.95]));

  const orders: Record<string, unknown>[] = [];
  const orderLines: { order_no: string; item_id: string; qty: number; unit_price: number; amount: number }[] = [];
  const seqByDay: Record<string, number> = {};

  for (let d = HIST_DAYS; d >= 0; d -= 1) {
    const date = dayAdd(TODAY, -d);
    const dow = date.getDay();
    if (dow === 0) continue; // 일요일 발주 없음

    const grow = 1 + ((HIST_DAYS - d) / HIST_DAYS) * 0.11;
    const dayF = DOWF[dow] * grow * (0.97 + rnd() * 0.06);
    const at = ymd(date);

    for (const store of active) {
      const w = storeWeight.get(store.id)!;
      if (rnd() > clamp(w * 0.42 * DOWF[dow], 0, 0.92)) continue;

      seqByDay[at] = (seqByDay[at] ?? 0) + 1;
      const orderNo = `PO${at.slice(2).replace(/-/g, '')}-${String(seqByDay[at]).padStart(4, '0')}`;

      const chosen = ITEMS.map((row, idx) => ({ row, sku: itemRows[idx].sku }))
        .filter(({ row }) => {
          const cat = row[1];
          const freq = ['패티', '번', '채소'].includes(cat) ? 0.86
            : ['치즈·유제품', '소스', '사이드'].includes(cat) ? 0.62
            : cat === '음료' ? 0.5 : 0.3;
          return rnd() < freq;
        });
      while (chosen.length < 6) {
        const idx = ri(0, ITEMS.length - 1);
        if (!chosen.some((c) => c.sku === itemRows[idx].sku)) {
          chosen.push({ row: ITEMS[idx], sku: itemRows[idx].sku });
        }
      }

      let total = 0;
      chosen.forEach(({ row, sku }) => {
        const item = itemBySku.get(sku)!;
        const qty = Math.max(1, Math.round(row[7] * w * dayF * (0.88 + rnd() * 0.24)));
        const amount = qty * item.price;
        total += amount;
        orderLines.push({ order_no: orderNo, item_id: item.id, qty, unit_price: item.price, amount });
      });

      let stage: string;
      if (d >= 4) stage = chance(0.985) ? 'done' : 'hold';
      else if (d === 3) stage = chance(0.9) ? 'done' : 'delivering';
      else if (d === 2) stage = pick(['done', 'done', 'done', 'delivering', 'shipped']);
      else if (d === 1) stage = pick(['done', 'delivering', 'delivering', 'shipped', 'picking', 'approved']);
      else stage = pick(['received', 'received', 'received', 'approved', 'approved', 'picking', 'picking', 'shipped', 'hold']);

      const urgent = stage !== 'done' && chance(0.13);
      const hour = ri(6, 11);
      orders.push({
        order_no: orderNo,
        store_id: store.id,
        route_id: store.route_id,
        stage,
        source: 'manual',
        is_urgent: urgent,
        ordered_at: at,
        ordered_ts: new Date(`${at}T${String(hour).padStart(2, '0')}:${String(ri(0, 59)).padStart(2, '0')}:00+09:00`).toISOString(),
        due_date: ymd(dayAdd(date, dow === 6 ? 2 : 1)),
        total_amount: total,
        driver_name: ['shipped', 'delivering', 'done'].includes(stage)
          ? ROUTES.find((r) => r.id === store.route_id)?.driver_name ?? null
          : null,
        memo: urgent ? pick(['주말 프로모션 대비 긴급 추가', '재고 소진 임박 — 오전 배송 요청', '신규 오픈 프로모션 물량']) : null,
      });
    }
  }

  await insertChunked('purchase_orders', orders);
  console.log(`  → 발주 ${orders.length}건`);

  const savedOrders = ok(
    '발주 조회',
    await db.from('purchase_orders').select('id, order_no').limit(20000),
  ) as { id: string; order_no: string }[];
  const orderIdByNo = new Map(savedOrders.map((o) => [o.order_no, o.id]));

  await insertChunked(
    'purchase_order_lines',
    orderLines
      .filter((l) => orderIdByNo.has(l.order_no))
      .map(({ order_no, ...rest }) => ({ order_id: orderIdByNo.get(order_no)!, ...rest })),
    800,
  );
  console.log(`  → 발주 품목 ${orderLines.length}행`);

  /* ------------------------------------------------------------ 9. 정산 */
  console.log('· 정산 · 여신');
  const period = `${ymd(TODAY).slice(0, 7)}-01`;
  const mtdByStore: Record<string, number> = {};
  orders.forEach((o) => {
    const at = o.ordered_at as string;
    if (at >= period) {
      const sid = o.store_id as string;
      mtdByStore[sid] = (mtdByStore[sid] ?? 0) + (o.total_amount as number);
    }
  });

  await insertChunked(
    'settlements',
    active.map((s) => {
      const mtd = mtdByStore[s.id] ?? 0;
      const monthly = Math.max(mtd, ri(8, 30) * 1_000_000);
      const bad = rnd() < 0.12;
      const carry = bad
        ? Math.round(monthly * (0.45 + rnd() * 0.85))
        : rnd() < 0.22 ? Math.round(monthly * rnd() * 0.1) : 0;
      const overdue = bad ? ri(6, 47) : 0;
      return {
        store_id: s.id,
        period,
        prev_amount: monthly,
        paid_amount: Math.max(0, monthly - carry),
        carry_amount: carry,
        mtd_amount: mtd,
        overdue_days: overdue,
        tax_status: rnd() < 0.82 ? 'issued' : rnd() < 0.6 ? 'pending' : 'hold',
        due_date: ymd(dayAdd(TODAY, overdue ? -overdue : ri(2, 18))),
      };
    }),
  );

  /* ------------------------------------------------------------ 10. 계정 */
  console.log('· 계정 발급');

  async function ensureUser(email: string, password: string, name: string): Promise<string> {
    const { data, error } = await db.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: name },
    });
    if (!error && data.user) return data.user.id;

    if (error && /already|registered|exists/i.test(error.message)) {
      // 이미 있는 계정이면 그대로 재사용하고 비밀번호만 맞춰 준다.
      const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      if (found) {
        await db.auth.admin.updateUserById(found.id, { password });
        return found.id;
      }
    }
    throw new Error(`계정 생성 실패 (${email}): ${error?.message ?? '알 수 없는 오류'}`);
  }

  const hqId = await ensureUser(HQ_EMAIL, HQ_PASSWORD, '본사 총괄관리자');
  await db.from('profiles').upsert({
    id: hqId, email: HQ_EMAIL, full_name: '본사 총괄관리자',
    role: 'hq_admin', store_id: null, is_active: true, must_change_password: true,
  });

  // 앞쪽 6개 지점에는 지점관리자 계정을 미리 붙여 둔다(권한 분리 확인용).
  const managerAccounts: { email: string; password: string; store: string }[] = [];
  for (const store of active.slice(0, 6)) {
    const slug = store.code.toLowerCase().replace('wtb-', 'store');
    const email = `${slug}@whattheburger.co.kr`;
    const password = `${HQ_PASSWORD}`;
    const name = `${store.name} 점장`;
    const uid = await ensureUser(email, password, name);
    await db.from('profiles').upsert({
      id: uid, email, full_name: name,
      role: 'store_manager', store_id: store.id, is_active: true,
      must_change_password: true, created_by: hqId,
    });
    managerAccounts.push({ email, password, store: store.name });
  }

  /* ------------------------------------------------------------ 완료 */
  const { data: kioskStore } = await db
    .from('stores').select('name, kiosk_token').eq('id', demoStore.id).maybeSingle();

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  console.log('\n────────────────────────────────────────────────');
  console.log('✔ 시드 완료\n');
  console.log('본사 총괄관리자');
  console.log(`  아이디   ${HQ_EMAIL}`);
  console.log(`  비밀번호 ${HQ_PASSWORD}\n`);
  console.log('지점관리자 (권한 분리 확인용)');
  managerAccounts.forEach((m) => console.log(`  ${m.store.padEnd(10)} ${m.email}`));
  console.log(`  비밀번호는 총괄관리자와 동일하게 설정했습니다. 운영 전 반드시 변경하세요.\n`);
  if (kioskStore) {
    console.log(`키오스크 데모 링크 (${kioskStore.name})`);
    console.log(`  ${site}/kiosk/${kioskStore.kiosk_token}`);
    console.log('  이 지점의 패티·번·포장지 재고를 재주문점 바로 위에 두었습니다.');
    console.log('  버거를 몇 개만 결제하면 자동발주가 생성됩니다.\n');
  }
  console.log('────────────────────────────────────────────────');
}

main().catch((e) => {
  console.error('✖ 시드 중 오류:', e);
  process.exit(1);
});
