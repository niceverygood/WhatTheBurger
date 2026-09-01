'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { n0 } from '@/lib/format';

export interface KioskMenu {
  id: string; code: string; category: string; name: string;
  price: number; emoji: string; sort: number; servable: number;
}
export interface KioskStore { id: string; code: string; name: string }
interface Stats { sales: number; count: number; avg: number }

interface Bootstrap {
  ok: true;
  store: KioskStore;
  menus: KioskMenu[];
  stats: { sales: number; count: number; avg: number };
  recent: { order_no: string; total: number; paid_at: string }[];
}

interface CheckoutOk {
  ok: true;
  order_no: string;
  total: number;
  item_count: number;
  crossed: { sku: string; name: string; left: number; safety: number }[];
  auto_order: { id: string; order_no: string } | null;
}
interface CheckoutErr {
  ok: false;
  error: string;
  shortages?: { sku: string; name: string; need: number; have: number }[];
}

const CATS = ['버거', '세트', '사이드', '음료'];
const CATEGORY_IMAGE: Record<string, string> = {
  버거: '/images/menu/signature-burger-v2.png',
  세트: '/images/menu/burger-set-v2.png',
  사이드: '/images/menu/crispy-fries-v2.png',
  음료: '/images/menu/chilled-cola-v2.png',
};

