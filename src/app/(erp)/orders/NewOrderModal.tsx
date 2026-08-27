'use client';

import { useMemo, useState, useTransition } from 'react';
import { n0, won } from '@/lib/format';
import { submitOrder } from './actions';

export interface ItemOpt {
  id: string; sku: string; name: string; category: string; unit: string; price: number;
}
interface StoreOpt { id: string; code: string; name: string }
interface Line { item_id: string; qty: number }

export default function NewOrderModal({
  stores, items, isHQ, myStoreId, onCreated,
}: {
  stores: StoreOpt[];
  items: ItemOpt[];
  isHQ: boolean;
  myStoreId: string | null;
  onCreated: (orderNo: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [storeId, setStoreId] = useState(myStoreId ?? '');
  const [lines, setLines] = useState<Line[]>([]);
  const [memo, setMemo] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [cat, setCat] = useState('전체');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const cats = useMemo(() => ['전체', ...Array.from(new Set(items.map((i) => i.category)))], [items]);

  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (cat === '전체' || i.category === cat) &&
          (!q || i.name.includes(q) || i.sku.toLowerCase().includes(q.toLowerCase())),
      ),
    [items, cat, q],
  );

  const qtyOf = (id: string) => lines.find((l) => l.item_id === id)?.qty ?? 0;

  const setQty = (id: string, qty: number) =>
    setLines((v) => {
      const rest = v.filter((l) => l.item_id !== id);
      return qty > 0 ? [...rest, { item_id: id, qty }] : rest;
    });

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const total = lines.reduce((a, l) => a + (byId.get(l.item_id)?.price ?? 0) * l.qty, 0);

  const reset = () => {
    setLines([]); setMemo(''); setUrgent(false); setErr(''); setQ(''); setCat('전체');
  };

  const save = () => {
    setErr('');
    const target = isHQ ? storeId : myStoreId;
    if (!target) { setErr('발주할 지점을 선택해 주세요.'); return; }
    if (lines.length === 0) { setErr('품목 수량을 하나 이상 입력해 주세요.'); return; }

    start(async () => {
      const r = await submitOrder(target, lines, memo, urgent);
      if (!r.ok) { setErr(r.error ?? '등록에 실패했습니다.'); return; }
      setOpen(false);
      reset();
      onCreated(r.orderNo ?? '');
    });
  };

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        + 발주 등록
      </button>

      {open && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="발주 등록">
          <div className="modal wide" style={{ maxWidth: 760 }}>
            <div className="modal-h">
              <div className="modal-t">발주 등록</div>
              <div className="modal-s">
                등록하면 <b>접수</b> 단계로 들어가고, 본사 승인 후 물류센터 재고가 할당됩니다.
              </div>
            </div>

            <div className="modal-b">
              {err && <div className="f-err" role="alert"><span>{err}</span></div>}

              {isHQ && (
                <div className="f-row">
                  <label htmlFor="o-store">발주 지점</label>
                  <select id="o-store" className="inp" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                    <option value="">지점을 선택하세요</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="toolbar" style={{ marginBottom: 0 }}>
                <div className="field">
                  <label htmlFor="o-cat">분류</label>
                  <select id="o-cat" className="ctl" value={cat} onChange={(e) => setCat(e.target.value)}>
                    {cats.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="o-q">품목 검색</label>
                  <input id="o-q" className="ctl" style={{ width: 180 }} value={q}
                         onChange={(e) => setQ(e.target.value)} placeholder="이름 또는 SKU" />
                </div>
                <span className="spacer" />
                <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                  선택 <b className="num">{lines.length}</b>품목
                </span>
              </div>

              <div className="tbl-wrap" style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
                <table>
                  <thead>
                    <tr>
                      <th>품목</th>
                      <th>구매단위</th>
                      <th style={{ textAlign: 'right' }}>공급가</th>
                      <th style={{ width: 96, textAlign: 'right' }}>수량</th>
                      <th style={{ textAlign: 'right' }}>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((i) => {
                      const qty = qtyOf(i.id);
                      return (
                        <tr key={i.id}>
                          <td>
                            <span className="code t-mute">{i.sku}</span> {i.name}
                          </td>
                          <td className="t-mute">{i.unit}</td>
                          <td className="num" style={{ textAlign: 'right' }}>{n0(i.price)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number" min={0} max={9999} className="ctl"
                              style={{ width: 74, textAlign: 'right' }}
                              value={qty || ''}
                              placeholder="0"
                              onChange={(e) => setQty(i.id, Math.max(0, Number(e.target.value) || 0))}
                              aria-label={`${i.name} 수량`}
                            />
                          </td>
                          <td className="num" style={{ textAlign: 'right', fontWeight: qty ? 600 : 400 }}>
                            {qty ? n0(i.price * qty) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {visible.length === 0 && (
                      <tr><td colSpan={5}><div className="empty">해당하는 품목이 없습니다.</div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="f-grid">
                <div className="f-row">
                  <label htmlFor="o-memo">메모</label>
                  <input id="o-memo" className="inp" value={memo} onChange={(e) => setMemo(e.target.value)}
                         placeholder="예) 주말 프로모션 대비 추가" />
                </div>
                <div className="f-row">
                  <label htmlFor="o-urgent">긴급 여부</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, paddingTop: 8 }}>
                    <input id="o-urgent" type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
                    긴급 발주로 표시 (배차 우선)
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-f">
              <span style={{ marginRight: 'auto', fontSize: 13 }}>
                합계 <b className="num" style={{ fontSize: 15 }}>{won(total)}</b>
              </span>
              <button type="button" className="btn" onClick={() => { setOpen(false); reset(); }}>취소</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={pending || total === 0}>
                {pending ? '등록 중…' : '발주 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
