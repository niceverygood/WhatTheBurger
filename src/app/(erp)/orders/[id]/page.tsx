import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import { Card, Empty, Pill, StageBadge } from '@/components/ui';
import StageControl from './StageControl';
import { dateTime, n0, won } from '@/lib/format';
import { SOURCE_KO, STAGES, STAGE_INDEX, TEMP_KO, type OrderStage, type TempZone } from '@/lib/types';

export const metadata: Metadata = { title: '발주 상세 · 왓더버거 ERP' };
export const dynamic = 'force-dynamic';

const PIPELINE = STAGES.filter((s) => STAGE_INDEX[s.k] >= 0);

interface Detail {
  id: string; order_no: string; stage: OrderStage; source: keyof typeof SOURCE_KO;
  is_urgent: boolean; ordered_at: string; ordered_ts: string; due_date: string | null;
  total_amount: number; memo: string | null; driver_name: string | null;
  store: { code: string; name: string; sido: string; manager_name: string | null; tel: string | null } | null;
  route: { name: string; driver_name: string | null; vehicle: string | null } | null;
}

interface Line {
  id: string; qty: number; unit_price: number; amount: number;
  item: { sku: string; name: string; category: string; unit: string; temp: TempZone } | null;
}

interface Event {
  id: string; stage: OrderStage; actor_name: string | null; note: string | null; created_at: string;
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createClient();

  const [{ data: order }, { data: lineData }, { data: eventData }] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select(
        'id, order_no, stage, source, is_urgent, ordered_at, ordered_ts, due_date, total_amount, memo, driver_name, store:stores(code, name, sido, manager_name, tel), route:routes(name, driver_name, vehicle)',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('purchase_order_lines')
      .select('id, qty, unit_price, amount, item:items(sku, name, category, unit, temp)')
      .eq('order_id', id),
    supabase
      .from('purchase_order_events')
      .select('id, stage, actor_name, note, created_at')
      .eq('order_id', id)
      .order('created_at', { ascending: true }),
  ]);

  // RLS 가 남의 지점 발주를 애초에 내주지 않으므로, 없으면 404 로 처리한다.
  if (!order) notFound();

  const o = order as unknown as Detail;
  const lines = (lineData ?? []) as unknown as Line[];
  const events = (eventData ?? []) as Event[];
  const cur = STAGE_INDEX[o.stage];

  return (
    <>
      <Topbar
        crumb="운영 · 발주 관리"
        title={o.order_no}
        sub={`${o.store?.name ?? ''} · ${dateTime(o.ordered_ts)} 등록`}
        name={session.profile.full_name}
        role={session.profile.role}
        action={<Link className="btn btn-sm" href="/orders">목록으로</Link>}
      />

      <div className="view">
        <div className="flow">
          {PIPELINE.map((s, i) => {
            const state = cur < 0 ? '' : i < cur ? 'done' : i === cur ? 'cur' : '';
            return (
              <span key={s.k} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <span className="flow-arm" />}
                <span className={`flow-s ${state}`}>
                  <span className="b">{i < cur ? '✓' : i + 1}</span>
                  {s.ko}
                </span>
              </span>
            );
          })}
          {cur < 0 && (
            <span style={{ marginLeft: 12 }}>
              <StageBadge stage={o.stage} />
            </span>
          )}
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
          <Card title="발주 품목" sub={`${lines.length}개 품목`} aside={<>합계 <b className="num">{won(o.total_amount)}</b></>}>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>품목</th>
                    <th>보관</th>
                    <th>구매단위</th>
                    <th style={{ textAlign: 'right' }}>수량</th>
                    <th style={{ textAlign: 'right' }}>단가</th>
                    <th style={{ textAlign: 'right' }}>금액</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="code t-mute">{l.item?.sku}</td>
                      <td>{l.item?.name}</td>
                      <td className="t-mute">{l.item ? TEMP_KO[l.item.temp] : '—'}</td>
                      <td className="t-mute">{l.item?.unit}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{n0(l.qty)}</td>
                      <td className="num t-mute" style={{ textAlign: 'right' }}>{n0(l.unit_price)}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{n0(l.amount)}</td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr><td colSpan={7}><Empty>품목이 없습니다.</Empty></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card title="발주 정보">
              <div style={{ padding: '13px 17px 4px' }}>
                <dl className="dl">
                  <dt>지점</dt>
                  <dd>
                    <span className="code t-mute">{o.store?.code}</span> {o.store?.name}
                  </dd>
                  <dt>담당자</dt>
                  <dd>{o.store?.manager_name ?? '—'}{o.store?.tel ? ` · ${o.store.tel}` : ''}</dd>
                  <dt>등록 유형</dt>
                  <dd>
                    {SOURCE_KO[o.source]}
                    {o.is_urgent && <span className="badge b-crit" style={{ marginLeft: 6 }}>긴급</span>}
                  </dd>
                  <dt>납기일</dt>
                  <dd className="num">{o.due_date ?? '—'}</dd>
                  <dt>배송 노선</dt>
                  <dd>{o.route?.name ?? '—'}</dd>
                  <dt>배송 기사</dt>
                  <dd>
                    {o.driver_name ?? o.route?.driver_name ?? '배차 전'}
                    {o.route?.vehicle ? ` · ${o.route.vehicle}` : ''}
                  </dd>
                  <dt>현재 단계</dt>
                  <dd><StageBadge stage={o.stage} /></dd>
                </dl>
                {o.memo && (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', background: 'var(--surface-2)', padding: '9px 11px', borderRadius: 6, marginBottom: 14 }}>
                    {o.memo}
                  </div>
                )}
              </div>
            </Card>

            <Card title="단계 처리" sub={session.isHQ ? '본사 운영 권한' : '지점 권한'}>
              <div style={{ padding: '13px 17px 16px' }}>
                <StageControl orderId={o.id} stage={o.stage} isHQ={session.isHQ} />
              </div>
            </Card>

            <Card title="처리 이력" sub={`${events.length}건`}>
              <div className="log-b" style={{ maxHeight: 280 }}>
                {events.length === 0 ? (
                  <div className="log-empty">기록된 이력이 없습니다.</div>
                ) : (
                  events
                    .slice()
                    .reverse()
                    .map((e) => (
                      <div className={`log-i ${e.stage === 'done' ? 'ok' : e.stage === 'hold' || e.stage === 'canceled' ? 'crit' : ''}`} key={e.id}>
                        <div className="tm">{dateTime(e.created_at)}</div>
                        <div className="tx">
                          <b>{STAGES.find((s) => s.k === e.stage)?.ko ?? e.stage}</b>
                          {' · '}
                          {e.actor_name ?? 'SYSTEM'}
                          {e.note && <div style={{ color: 'var(--ink-3)' }}>{e.note}</div>}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </Card>
          </div>
        </div>

        {o.source === 'kiosk_auto' && (
          <div style={{ marginTop: 14 }}>
            <Card title="자동 발주 근거" sub="키오스크 판매로 안전재고가 무너진 품목">
              <div style={{ padding: '13px 17px 16px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>
                이 발주는 키오스크 결제 시점에 시스템이 만들었습니다. 판매된 메뉴의 레시피(BOM)대로
                지점 재고를 차감한 뒤, 안전재고 아래로 처음 내려간 품목만 골라 안전재고의 2배까지
                채우도록 수량을 계산했습니다. 사람이 발주를 올릴 때까지 기다리지 않으므로
                결품이 발생하기 전에 물류센터가 먼저 움직일 수 있습니다.
                <div style={{ marginTop: 10 }}>
                  <Pill state="warn" label="안전재고 미달 감지" />
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
