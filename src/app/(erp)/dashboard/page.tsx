import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession, scopeStoreId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import { Card, Empty, Kpi, Meter, Pill, StageBadge, type State } from '@/components/ui';
import { AreaChart, BarChart, type Point } from '@/components/charts';
import LiveTicker from '@/components/LiveTicker';
import { md, n0, seoulToday, weekdayOf, won, wonC } from '@/lib/format';
import type { OrderStage } from '@/lib/types';

export const metadata: Metadata = { title: '대시보드 · 왓더버거 ERP' };
export const dynamic = 'force-dynamic';

interface Summary {
  today_orders: { cnt: number; amount: number };
  yesterday_orders: { cnt: number; amount: number };
  open: { total: number; received: number; in_transit: number; urgent: number; auto: number };
  receivable: { carry: number; mtd: number; overdue_stores: number };
  kiosk_today: { sales: number; cnt: number; avg: number };
}

interface LowRow {
  store_id: string; store_name: string; sku: string; item_name: string;
  category: string; on_hand: number; safety_stock: number; ratio: number | null;
}

interface RecentOrder {
  id: string; order_no: string; stage: OrderStage; total_amount: number;
  is_urgent: boolean; source: string; ordered_ts: string;
  store: { code: string; name: string } | null;
}

const stockState = (ratio: number | null): State =>
  ratio == null ? 'idle' : ratio <= 0.5 ? 'crit' : ratio <= 1 ? 'warn' : 'ok';

