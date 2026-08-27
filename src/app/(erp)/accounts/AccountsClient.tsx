'use client';

import { useActionState, useMemo, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { Card, Empty, Pill } from '@/components/ui';
import { ROLE_KO, type Profile, type UserRole } from '@/lib/types';
import { dateTime, relative } from '@/lib/format';
import {
  createAccount, resetPassword, setActive, deleteAccount, reassignStore,
  type ActionResult,
} from './actions';

interface StoreOpt { id: string; code: string; name: string; sido: string }
type Row = Profile & { store: { code: string; name: string } | null };

const EMPTY: ActionResult = { ok: false };

function SubmitBtn({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? busy : label}
    </button>
  );
}

/* ---------------------------------------------------------------- 발급 결과 */
function CredentialsPanel({ cred, onClose }: { cred: NonNullable<ActionResult['credentials']>; onClose: () => void }) {
  const toast = useToast();
  const text = `왓더버거 ERP 접속 정보\n주소: ${typeof window !== 'undefined' ? window.location.origin : ''}/login\n아이디: ${cred.email}\n비밀번호: ${cred.password}`;

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="발급된 계정 정보">
      <div className="modal">
        <div className="modal-h">
          <div className="modal-t">{cred.name} 님 계정 정보</div>
          <div className="modal-s">
            비밀번호는 <b>지금 이 화면에서만</b> 확인할 수 있습니다. 창을 닫으면 다시 볼 수 없고,
            필요하면 재발급해야 합니다.
          </div>
        </div>
        <div className="modal-b">
          <div className="cred-box">
            <div><span className="k">아이디</span>{cred.email}</div>
            <div><span className="k">비밀번호</span>{cred.password}</div>
          </div>
          <div className="copy-row">
            <button
              type="button"
              className="btn btn-sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  toast('접속 정보를 복사했습니다.', 'ok');
                } catch {
                  toast('복사에 실패했습니다. 직접 선택해 복사해 주세요.', 'err');
                }
              }}
            >
              접속 정보 복사
            </button>
            <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
              담당자에게 안전한 경로로 전달해 주세요.
            </span>
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-primary" onClick={onClose}>확인했습니다</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 계정 발급 폼 */
function CreateModal({ stores, onDone }: { stores: StoreOpt[]; onDone: (r: ActionResult) => void }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<UserRole>('store_manager');
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, fd) => {
      const r = await createAccount(prev, fd);
      if (r.ok) { setOpen(false); onDone(r); }
      return r;
    },
    EMPTY,
  );

  // 이미 담당자가 있는 지점도 목록에는 남겨 둔다(교체 발령이 있을 수 있어서).
  const grouped = useMemo(() => {
    const m = new Map<string, StoreOpt[]>();
    stores.forEach((s) => {
      const list = m.get(s.sido) ?? [];
      list.push(s);
      m.set(s.sido, list);
    });
    return [...m.entries()];
  }, [stores]);

  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        + 계정 발급
      </button>

      {open && (
        <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="계정 발급">
          <form action={action} className="modal wide">
            <div className="modal-h">
              <div className="modal-t">새 계정 발급</div>
              <div className="modal-s">
                본사 총괄관리자만 계정을 만들 수 있습니다. 아이디(이메일)와 초기 비밀번호를
                발급해 담당자에게 전달하세요.
              </div>
            </div>

            <div className="modal-b">
              {state.error && (
                <div className="f-err" role="alert">
                  <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M9 2.2l6.6 11.6H2.4zM9 7v3.4M9 12.2v.1" strokeLinejoin="round" />
                  </svg>
                  <span>{state.error}</span>
                </div>
              )}

              <div className="f-row">
                <label>권한</label>
                <div className="seg">
                  <button type="button" aria-pressed={role === 'store_manager'} onClick={() => setRole('store_manager')}>
                    지점관리자
                  </button>
                  <button type="button" aria-pressed={role === 'hq_admin'} onClick={() => setRole('hq_admin')}>
                    본사 총괄관리자
                  </button>
                </div>
                <input type="hidden" name="role" value={role} />
                <span className="hint">
                  {role === 'store_manager'
                    ? '담당 지점의 발주·재고·정산만 볼 수 있습니다.'
                    : '전 지점 데이터와 계정 관리 권한을 모두 갖습니다.'}
                </span>
              </div>

              {role === 'store_manager' && (
                <div className="f-row">
                  <label htmlFor="store_id">담당 지점</label>
                  <select id="store_id" name="store_id" className="inp" required defaultValue="">
                    <option value="" disabled>지점을 선택하세요</option>
                    {grouped.map(([sido, list]) => (
                      <optgroup key={sido} label={sido}>
                        {list.map((s) => (
                          <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}

              <div className="f-grid">
                <div className="f-row">
                  <label htmlFor="full_name">이름</label>
                  <input id="full_name" name="full_name" className="inp" required placeholder="김민준" />
                </div>
                <div className="f-row">
                  <label htmlFor="phone">연락처</label>
                  <input id="phone" name="phone" className="inp" placeholder="010-0000-0000" />
                </div>
              </div>

              <div className="f-row">
                <label htmlFor="new_email">아이디 (이메일)</label>
                <input id="new_email" name="email" type="email" className="inp" required
                       placeholder="gangnam@whattheburger.co.kr" autoComplete="off" />
              </div>

              <div className="f-row">
                <label htmlFor="new_password">초기 비밀번호</label>
                <input id="new_password" name="password" className="inp" autoComplete="new-password"
                       placeholder="비워 두면 안전한 임시 비밀번호를 자동 생성합니다" />
                <span className="hint">
                  직접 정할 경우 8자 이상. 발급 후 담당자가 바꾸도록 안내해 주세요.
                </span>
              </div>
            </div>

            <div className="modal-f">
              <button type="button" className="btn" onClick={() => setOpen(false)}>취소</button>
              <SubmitBtn label="계정 발급" busy="발급 중…" />
            </div>
          </form>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- 비밀번호 재발급 */
function ResetModal({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: (r: ActionResult) => void }) {
  const [state, action] = useActionState<ActionResult, FormData>(
    async (prev, fd) => {
      const r = await resetPassword(prev, fd);
      if (r.ok) { onClose(); onDone(r); }
      return r;
    },
    EMPTY,
  );

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="비밀번호 재발급">
      <form action={action} className="modal">
        <div className="modal-h">
          <div className="modal-t">비밀번호 재발급</div>
          <div className="modal-s">{row.full_name} · {row.email}</div>
        </div>
        <div className="modal-b">
          {state.error && <div className="f-err" role="alert"><span>{state.error}</span></div>}
          <input type="hidden" name="user_id" value={row.id} />
          <div className="f-row">
            <label htmlFor="reset_pw">새 비밀번호</label>
            <input id="reset_pw" name="password" className="inp" autoComplete="new-password"
                   placeholder="비워 두면 자동 생성" />
            <span className="hint">재발급하면 기존 비밀번호는 즉시 사용할 수 없습니다.</span>
          </div>
        </div>
        <div className="modal-f">
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <SubmitBtn label="재발급" busy="처리 중…" />
        </div>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------- 본문 */
export default function AccountsClient({
  rows, stores, meId,
}: {
  rows: Row[];
  stores: StoreOpt[];
  meId: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [cred, setCred] = useState<ActionResult['credentials'] | null>(null);
  const [resetting, setResetting] = useState<Row | null>(null);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');

  const onDone = (r: ActionResult) => {
    if (r.message) toast(r.message, 'ok');
    if (r.credentials) setCred(r.credentials);
    startTransition(() => router.refresh());
  };

  const run = (fn: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const r = await fn();
      toast(r.error ?? r.message ?? '', r.ok ? 'ok' : 'err');
      if (r.ok) router.refresh();
    });
  };

  const filtered = rows.filter((r) => {
    if (roleFilter !== 'all' && r.role !== roleFilter) return false;
    if (!q) return true;
    const hay = `${r.full_name} ${r.email} ${r.store?.name ?? ''} ${r.store?.code ?? ''}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const hqCount = rows.filter((r) => r.role === 'hq_admin').length;
  const unassigned = stores.filter((s) => !rows.some((r) => r.store_id === s.id && r.is_active)).length;

  return (
    <>
      <div className="toolbar">
        <div className="field">
          <label htmlFor="q">검색</label>
          <input id="q" className="ctl" style={{ width: 210 }} value={q}
                 onChange={(e) => setQ(e.target.value)} placeholder="이름 · 이메일 · 지점" />
        </div>
        <div className="field">
          <label htmlFor="rf">권한</label>
          <select id="rf" className="ctl" value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}>
            <option value="all">전체 ({rows.length})</option>
            <option value="hq_admin">본사 총괄관리자 ({hqCount})</option>
            <option value="store_manager">지점관리자 ({rows.length - hqCount})</option>
          </select>
        </div>
        <span className="spacer" />
        {unassigned > 0 && (
          <span className="badge b-warn">
            담당자 미지정 지점 {unassigned}곳
          </span>
        )}
        <CreateModal stores={stores} onDone={onDone} />
      </div>

      <Card
        title="계정 목록"
        sub={`${filtered.length}명`}
        aside="비밀번호는 저장되지 않으며, 재발급으로만 변경합니다"
      >
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>아이디 (이메일)</th>
                <th>권한</th>
                <th>담당 지점</th>
                <th>상태</th>
                <th>마지막 접속</th>
                <th style={{ textAlign: 'right' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.full_name}</b>
                    {r.id === meId && <span style={{ color: 'var(--ink-4)', marginLeft: 6, fontSize: 11 }}>(본인)</span>}
                    {r.phone && <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{r.phone}</div>}
                  </td>
                  <td className="code">{r.email}</td>
                  <td>
                    <span className={`role-tag ${r.role === 'hq_admin' ? 'hq' : 'store'}`}>
                      {ROLE_KO[r.role]}
                    </span>
                  </td>
                  <td>
                    {r.store ? (
                      <>
                        <span className="code">{r.store.code}</span> {r.store.name}
                      </>
                    ) : (
                      <span className="t-mute">전 지점</span>
                    )}
                  </td>
                  <td>
                    {r.is_active
                      ? <Pill state="ok" label="활성" />
                      : <Pill state="idle" label="비활성" />}
                    {r.must_change_password && r.is_active && (
                      <div style={{ fontSize: 10.5, color: 'var(--warn)', marginTop: 3 }}>
                        비밀번호 변경 필요
                      </div>
                    )}
                  </td>
                  <td className="num t-mute">
                    {r.last_login_at ? relative(r.last_login_at) : '기록 없음'}
                    {r.last_login_at && (
                      <div style={{ fontSize: 10.5 }}>{dateTime(r.last_login_at)}</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn btn-sm" onClick={() => setResetting(r)}>
                      비밀번호
                    </button>{' '}
                    {r.role === 'store_manager' && (
                      <select
                        className="ctl"
                        style={{ width: 120, marginRight: 6 }}
                        value={r.store_id ?? ''}
                        onChange={(e) => run(() => reassignStore(r.id, e.target.value))}
                        aria-label={`${r.full_name} 담당 지점 변경`}
                      >
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button" className="btn btn-sm"
                      disabled={r.id === meId}
                      onClick={() => run(() => setActive(r.id, !r.is_active))}
                    >
                      {r.is_active ? '비활성화' : '활성화'}
                    </button>{' '}
                    <button
                      type="button" className="btn btn-sm"
                      disabled={r.id === meId}
                      onClick={() => {
                        if (confirm(`${r.full_name} 님의 계정을 삭제할까요?\n삭제하면 즉시 로그인할 수 없게 되며 되돌릴 수 없습니다.`)) {
                          run(() => deleteAccount(r.id));
                        }
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7}><Empty>조건에 맞는 계정이 없습니다.</Empty></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {resetting && (
        <ResetModal row={resetting} onClose={() => setResetting(null)} onDone={onDone} />
      )}
      {cred && <CredentialsPanel cred={cred} onClose={() => setCred(null)} />}
    </>
  );
}
