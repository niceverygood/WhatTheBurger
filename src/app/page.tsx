import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';

export default async function Home() {
  const session = await requireSession();
  redirect(session.isHQ ? '/dashboard' : '/store-dashboard');
}
