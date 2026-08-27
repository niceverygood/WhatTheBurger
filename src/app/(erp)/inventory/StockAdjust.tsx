'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { adjustStock } from './actions';

export default function StockAdjust({
  storeId, itemId, itemName, onHand,
}: {
  storeId: string; itemId: string; itemName: string; onHand: number;
}) {
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<'adjust' | 'waste'>('adjust');
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const save = () => {
    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) { toast('증감 수량을 입력해 주세요.', 'err'); return; }
    start(async () => {
      const r = await adjustStock(storeId, itemId, reason === 'waste' ? -Math.abs(d) : d, reason, note);
      toast(r.error ?? r.message ?? '', r.ok ? 'ok' : 'err');
      if (r.ok) { setOpen(false); setDelta(''); setNote(''); router.refresh(); }
    });
  };

  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>조정</button>
      {open && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="재고 조정">
          <div className="modal">
            <div className="modal-h">
              <div className="modal-t">재고 조정</div>
              <div className="modal-s">{itemName} · 현재 {onHand}</div>
            </div>
            <div className="modal-b">
              <div className="f-row">
                <label>사유</label>
                <div className="seg">
                  <button type="button" aria-pressed={reason === 'adjust'} onClick={() => setReason('adjust')}>실사 조정</button>
                  <button type="button" aria-pressed={reason === 'waste'} onClick={() => setReason('waste')}>폐기</button>
                </div>
                <span className="hint">
                  {reason === 'waste'
                    ? '입력한 수량만큼 차감합니다.'
                    : '실사 결과와의 차이를 +/− 로 입력합니다.'}
                </span>
              </div>
              <div className="f-row">
                <label htmlFor="delta">{reason === 'waste' ? '폐기 수량' : '증감 수량'}</label>
                <input
                  id="delta" type="number" className="inp" value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                  placeholder={reason === 'waste' ? '예) 12' : '예) -8 또는 20'}
                />
              </div>
              <div className="f-row">
                <label htmlFor="note">메모</label>
                <input id="note" className="inp" value={note} onChange={(e) => setNote(e.target.value)}
                       placeholder="예) 월말 실사" />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.6 }}>
                조정 내역은 재고 원장에 남아 누가 언제 왜 바꿨는지 추적할 수 있습니다.
              </div>
            </div>
            <div className="modal-f">
              <button type="button" className="btn" onClick={() => setOpen(false)}>취소</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
                {pending ? '처리 중…' : '반영'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
