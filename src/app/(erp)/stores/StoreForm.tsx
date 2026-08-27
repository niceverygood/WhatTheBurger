'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import type { StoreGrade, StoreStatus } from '@/lib/types';
import { saveStore } from './actions';
import type { RouteOpt, StoreRow } from './StoresClient';

export default function StoreForm({ routes, store }: { routes: RouteOpt[]; store?: StoreRow }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const [f, setF] = useState({
    code: store?.code ?? '',
    name: store?.name ?? '',
    sido: store?.sido ?? '',
    district: store?.district ?? '',
    route_id: store?.route?.id ?? '',
    grade: (store?.grade ?? 'franchise') as StoreGrade,
    status: (store?.status ?? 'operating') as StoreStatus,
    manager_name: store?.manager_name ?? '',
    tel: store?.tel ?? '',
    address: '',
    opened_at: store?.opened_at ?? '',
    credit_limit: String(store?.credit_limit ?? 30000000),
  });

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = () => {
    setErr('');
    start(async () => {
      const r = await saveStore({
        id: store?.id,
        ...f,
        credit_limit: Number(f.credit_limit.replace(/[^0-9]/g, '')) || 0,
      });
      if (!r.ok) { setErr(r.error ?? '저장에 실패했습니다.'); return; }
      toast(r.message ?? '', 'ok');
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        className={store ? 'btn btn-sm' : 'btn btn-primary btn-sm'}
        onClick={() => setOpen(true)}
      >
        {store ? '수정' : '+ 가맹점 등록'}
      </button>

      {open && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-label={store ? '가맹점 수정' : '가맹점 등록'}>
          <div className="modal wide">
            <div className="modal-h">
              <div className="modal-t">{store ? `${store.name} 정보 수정` : '새 가맹점 등록'}</div>
              <div className="modal-s">
                등록하면 키오스크 전용 링크가 자동으로 발급됩니다.
                담당 지점관리자 계정은 <b>계정 관리</b> 화면에서 따로 지정하세요.
              </div>
            </div>

            <div className="modal-b">
              {err && <div className="f-err" role="alert"><span>{err}</span></div>}

              <div className="f-grid">
                <div className="f-row">
                  <label htmlFor="st-code">지점 코드</label>
                  <input id="st-code" className="inp" value={f.code}
                         onChange={(e) => set('code', e.target.value)} placeholder="WTB-001" />
                </div>
                <div className="f-row">
                  <label htmlFor="st-name">지점명</label>
                  <input id="st-name" className="inp" value={f.name}
                         onChange={(e) => set('name', e.target.value)} placeholder="강남점" />
                </div>
              </div>

              <div className="f-grid">
                <div className="f-row">
                  <label htmlFor="st-sido">지역 (시·도)</label>
                  <input id="st-sido" className="inp" value={f.sido}
                         onChange={(e) => set('sido', e.target.value)} placeholder="서울" />
                </div>
                <div className="f-row">
                  <label htmlFor="st-dist">상권</label>
                  <input id="st-dist" className="inp" value={f.district}
                         onChange={(e) => set('district', e.target.value)} placeholder="강남" />
                </div>
              </div>

              <div className="f-grid">
                <div className="f-row">
                  <label htmlFor="st-route">배송 노선</label>
                  <select id="st-route" className="inp" value={f.route_id} onChange={(e) => set('route_id', e.target.value)}>
                    <option value="">노선 미지정</option>
                    {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="f-row">
                  <label htmlFor="st-grade">구분</label>
                  <select id="st-grade" className="inp" value={f.grade}
                          onChange={(e) => set('grade', e.target.value)}>
                    <option value="franchise">가맹</option>
                    <option value="direct">직영</option>
                  </select>
                </div>
              </div>

              <div className="f-grid">
                <div className="f-row">
                  <label htmlFor="st-mgr">현장 점주/담당자</label>
                  <input id="st-mgr" className="inp" value={f.manager_name}
                         onChange={(e) => set('manager_name', e.target.value)} placeholder="김민준" />
                </div>
                <div className="f-row">
                  <label htmlFor="st-tel">연락처</label>
                  <input id="st-tel" className="inp" value={f.tel}
                         onChange={(e) => set('tel', e.target.value)} placeholder="010-0000-0000" />
                </div>
              </div>

              <div className="f-grid">
                <div className="f-row">
                  <label htmlFor="st-open">오픈일</label>
                  <input id="st-open" type="date" className="inp" value={f.opened_at}
                         onChange={(e) => set('opened_at', e.target.value)} />
                </div>
                <div className="f-row">
                  <label htmlFor="st-credit">여신한도 (원)</label>
                  <input id="st-credit" className="inp" value={f.credit_limit}
                         onChange={(e) => set('credit_limit', e.target.value)} inputMode="numeric" />
                  <span className="hint">미수금이 이 금액을 넘으면 여신 위험으로 표시됩니다.</span>
                </div>
              </div>

              {store && (
                <div className="f-row">
                  <label htmlFor="st-status">운영 상태</label>
                  <select id="st-status" className="inp" value={f.status}
                          onChange={(e) => set('status', e.target.value)}>
                    <option value="operating">운영중</option>
                    <option value="suspended">휴점</option>
                    <option value="closed">폐점</option>
                  </select>
                  <span className="hint">
                    휴점·폐점으로 바꾸면 이 지점의 키오스크도 주문을 받지 않습니다.
                  </span>
                </div>
              )}
            </div>

            <div className="modal-f">
              <button type="button" className="btn" onClick={() => setOpen(false)}>취소</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
                {pending ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
