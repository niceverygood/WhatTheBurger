'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navFor } from './nav';

export interface NavBadges {
  openOrders: number;
  lowStock: number;
  overdue: number;
}

export default function Sidebar({
  isHQ,
  badges,
  storeCount,
  storeName,
}: {
  isHQ: boolean;
  badges: NavBadges;
  storeCount: number;
  storeName: string | null;
}) {
  const path = usePathname();
  const groups = navFor(isHQ);

  return (
    <aside className="side">
      <div className="brand">
        <div className="brand-mark">
          WHAT THE<em>BURGER</em>
        </div>
        <div className="brand-sub">{isHQ ? 'HQ OPERATIONS' : 'STORE OPERATIONS'}</div>
        <div className="checker" />
      </div>

      <nav className="nav" aria-label="주 메뉴">
        {groups.map((g) => (
          <div key={g.group}>
            <div className="nav-group">{g.group}</div>
            {g.items.map((it) => {
              const active = path === it.href || path.startsWith(it.href + '/');
              const count = it.badge ? badges[it.badge] : 0;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className="nav-item"
                  aria-current={active ? 'page' : undefined}
                >
                  <svg className="nav-ico" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                    <path d={it.icon} />
                  </svg>
                  {it.ko}
                  {count > 0 && <span className="nav-badge">{count > 99 ? '99+' : count}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        {isHQ ? (
          <>
            운영 가맹점 <b style={{ color: '#C9C2B8' }}>{storeCount}</b>개
            <br />
            용인 1물류센터
          </>
        ) : (
          <>
            담당 지점
            <br />
            <b style={{ color: '#C9C2B8' }}>{storeName ?? '—'}</b>
          </>
        )}
      </div>
    </aside>
  );
}
