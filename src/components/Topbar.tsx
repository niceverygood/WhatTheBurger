'use client';

import { useEffect, useState } from 'react';
import { signOut } from '@/app/login/actions';
import { ROLE_KO, type UserRole } from '@/lib/types';

export default function Topbar({
  crumb,
  title,
  sub,
  name,
  role,
  action,
}: {
  crumb: string;
  title: string;
  sub: string;
  name: string;
  role: UserRole;
  action?: React.ReactNode;
}) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat('ko-KR', {
          timeZone: 'Asia/Seoul',
          month: 'numeric', day: 'numeric', weekday: 'short',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(new Date()),
      );
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const initials = name.slice(0, 2);

  return (
    <header className="topbar">
      <div>
        <div className="crumb">{crumb}</div>
        <h1 className="title">{title}</h1>
        <div className="title-sub">{sub}</div>
      </div>
      <div className="topbar-right">
        {action}
        <span className="clock">{clock}</span>
        <span className={`role-tag ${role === 'hq_admin' ? 'hq' : 'store'}`}>{ROLE_KO[role]}</span>
        <span className="avatar" title={name}>{initials}</span>
        <form action={signOut}>
          <button type="submit" className="btn btn-sm">로그아웃</button>
        </form>
      </div>
    </header>
  );
}
