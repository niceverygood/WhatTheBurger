import type { Metadata } from 'next';
import { requireSession, scopeStoreId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import { Card, Empty, Kpi, Meter, Pill, type State } from '@/components/ui';
import StockAdjust from './StockAdjust';
import StorePicker from '../kiosk-link/StorePicker';
import { LEDGER_KO, TEMP_KO, type LedgerReason, type TempZone } from '@/lib/types';
import { dateTime, n0, wonC } from '@/lib/format';

export const metadata: Metadata = { title: '재고 현황 · 왓더버거 ERP' };
export const dynamic = 'force-dynamic';

interface WhRow {
  item_id: string; sku: string; item_name: string; category: string; unit: string;
  on_hand: number; allocated: number; available: number; safety_stock: number;
  ratio: number | null; supplier: string | null; price: number;
}

interface StoreStockRow {
  item_id: string; on_hand: number; safety_stock: number; daily_usage: number;
  item: { sku: string; name: string; category: string; unit: string; temp: TempZone; price: number; ea_per_unit: number } | null;
}

interface LedgerRow {
  id: string; delta: number; balance: number; reason: LedgerReason; created_at: string;
  item: { sku: string; name: string } | null;
}

const stateOf = (ratio: number | null): State =>
  ratio == null ? 'idle' : ratio <= 0.5 ? 'crit' : ratio <= 1 ? 'warn' : 'ok';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string; view?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();

  // 본사는 물류센터 재고가 기본, 지점은 항상 자기 매장 재고.
  const scope = scopeStoreId(session);
  const isWarehouse = session.isHQ && sp.view !== 'store';

  if (isWarehouse) {
    const { data } = await supabase.rpc('warehouse_status');
    const rows = (data ?? []) as WhRow[];
    const crit = rows.filter((r) => stateOf(r.ratio) === 'crit');
    const warn = rows.filter((r) => stateOf(r.ratio) === 'warn');
    const value = rows.reduce((a, r) => a + r.on_hand * r.price, 0);
    const allocated = rows.reduce((a, r) => a + r.allocated, 0);

    return (
      <>
        <Topbar
          crumb="자산" title="물류센터 재고"
          sub="용인 1센터 · 가용재고 = 실물재고 − 승인 발주 할당분"
          name={session.profile.full_name} role={session.profile.role}
        />
        <div className="view">
          <div className="kpis">
            <Kpi label="관리 SKU" value={n0(rows.length)} unit="종" />
            <Kpi
              label="재고 자산가치" value={wonC(value)}
              foot={<span className="t-mute">공급가 기준</span>}
            />
            <Kpi
              label="할당 대기" value={n0(allocated)} unit="EA"
              foot={<span className="t-mute">승인 후 출고 전 물량</span>}
            />
            <Kpi
              label="재고 경고" value={n0(crit.length + warn.length)} unit="SKU"
              foot={<><Pill state="crit" label={`결품위험 ${crit.length}`} /> <Pill state="warn" label={`주의 ${warn.length}`} /></>}
            />
          </div>

          <div className="toolbar">
            <a className="btn btn-sm" href="/inventory?view=store">지점 재고 보기</a>
            <span className="spacer" />
            <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
              안전재고 대비 가용재고가 낮은 순으로 정렬됩니다
            </span>
          </div>

          <Card title="품목별 재고" sub={`${rows.length}개 SKU`}>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>품목</th>
                    <th>분류</th>
                    <th>공급사</th>
                    <th style={{ textAlign: 'right' }}>실물</th>
                    <th style={{ textAlign: 'right' }}>할당</th>
                    <th style={{ textAlign: 'right' }}>가용</th>
                    <th style={{ textAlign: 'right' }}>안전</th>
                    <th style={{ width: 110 }}>수준</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = stateOf(r.ratio);
                    return (
                      <tr key={r.item_id}>
                        <td className="code t-mute">{r.sku}</td>
                        <td>{r.item_name}<div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{r.unit}</div></td>
                        <td className="t-mute">{r.category}</td>
                        <td className="t-mute">{r.supplier ?? '—'}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{n0(r.on_hand)}</td>
                        <td className="num t-mute" style={{ textAlign: 'right' }}>{n0(r.allocated)}</td>
                        <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{n0(r.available)}</td>
                        <td className="num t-mute" style={{ textAlign: 'right' }}>{n0(r.safety_stock)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Meter ratio={r.ratio ?? 1} state={st} />
                            {st !== 'ok' && <Pill state={st} label={st === 'crit' ? '위험' : '주의'} />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={9}><Empty>등록된 물류센터 재고가 없습니다.</Empty></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </>
    );
  }

  /* ---------------- 지점 재고 ---------------- */
  const { data: storeList } = await supabase
    .from('stores').select('id, code, name').eq('status', 'operating').order('code');
  const stores = (storeList ?? []) as { id: string; code: string; name: string }[];
  const target = stores.find((s) => s.id === (scope ?? sp.store)) ?? stores[0];

  if (!target) {
    return (
      <>
        <Topbar crumb="자산" title="지점 재고" sub="—"
                name={session.profile.full_name} role={session.profile.role} />
        <div className="view"><div className="card"><Empty>조회할 지점이 없습니다.</Empty></div></div>
      </>
    );
  }

  const [stockRes, ledgerRes] = await Promise.all([
    supabase
      .from('store_stock')
      .select('item_id, on_hand, safety_stock, daily_usage, item:items(sku, name, category, unit, temp, price, ea_per_unit)')
      .eq('store_id', target.id)
      .order('on_hand', { ascending: true }),
    supabase
      .from('inventory_ledger')
      .select('id, delta, balance, reason, created_at, item:items(sku, name)')
      .eq('store_id', target.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const rows = (stockRes.data ?? []) as unknown as StoreStockRow[];
  const ledger = (ledgerRes.data ?? []) as unknown as LedgerRow[];
  const ratioOf = (r: StoreStockRow) => (r.safety_stock > 0 ? r.on_hand / r.safety_stock : null);
  const crit = rows.filter((r) => stateOf(ratioOf(r)) === 'crit');
  const warn = rows.filter((r) => stateOf(ratioOf(r)) === 'warn');
  // 지점 재고는 낱개(EA) 단위, 단가는 구매단위(BOX) 기준이므로 낱개 단가로 환산한다.
  const value = rows.reduce(
    (a, r) => a + r.on_hand * ((r.item?.price ?? 0) / Math.max(1, r.item?.ea_per_unit ?? 1)),
    0,
  );

  return (
    <>
      <Topbar
        crumb="자산" title="지점 재고"
        sub={`${target.name} · 키오스크 판매로 실시간 차감되는 원재료 재고`}
        name={session.profile.full_name} role={session.profile.role}
      />
      <div className="view">
        <div className="kpis">
          <Kpi label="관리 품목" value={n0(rows.length)} unit="종" />
          <Kpi label="결품 위험" value={n0(crit.length)} unit="종"
               foot={<span className="t-mute">안전재고의 50% 이하</span>} />
          <Kpi label="주의" value={n0(warn.length)} unit="종"
               foot={<span className="t-mute">안전재고 미만</span>} />
          <Kpi label="재고 평가액" value={wonC(value)} foot={<span className="t-mute">공급가 환산</span>} />
        </div>

        <div className="toolbar">
          {session.isHQ && (
            <>
              <StorePicker stores={stores} current={target.id} basePath="/inventory?view=store" />
              <a className="btn btn-sm" href="/inventory">물류센터 재고 보기</a>
            </>
          )}
          <span className="spacer" />
          <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
            안전재고 아래로 내려가면 다음 판매 시점에 자동발주가 생성됩니다
          </span>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', alignItems: 'start' }}>
          <Card title="품목별 재고" sub={`${rows.length}개 품목`}>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>품목</th>
                    <th>보관</th>
                    <th style={{ textAlign: 'right' }}>보유(EA)</th>
                    <th style={{ textAlign: 'right' }}>안전</th>
                    <th style={{ textAlign: 'right' }}>일평균</th>
                    <th style={{ width: 100 }}>수준</th>
                    <th style={{ textAlign: 'right' }}>조정</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ratio = ratioOf(r);
                    const st = stateOf(ratio);
                    const days = r.daily_usage > 0 ? (r.on_hand / r.daily_usage).toFixed(1) : null;
                    return (
                      <tr key={r.item_id}>
                        <td>
                          <span className="code t-mute">{r.item?.sku}</span> {r.item?.name}
                          {days && (
                            <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>약 {days}일치</div>
                          )}
                        </td>
                        <td className="t-mute">{r.item ? TEMP_KO[r.item.temp] : '—'}</td>
                        <td className="num" style={{ textAlign: 'right', fontWeight: st === 'ok' ? 400 : 700 }}>
                          {n0(r.on_hand)}
                        </td>
                        <td className="num t-mute" style={{ textAlign: 'right' }}>{n0(r.safety_stock)}</td>
                        <td className="num t-mute" style={{ textAlign: 'right' }}>{n0(r.daily_usage)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Meter ratio={ratio ?? 1} state={st} />
                            {st === 'crit' && <Pill state="crit" label="위험" />}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <StockAdjust
                            storeId={target.id}
                            itemId={r.item_id}
                            itemName={r.item?.name ?? ''}
                            onHand={r.on_hand}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={7}><Empty>등록된 지점 재고가 없습니다.</Empty></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="재고 원장" sub="최근 30건">
            <div className="log-b" style={{ maxHeight: 520 }}>
              {ledger.length === 0 ? (
                <div className="log-empty">아직 재고 변동 기록이 없습니다.</div>
              ) : (
                ledger.map((l) => (
                  <div
                    className={`log-i ${l.reason === 'kiosk_sale' ? '' : l.reason === 'po_receive' ? 'ok' : 'warn'}`}
                    key={l.id}
                  >
                    <div className="tm">{dateTime(l.created_at)}</div>
                    <div className="tx">
                      <b>{l.item?.name}</b>{' '}
                      <span style={{ color: l.delta < 0 ? 'var(--crit)' : 'var(--ok)', fontWeight: 700 }}>
                        {l.delta > 0 ? '+' : ''}{n0(l.delta)}
                      </span>{' '}
                      → 잔여 {n0(l.balance)}
                      <div style={{ color: 'var(--ink-4)', fontSize: 11 }}>{LEDGER_KO[l.reason]}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
