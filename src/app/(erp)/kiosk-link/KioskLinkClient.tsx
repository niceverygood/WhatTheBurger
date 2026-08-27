'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, Empty, Meter, Pill, type State } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { hms, n0, dateTime } from '@/lib/format';
import { rotateToken, setKioskEnabled } from './actions';

export interface StoreLink {
  id: string; code: string; name: string; kiosk_token: string; kiosk_enabled: boolean;
}
export interface StockRow {
  item_id: string; sku: string; item_name: string; on_hand: number; safety_stock: number;
}
export interface SaleRow {
  id: string; order_no: string; total: number; item_count: number; paid_at: string; order_type: string;
}

interface Entry { id: string; kind: '' | 'ok' | 'warn' | 'ai'; time: string; body: ReactNode }

const stateOf = (on: number, safety: number): State =>
  safety <= 0 ? 'idle' : on <= safety * 0.5 ? 'crit' : on < safety ? 'warn' : 'ok';

export default function KioskLinkClient({
  store, origin, qrSvg, stock, sales, todayStats, isHQ,
}: {
  store: StoreLink;
  origin: string;
  qrSvg: string;
  stock: StockRow[];
  sales: SaleRow[];
  todayStats: { sales: number; count: number; avg: number };
  isHQ: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, start] = useTransition();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 로그 문구에 품목명을 붙이려고 재고 목록을 참조한다.
  // 의존성에 넣으면 새로고침마다 채널이 다시 붙어 이벤트를 놓치므로 ref 로 들고 있는다.
  const stockRef = useRef(stock);
  stockRef.current = stock;

  const url = `${origin}/kiosk/${store.kiosk_token}`;

  useEffect(() => {
    const supabase = createClient();
    const add = (e: Omit<Entry, 'id'>) =>
      setEntries((v) => [{ ...e, id: `${Date.now()}-${Math.random()}` }, ...v].slice(0, 60));

    const nudge = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 1200);
    };

    const channel = supabase
      .channel(`kiosk-${store.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'kiosk_orders', filter: `store_id=eq.${store.id}` },
        (p) => {
          const r = p.new as SaleRow;
          add({
            kind: 'ok',
            time: hms(r.paid_at),
            body: <> <b>{r.order_no}</b> 결제 완료 · {r.item_count}개 · <b>{n0(r.total)}원</b></>,
          });
          nudge();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'store_stock', filter: `store_id=eq.${store.id}` },
        (p) => {
          const before = p.old as Partial<StockRow & { on_hand: number }>;
          const after = p.new as { item_id: string; on_hand: number; safety_stock: number };
          if (before?.on_hand == null) return;
          const used = Number(before.on_hand) - Number(after.on_hand);
          if (used <= 0) return;
          const item = stockRef.current.find((s) => s.item_id === after.item_id);
          const crossed =
            Number(before.on_hand) >= Number(after.safety_stock) &&
            Number(after.on_hand) < Number(after.safety_stock) &&
            Number(after.safety_stock) > 0;
          add({
            kind: crossed ? 'warn' : '',
            time: hms(new Date()),
            body: crossed ? (
              <>
                <b>{item?.item_name ?? after.item_id.slice(0, 8)}</b> 안전재고 미달 — 잔여{' '}
                {n0(Number(after.on_hand))} / 기준 {n0(Number(after.safety_stock))}
              </>
            ) : (
              <>
                레시피 차감 · {item?.item_name ?? '품목'} −{n0(used)} → 잔여 {n0(Number(after.on_hand))}
              </>
            ),
          });
          nudge();
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'purchase_orders', filter: `store_id=eq.${store.id}` },
        (p) => {
          const r = p.new as { order_no: string; source: string; total_amount: number };
          if (r.source !== 'kiosk_auto') return;
          add({
            kind: 'ai',
            time: hms(new Date()),
            body: (
              <>
                자동발주 <b>{r.order_no}</b> 생성 · {n0(r.total_amount)}원 — ERP 발주 파이프라인으로 전송
              </>
            ),
          });
          nudge();
        },
      )
      .subscribe((s) => setLive(s === 'SUBSCRIBED'));

    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [store.id, router]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('키오스크 링크를 복사했습니다.', 'ok');
    } catch {
      toast('복사에 실패했습니다. 주소를 직접 선택해 복사해 주세요.', 'err');
    }
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      toast(r.error ?? r.message ?? '', r.ok ? 'ok' : 'err');
      if (r.ok) router.refresh();
    });

  const low = stock.filter((s) => s.safety_stock > 0 && s.on_hand <= s.safety_stock);

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr', alignItems: 'start' }}>
        <Card
          title="태블릿 접속 링크"
          sub={store.name}
          aside={
            store.kiosk_enabled
              ? <Pill state="ok" label="사용 중" />
              : <Pill state="idle" label="일시 중지" />
          }
        >
          <div style={{ padding: '14px 17px 17px' }}>
            <div className="qr-card" style={{ padding: 0, marginBottom: 14 }}>
              <span dangerouslySetInnerHTML={{ __html: qrSvg }} />
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.75 }}>
                태블릿 브라우저에서 이 QR을 찍거나 아래 주소를 열면
                <br />
                <b>로그인 없이</b> 이 매장 전용 키오스크가 실행됩니다.
                <br />
                <span style={{ color: 'var(--ink-4)', fontSize: 11.5 }}>
                  전체화면(홈 화면에 추가)으로 띄우면 실제 단말처럼 동작합니다.
                </span>
              </div>
            </div>

            <div className="link-box">
              <code>{url}</code>
              <button type="button" className="btn btn-sm" onClick={copy}>복사</button>
              <a className="btn btn-sm" href={url} target="_blank" rel="noreferrer">열기</a>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => run(() => setKioskEnabled(store.id, !store.kiosk_enabled))}
              >
                {store.kiosk_enabled ? '일시 중지' : '사용 재개'}
              </button>
              {isHQ && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    if (confirm('링크를 재발급하면 기존 주소는 즉시 사용할 수 없습니다.\n매장 태블릿을 새 주소로 다시 열어야 합니다. 계속할까요?')) {
                      run(() => rotateToken(store.id));
                    }
                  }}
                >
                  링크 재발급
                </button>
              )}
            </div>

            <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.7 }}>
              이 주소는 매장 단말의 열쇠입니다. 외부에 공개되지 않도록 관리하고,
              유출이 의심되면 바로 재발급하세요.
            </div>
          </div>
        </Card>

        <Card
          title="연동 상태"
          sub="키오스크 → ERP"
          aside={
            <span className="live-chip">
              <span className={`live-dot ${live ? '' : 'off'}`} />
              {live ? '실시간 연결됨' : '연결 대기'}
            </span>
          }
        >
          <div style={{ padding: '14px 17px 6px' }}>
            <div className="kio-row" style={{ color: 'var(--ink-3)' }}>
              <span>오늘 매출</span>
              <b className="num" style={{ color: 'var(--ink)' }}>{n0(todayStats.sales)}원</b>
            </div>
            <div className="kio-row" style={{ color: 'var(--ink-3)' }}>
              <span>거래 건수</span>
              <b className="num" style={{ color: 'var(--ink)' }}>{n0(todayStats.count)}건</b>
            </div>
            <div className="kio-row" style={{ color: 'var(--ink-3)' }}>
              <span>객단가</span>
              <b className="num" style={{ color: 'var(--ink)' }}>{n0(todayStats.avg)}원</b>
            </div>
            <div className="kio-row" style={{ color: 'var(--ink-3)' }}>
              <span>안전재고 미달 품목</span>
              <b className="num" style={{ color: low.length ? 'var(--crit)' : 'var(--ink)' }}>
                {low.length}개
              </b>
            </div>
          </div>

          <div className="sec-t" style={{ margin: '10px 17px 0' }}>동작 흐름</div>
          <div style={{ padding: '10px 17px 17px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.8 }}>
            <b>1</b> 태블릿에서 결제 → <b>2</b> 메뉴 레시피(BOM)대로 지점 재고 차감 →{' '}
            <b>3</b> 안전재고 아래로 내려간 품목 판정 → <b>4</b> 자동발주 생성 →{' '}
            <b>5</b> 본사 발주 파이프라인 접수
            <div style={{ marginTop: 8, color: 'var(--ink-4)', fontSize: 11.5 }}>
              1~4는 하나의 트랜잭션입니다. 중간에 실패하면 판매도 차감도 남지 않습니다.
            </div>
          </div>
        </Card>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 14, alignItems: 'start' }}>
        <Card title="실시간 연동 로그" sub="판매 · 차감 · 자동발주">
          <div className="log-b" style={{ maxHeight: 340 }}>
            {entries.length === 0 ? (
              <div className="log-empty">
                아직 판매가 없습니다.
                <br />
                키오스크 링크를 태블릿에서 열고 결제해 보세요.
                <br />
                <span style={{ fontSize: 11 }}>
                  레시피 차감 → 안전재고 판정 → 자동발주까지
                  <br />
                  여기에 실시간으로 기록됩니다
                </span>
              </div>
            ) : (
              entries.map((e) => (
                <div className={`log-i ${e.kind}`} key={e.id}>
                  <div className="tm">{e.time}</div>
                  <div className="tx">{e.body}</div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="지점 재고" sub="키오스크 판매로 차감되는 원재료" aside={`${stock.length}개 품목`}>
          <div className="tbl-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>품목</th>
                  <th style={{ textAlign: 'right' }}>보유</th>
                  <th style={{ textAlign: 'right' }}>안전</th>
                  <th style={{ width: 92 }}>수준</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => {
                  const st = stateOf(s.on_hand, s.safety_stock);
                  return (
                    <tr key={s.item_id}>
                      <td>
                        <span className="code t-mute">{s.sku}</span> {s.item_name}
                      </td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: st === 'ok' ? 400 : 700 }}>
                        {n0(s.on_hand)}
                      </td>
                      <td className="num t-mute" style={{ textAlign: 'right' }}>{n0(s.safety_stock)}</td>
                      <td>
                        <Meter ratio={s.safety_stock ? s.on_hand / s.safety_stock : 1} state={st} />
                      </td>
                    </tr>
                  );
                })}
                {stock.length === 0 && (
                  <tr><td colSpan={4}><Empty>등록된 지점 재고가 없습니다.</Empty></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="최근 키오스크 주문" sub="최근 20건">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>주문번호</th>
                  <th>결제 시각</th>
                  <th>유형</th>
                  <th style={{ textAlign: 'right' }}>수량</th>
                  <th style={{ textAlign: 'right' }}>금액</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td className="code">{s.order_no}</td>
                    <td className="num t-mute">{dateTime(s.paid_at)}</td>
                    <td className="t-mute">{s.order_type === 'takeout' ? '포장' : '매장'}</td>
                    <td className="num" style={{ textAlign: 'right' }}>{s.item_count}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{n0(s.total)}원</td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr><td colSpan={5}><Empty>아직 키오스크 주문이 없습니다.</Empty></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
