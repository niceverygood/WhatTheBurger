'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { NEXT_STAGES, STAGE_KO, type OrderStage } from '@/lib/types';
import { advanceStage } from '../actions';

export default function StageControl({
  orderId, stage, isHQ,
}: {
  orderId: string;
  stage: OrderStage;
  isHQ: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [note, setNote] = useState('');

  // 지점관리자는 접수 상태에서 보류·취소만 가능하다(DB 에서도 같은 규칙으로 막는다).
  const options: OrderStage[] = isHQ
    ? NEXT_STAGES[stage]
    : stage === 'received'
      ? ['hold', 'canceled']
      : [];

  if (options.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 }}>
        {stage === 'done'
          ? '납품이 확인되어 매입이 확정된 발주입니다.'
          : stage === 'canceled'
            ? '취소된 발주입니다.'
            : '현재 권한으로 변경할 수 있는 단계가 없습니다. 본사 운영팀이 처리합니다.'}
      </div>
    );
  }

  const go = (next: OrderStage) => {
    if ((next === 'canceled' || next === 'hold') && !confirm(
      `${STAGE_KO[next]} 상태로 변경할까요?${next === 'canceled' ? '\n취소하면 되돌릴 수 없습니다.' : ''}`,
    )) return;

    start(async () => {
      const r = await advanceStage(orderId, next, note.trim() || undefined);
      toast(r.error ?? r.message ?? '', r.ok ? 'ok' : 'err');
      if (r.ok) { setNote(''); router.refresh(); }
    });
  };

  return (
    <div>
      <div className="f-row" style={{ marginBottom: 10 }}>
        <label htmlFor="note">처리 메모 (선택)</label>
        <input id="note" className="inp" value={note} onChange={(e) => setNote(e.target.value)}
               placeholder="예) 여신 한도 초과로 보류" />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((k) => (
          <button
            key={k}
            type="button"
            className={`btn ${k === 'hold' || k === 'canceled' ? '' : 'btn-primary'}`}
            disabled={pending}
            onClick={() => go(k)}
          >
            {pending ? '처리 중…' : `${STAGE_KO[k]}(으)로 이동`}
          </button>
        ))}
      </div>
    </div>
  );
}