export default function KioskTerminal({
  token, initial,
}: {
  token: string;
  initial: Bootstrap;
}) {
  const [menus, setMenus] = useState<KioskMenu[]>(initial.menus);
  const [stats, setStats] = useState<Stats>({
    sales: initial.stats.sales, count: initial.stats.count, avg: initial.stats.avg,
  });
  const [tab, setTab] = useState(CATS[0]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orderType, setOrderType] = useState<'dine_in' | 'takeout'>('dine_in');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<CheckoutOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byId = useMemo(() => new Map(menus.map((m) => [m.id, m])), [menus]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk/${token}`, { cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as Bootstrap;
      if (body.ok) {
        setMenus(body.menus);
        setStats({ sales: body.stats.sales, count: body.stats.count, avg: body.stats.avg });
      }
    } catch {
      /* 일시적인 네트워크 문제는 다음 주기에 회복된다 */
    }
  }, [token]);

  // 본사에서 입고를 확정하면 판매 가능 수량이 늘어난다. 주기적으로 맞춰 준다.
  useEffect(() => {
    const id = setInterval(refresh, 20_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => () => { if (doneTimer.current) clearTimeout(doneTimer.current); }, []);

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = Object.entries(cart).reduce(
    (a, [id, q]) => a + (byId.get(id)?.price ?? 0) * q, 0,
  );

  /** 장바구니에 담은 만큼을 뺀 잔여 판매 가능 수량 */
  const remainingOf = (m: KioskMenu) => m.servable - (cart[m.id] ?? 0);

  const add = (m: KioskMenu) => {
    if (remainingOf(m) <= 0) return;
    setError(null);
    setCart((c) => ({ ...c, [m.id]: (c[m.id] ?? 0) + 1 }));
  };

  const dec = (id: string) =>
    setCart((c) => {
      const q = (c[id] ?? 0) - 1;
      const next = { ...c };
      if (q <= 0) delete next[id];
      else next[id] = q;
      return next;
    });

  const removeLine = (id: string) =>
    setCart((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });

  const pay = async () => {
    if (busy || cartCount === 0) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/kiosk/${token}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: Object.entries(cart).map(([menu_id, qty]) => ({ menu_id, qty })),
          order_type: orderType,
        }),
      });
      const body = (await res.json()) as CheckoutOk | CheckoutErr;

      if (!body.ok) {
        const err = body as CheckoutErr;
        if (err.error === 'OUT_OF_STOCK' && err.shortages?.length) {
          setError(
            `재료가 부족합니다 — ${err.shortages
              .slice(0, 3)
              .map((s) => `${s.name} (보유 ${n0(s.have)})`)
              .join(', ')}`,
          );
        } else if (err.error === 'KIOSK_DISABLED') {
          setError('이 단말은 현재 사용할 수 없습니다. 매장 관리자에게 문의해 주세요.');
        } else {
          setError('결제를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
        await refresh();
        return;
      }

      setDone(body);
      setCart({});
      await refresh();
      doneTimer.current = setTimeout(() => setDone(null), 5000);
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const visible = menus.filter((m) => m.category === tab);
  const lines = Object.entries(cart);

  return (
    <div className="kiosk-page">
      <div className="kio kio-wrap">
        <div className="kio-top">
          <span className="lg">WHAT THE BURGER</span>
          <span style={{ fontSize: 11.5, opacity: 0.85 }}>KIOSK 01</span>
          <span className="st">
            {initial.store.name} · {initial.store.code}
          </span>
        </div>

        <div className="kio-tabs">
          {CATS.map((c) => (
            <button
              key={c}
              type="button"
              className={`kio-tab ${c === tab ? 'on' : ''}`}
              onClick={() => setTab(c)}
            >
              {c}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, padding: '0 6px 0 0', alignItems: 'center' }}>
            <button
              type="button"
              className={`kio-tab ${orderType === 'dine_in' ? 'on' : ''}`}
              onClick={() => setOrderType('dine_in')}
            >
              매장
            </button>
            <button
              type="button"
              className={`kio-tab ${orderType === 'takeout' ? 'on' : ''}`}
              onClick={() => setOrderType('takeout')}
            >
              포장
            </button>
          </div>
        </div>

        <div className="kio-body">
          <div className="kio-menu">
            {visible.map((m) => {
              const left = remainingOf(m);
              return (
                <button
                  key={m.id}
                  type="button"
                  className="kio-item"
                  disabled={left <= 0}
                  onClick={() => add(m)}
                >
                  <span className="kio-photo">
                    <Image
                      src={CATEGORY_IMAGE[m.category] ?? CATEGORY_IMAGE.버거}
                      alt=""
                      fill
                      sizes="(max-width: 820px) 42vw, (max-width: 1180px) 25vw, 220px"
                      priority={m.sort < 4}
                    />
                    <span className="kio-photo-badge" aria-hidden="true">{m.emoji}</span>
                  </span>
                  <span className="nm">{m.name}</span>
                  <span className="pr">{n0(m.price)}원</span>
                  {left <= 0 ? (
                    <span className="so">재료 소진 — 판매 불가</span>
                  ) : left < 6 ? (
                    <span className="so">잔여 {left}개</span>
                  ) : null}
                </button>
              );
            })}
            {visible.length === 0 && (
              <div className="kio-empty" style={{ gridColumn: '1 / -1' }}>
                이 분류에 등록된 메뉴가 없습니다.
              </div>
            )}
          </div>

          <div className="kio-cart">
            <h4>주문 내역 · {orderType === 'dine_in' ? '매장 식사' : '포장'}</h4>

            <div className="kio-lines">
              {lines.length === 0 ? (
                <div className="kio-empty">
                  메뉴를 선택해 주세요
                  <br />
                  <span style={{ fontSize: 11 }}>결제하면 ERP 재고가 즉시 차감됩니다</span>
                </div>
              ) : (
                lines.map(([id, q]) => {
                  const m = byId.get(id);
                  if (!m) return null;
                  return (
                    <div className="kio-line" key={id}>
                      <span className="n">
                        {m.emoji} {m.name}
                      </span>
                      <span className="kio-qty">
                        <button type="button" onClick={() => dec(id)} aria-label={`${m.name} 하나 빼기`}>−</button>
                        <span className="q">{q}</span>
                        <button
                          type="button"
                          onClick={() => add(m)}
                          disabled={remainingOf(m) <= 0}
                          aria-label={`${m.name} 하나 더`}
                        >
                          +
                        </button>
                      </span>
                      <span className="q">{n0(m.price * q)}</span>
                      <button className="x" type="button" onClick={() => removeLine(id)} aria-label="삭제">
                        ×
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="kio-sum">
              {error && (
                <div
                  style={{
                    background: 'rgba(198,32,44,.18)', color: '#F0A0A6', borderRadius: 6,
                    padding: '8px 10px', fontSize: 11.5, lineHeight: 1.5, marginBottom: 10,
                  }}
                  role="alert"
                >
                  {error}
                </div>
              )}
              <div className="kio-row">
                <span>상품 {cartCount}개</span>
                <span className="num">{n0(total)}원</span>
              </div>
              <div className="kio-row">
                <span>부가세 포함</span>
                <span className="num">—</span>
              </div>
              <div className="kio-row t">
                <span>결제금액</span>
                <span className="num">{n0(total)}원</span>
              </div>
              <button className="kio-pay" type="button" onClick={pay} disabled={busy || total === 0}>
                {busy ? '결제 처리 중…' : '결제하기'}
              </button>
              <div style={{ marginTop: 10, fontSize: 10.5, color: '#6E675E', textAlign: 'center', lineHeight: 1.6 }}>
                오늘 {stats.count}건 · {n0(stats.sales)}원
              </div>
            </div>
          </div>
        </div>

        {done && (
          <div className="kio-done">
            <div>
              <div style={{ fontSize: 12, letterSpacing: '.14em', color: '#8B8378' }}>ORDER NUMBER</div>
              <div className="kio-no">{done.order_no}</div>
              <div style={{ fontSize: 14, color: '#C9C2B8' }}>
                결제 완료 · {n0(done.total)}원 · {done.item_count}개
              </div>

              {done.crossed.length > 0 && (
                <div style={{ marginTop: 16, fontSize: 12, color: '#E0C67A', lineHeight: 1.7 }}>
                  안전재고 미달 감지 —{' '}
                  {done.crossed.slice(0, 3).map((c) => c.name).join(', ')}
                  {done.crossed.length > 3 && ` 외 ${done.crossed.length - 3}`}
                </div>
              )}

              {done.auto_order && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#F0A0A6', lineHeight: 1.7 }}>
                  자동발주 <b>{done.auto_order.order_no}</b> 생성
                  <br />
                  본사 ERP 발주 파이프라인으로 전송되었습니다
                </div>
              )}

              <button
                type="button"
                className="btn btn-sm"
                style={{ marginTop: 20 }}
                onClick={() => setDone(null)}
              >
                다음 주문
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