export default async function DashboardPage() {
  const session = await requireSession();
  const storeId = scopeStoreId(session);
  const supabase = await createClient();

  const [summaryRes, seriesRes, catRes, lowRes, recentRes] = await Promise.all([
    supabase.rpc('dashboard_summary', { p_store: storeId }),
    supabase.rpc('daily_order_series', { p_store: storeId, p_days: 14 }),
    supabase.rpc('category_totals', { p_store: storeId }),
    supabase.rpc('low_store_stock', { p_store: storeId }),
    supabase
      .from('purchase_orders')
      .select('id, order_no, stage, total_amount, is_urgent, source, ordered_ts, store:stores(code, name)')
      .not('stage', 'in', '(done,canceled)')
      .order('ordered_ts', { ascending: false })
      .limit(8),
  ]);

  const s = (summaryRes.data ?? {}) as Partial<Summary>;
  const today = s.today_orders ?? { cnt: 0, amount: 0 };
  const yday = s.yesterday_orders ?? { cnt: 0, amount: 0 };
  const open = s.open ?? { total: 0, received: 0, in_transit: 0, urgent: 0, auto: 0 };
  const recv = s.receivable ?? { carry: 0, mtd: 0, overdue_stores: 0 };
  const kiosk = s.kiosk_today ?? { sales: 0, cnt: 0, avg: 0 };

  const series: Point[] = ((seriesRes.data ?? []) as { d: string; amount: number; cnt: number }[]).map((r) => ({
    k: md(r.d),
    full: `${md(r.d)} (${weekdayOf(r.d)})`,
    v: Number(r.amount),
    sub: `· ${r.cnt}건`,
  }));
  const counts = ((seriesRes.data ?? []) as { cnt: number }[]).map((r) => r.cnt);

  const cats = ((catRes.data ?? []) as { category: string; amount: number; qty: number }[]).map((r) => ({
    k: r.category,
    v: Number(r.amount),
    sub: `${n0(Number(r.qty))}개`,
  }));

  const low = (lowRes.data ?? []) as LowRow[];
  const crit = low.filter((r) => stockState(r.ratio) === 'crit');
  const recent = (recentRes.data ?? []) as unknown as RecentOrder[];

  const delta = today.amount - yday.amount;
  const todayIso = seoulToday();

  return (
    <>
      <Topbar
        crumb="대시보드"
        title="오늘의 운영 현황"
        sub={
          session.isHQ
            ? `${todayIso} (${weekdayOf(todayIso)}) · 전 지점 · 용인 1센터 기준`
            : `${todayIso} (${weekdayOf(todayIso)}) · ${session.store?.name ?? ''}`
        }
        name={session.profile.full_name}
        role={session.profile.role}
      />

      <div className="view">
        <div className="kpis">
          <Kpi
            label="오늘 발주 접수"
            value={n0(today.cnt)}
            unit="건"
            delta={{
              good: today.cnt >= yday.cnt,
              text: `${today.cnt - yday.cnt >= 0 ? '+' : ''}${today.cnt - yday.cnt}건`,
              vs: '어제 대비',
            }}
            spark={counts.length > 1 ? counts : undefined}
          />
          <Kpi
            label="처리 대기 발주"
            value={n0(open.total)}
            unit="건"
            foot={
              <>
                승인 전 <b className="num">{open.received}</b>건 · 배송중{' '}
                <b className="num">{open.in_transit}</b>건
              </>
            }
          />
          <Kpi
            label={session.isHQ ? '이월 미수금' : '우리 지점 미수금'}
            value={wonC(recv.carry)}
            delta={
              recv.overdue_stores > 0
                ? { good: false, text: `${n0(recv.overdue_stores)}${session.isHQ ? '개점' : '건'}`, vs: '연체 발생' }
                : undefined
            }
            foot={recv.overdue_stores === 0 ? <span className="t-mute">연체 없음</span> : undefined}
          />
          <Kpi
            label="오늘 키오스크 매출"
            value={wonC(kiosk.sales)}
            foot={
              <>
                <b className="num">{n0(kiosk.cnt)}</b>건 · 객단가{' '}
                <b className="num">{n0(kiosk.avg)}</b>원
              </>
            }
          />
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1.55fr 1fr', alignItems: 'start' }}>
          <Card
            title="일별 발주 금액"
            sub="최근 14 영업일"
            aside={
              <>
                어제 대비{' '}
                <b className="num" style={{ color: delta >= 0 ? 'var(--ok)' : 'var(--crit)' }}>
                  {delta >= 0 ? '+' : ''}
                  {wonC(delta)}
                </b>
              </>
            }
          >
            <div style={{ padding: '6px 8px 8px' }}>
              <AreaChart data={series} label="일별 발주 금액 추이" />
            </div>
          </Card>

          <Card title="카테고리별 발주" sub="이번 달 누계">
            <div style={{ padding: '10px 8px 12px' }}>
              <BarChart rows={cats} label="카테고리별 발주 금액" />
            </div>
          </Card>
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 14, alignItems: 'start' }}>
          <Card
            title="재고 경고"
            sub="지점 재고 ÷ 안전재고"
            aside={
              crit.length > 0 ? <Pill state="crit" label={`결품위험 ${crit.length}`} /> : <Pill state="ok" label="이상 없음" />
            }
          >
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    {session.isHQ && <th>지점</th>}
                    <th>품목</th>
                    <th style={{ textAlign: 'right' }}>보유</th>
                    <th style={{ textAlign: 'right' }}>안전</th>
                    <th style={{ width: 100 }}>수준</th>
                  </tr>
                </thead>
                <tbody>
                  {low.slice(0, 8).map((r) => {
                    const st = stockState(r.ratio);
                    return (
                      <tr key={`${r.store_id}-${r.sku}`}>
                        {session.isHQ && <td style={{ whiteSpace: 'nowrap' }}>{r.store_name}</td>}
                        <td>
                          <span className="code t-mute">{r.sku}</span> {r.item_name}
                        </td>
                        <td className="num" style={{ textAlign: 'right' }}>{n0(r.on_hand)}</td>
                        <td className="num t-mute" style={{ textAlign: 'right' }}>{n0(r.safety_stock)}</td>
                        <td><Meter ratio={r.ratio ?? 0} state={st} /></td>
                      </tr>
                    );
                  })}
                  {low.length === 0 && (
                    <tr>
                      <td colSpan={session.isHQ ? 5 : 4}>
                        <Empty>안전재고 아래로 내려간 품목이 없습니다.</Empty>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {low.length > 8 && (
              <div className="pager">
                <span>안전재고 미달 {low.length}건 중 8건 표시</span>
                <span className="spacer" />
                <Link className="btn btn-sm" href="/inventory">재고 현황 전체 보기</Link>
              </div>
            )}
          </Card>

          <Card
            title="진행 중 발주"
            sub="완료·취소 제외"
            aside={open.urgent > 0 ? <Pill state="warn" label={`긴급 ${open.urgent}`} /> : undefined}
          >
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>발주번호</th>
                    {session.isHQ && <th>지점</th>}
                    <th>단계</th>
                    <th style={{ textAlign: 'right' }}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/orders/${o.id}`} className="code" style={{ color: 'var(--ink)' }}>
                          {o.order_no}
                        </Link>
                        {o.is_urgent && <span className="badge b-crit" style={{ marginLeft: 5 }}>긴급</span>}
                        {o.source === 'kiosk_auto' && (
                          <div style={{ fontSize: 10.5, color: 'var(--red)' }}>키오스크 자동</div>
                        )}
                      </td>
                      {session.isHQ && <td style={{ whiteSpace: 'nowrap' }}>{o.store?.name ?? '—'}</td>}
                      <td><StageBadge stage={o.stage} /></td>
                      <td className="num" style={{ textAlign: 'right' }}>{won(o.total_amount)}</td>
                    </tr>
                  ))}
                  {recent.length === 0 && (
                    <tr>
                      <td colSpan={session.isHQ ? 4 : 3}>
                        <Empty>진행 중인 발주가 없습니다.</Empty>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="spacer" />
              <Link className="btn btn-sm" href="/orders">발주 관리로 이동</Link>
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 14 }}>
          <LiveTicker storeId={storeId} isHQ={session.isHQ} />
        </div>
      </div>
    </>
  );
}
