import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession, scopeStoreId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import { Card, Empty, Kpi, Meter, Pill, type State } from '@/components/ui';
import { n0, pct, seoulToday, won, wonC } from '@/lib/format';

export const metadata: Metadata = { title: '정산 · 여신 · 왓더버거 ERP' };
export const dynamic = 'force-dynamic';

interface Row {
  id: string; store_id: string; period: string;
  prev_amount: number; paid_amount: number; carry_amount: number; mtd_amount: number;
  overdue_days: number; tax_status: string; due_date: string | null;
  store: { code: string; name: string; sido: string; credit_limit: number; grade: string } | null;
}

const TAX_KO: Record<string, string> = { issued: '발행완료', pending: '발행대기', hold: '보류' };

/** 연체가 길거나 여신 한도를 넘으면 위험, 연체만 있으면 주의. */
function riskOf(r: Row): State {
  const ar = r.carry_amount + r.mtd_amount;
  const limit = r.store?.credit_limit ?? 0;
  if (r.overdue_days > 14 || (limit > 0 && ar > limit)) return 'crit';
  if (r.overdue_days > 0) return 'warn';
  return 'ok';
}

export default async function SettlementPage() {
  const session = await requireSession();
  const storeId = scopeStoreId(session);
  const supabase = await createClient();

  const today = seoulToday();
  const period = `${today.slice(0, 7)}-01`;

  let q = supabase
    .from('settlements')
    .select('id, store_id, period, prev_amount, paid_amount, carry_amount, mtd_amount, overdue_days, tax_status, due_date, store:stores(code, name, sido, credit_limit, grade)')
    .eq('period', period)
    .order('overdue_days', { ascending: false });
  if (storeId) q = q.eq('store_id', storeId);

  const { data } = await q;
  const rows = (data ?? []) as unknown as Row[];

  const carry = rows.reduce((a, r) => a + r.carry_amount, 0);
  const mtd = rows.reduce((a, r) => a + r.mtd_amount, 0);
  const ar = carry + mtd;
  const overdue = rows.filter((r) => r.overdue_days > 0);
  const risky = rows.filter((r) => riskOf(r) === 'crit');
  const collected = rows.reduce((a, r) => a + r.paid_amount, 0);
  const billed = rows.reduce((a, r) => a + r.prev_amount, 0);

  return (
    <>
      <Topbar
        crumb="채권"
        title="정산 · 여신"
        sub={
          session.isHQ
            ? `${today.slice(0, 7)} 기준 · 가맹점 매입 채권과 여신 한도 관리`
            : `${today.slice(0, 7)} 기준 · ${session.store?.name ?? ''} 정산 내역`
        }
        name={session.profile.full_name}
        role={session.profile.role}
      />

      <div className="view">
        <div className="kpis">
          <Kpi
            label="미수금 잔액" value={wonC(ar)}
            foot={<>이월 <b className="num">{wonC(carry)}</b> · 당월 <b className="num">{wonC(mtd)}</b></>}
          />
          <Kpi
            label="전월 수금률" value={`${pct(collected, billed)}`} unit="%"
            foot={<span className="t-mute">{wonC(collected)} / {wonC(billed)}</span>}
          />
          <Kpi
            label="연체" value={n0(overdue.length)} unit={session.isHQ ? '개점' : '건'}
            delta={overdue.length > 0
              ? { good: false, text: `최장 ${Math.max(0, ...overdue.map((r) => r.overdue_days))}일`, vs: '경과' }
              : undefined}
            foot={overdue.length === 0 ? <span className="t-mute">연체 없음</span> : undefined}
          />
          <Kpi
            label="여신 위험" value={n0(risky.length)} unit={session.isHQ ? '개점' : '건'}
            foot={<span className="t-mute">연체 15일↑ 또는 한도 초과</span>}
          />
        </div>

        <Card
          title={session.isHQ ? '가맹점별 정산' : '우리 지점 정산'}
          sub={`${rows.length}건 · ${today.slice(0, 7)}`}
          aside="여신 소진율 = 미수금 ÷ 여신한도"
        >
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  {session.isHQ && <th>지점</th>}
                  <th style={{ textAlign: 'right' }}>전월 청구</th>
                  <th style={{ textAlign: 'right' }}>입금</th>
                  <th style={{ textAlign: 'right' }}>이월</th>
                  <th style={{ textAlign: 'right' }}>당월 매입</th>
                  <th style={{ textAlign: 'right' }}>미수금</th>
                  <th style={{ width: 120 }}>여신 소진율</th>
                  <th style={{ textAlign: 'right' }}>연체</th>
                  <th>세금계산서</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const bal = r.carry_amount + r.mtd_amount;
                  const limit = r.store?.credit_limit ?? 0;
                  const use = limit > 0 ? bal / limit : 0;
                  const st = riskOf(r);
                  return (
                    <tr key={r.id}>
                      {session.isHQ && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <span className="code t-mute">{r.store?.code}</span> {r.store?.name}
                          <div style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{r.store?.sido}</div>
                        </td>
                      )}
                      <td className="num t-mute" style={{ textAlign: 'right' }}>{n0(r.prev_amount)}</td>
                      <td className="num t-mute" style={{ textAlign: 'right' }}>{n0(r.paid_amount)}</td>
                      <td className="num" style={{ textAlign: 'right', color: r.carry_amount > 0 ? 'var(--crit)' : undefined }}>
                        {n0(r.carry_amount)}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>{n0(r.mtd_amount)}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{won(bal)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Meter ratio={Math.min(1, use)} state={use > 1 ? 'crit' : use > 0.8 ? 'warn' : 'ok'} />
                          <span className="num t-mute" style={{ fontSize: 11 }}>{pct(bal, limit || 1)}%</span>
                        </div>
                      </td>
                      <td className="num" style={{ textAlign: 'right', color: r.overdue_days > 0 ? 'var(--crit)' : 'var(--ink-4)' }}>
                        {r.overdue_days > 0 ? `${r.overdue_days}일` : '—'}
                      </td>
                      <td className="t-mute">{TAX_KO[r.tax_status] ?? r.tax_status}</td>
                      <td>
                        {st === 'ok'
                          ? <Pill state="ok" label="정상" />
                          : st === 'warn'
                            ? <Pill state="warn" label="연체" />
                            : <Pill state="crit" label="여신 위험" />}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={session.isHQ ? 10 : 9}>
                      <Empty>
                        {today.slice(0, 7)} 정산 데이터가 아직 없습니다.
                        <br />
                        <span style={{ fontSize: 11.5 }}>월마감이 끝나면 여기에 표시됩니다.</span>
                      </Empty>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {session.isHQ && risky.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <Card title="여신 점검 대상" sub="발주 승인 전 확인이 필요한 지점">
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>지점</th>
                      <th style={{ textAlign: 'right' }}>미수금</th>
                      <th style={{ textAlign: 'right' }}>여신한도</th>
                      <th style={{ textAlign: 'right' }}>초과액</th>
                      <th style={{ textAlign: 'right' }}>연체</th>
                      <th style={{ textAlign: 'right' }}>조치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {risky.map((r) => {
                      const bal = r.carry_amount + r.mtd_amount;
                      const over = bal - (r.store?.credit_limit ?? 0);
                      return (
                        <tr key={r.id}>
                          <td>
                            <span className="code t-mute">{r.store?.code}</span> {r.store?.name}
                          </td>
                          <td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{won(bal)}</td>
                          <td className="num t-mute" style={{ textAlign: 'right' }}>{n0(r.store?.credit_limit ?? 0)}</td>
                          <td className="num" style={{ textAlign: 'right', color: over > 0 ? 'var(--crit)' : 'var(--ink-4)' }}>
                            {over > 0 ? won(over) : '—'}
                          </td>
                          <td className="num" style={{ textAlign: 'right' }}>
                            {r.overdue_days > 0 ? `${r.overdue_days}일` : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Link className="btn btn-sm" href={`/orders?store=${r.store_id}`}>발주 보기</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
