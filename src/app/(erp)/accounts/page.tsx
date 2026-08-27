import type { Metadata } from 'next';
import { requireHQ } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Topbar from '@/components/Topbar';
import AccountsClient from './AccountsClient';
import type { Profile } from '@/lib/types';

export const metadata: Metadata = { title: '계정 관리 · 왓더버거 ERP' };
export const dynamic = 'force-dynamic';

type Row = Profile & { store: { code: string; name: string } | null };

export default async function AccountsPage() {
  const session = await requireHQ();
  const supabase = await createClient();

  const [{ data: profiles }, { data: stores }] = await Promise.all([
    supabase
      .from('profiles')
      .select('*, store:stores(code, name)')
      .order('role', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('stores')
      .select('id, code, name, sido')
      .eq('status', 'operating')
      .order('code'),
  ]);

  const rows = (profiles ?? []) as unknown as Row[];

  return (
    <>
      <Topbar
        crumb="관리"
        title="계정 관리"
        sub="본사 총괄관리자가 지점관리자 계정을 발급하고 담당 지점을 지정합니다"
        name={session.profile.full_name}
        role={session.profile.role}
      />
      <div className="view">
        <AccountsClient
          rows={rows}
          stores={stores ?? []}
          meId={session.userId}
        />
      </div>
    </>
  );
}
