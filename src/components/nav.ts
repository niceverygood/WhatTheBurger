export interface NavItem {
  href: string;
  ko: string;
  icon: string;      // 18x18 viewBox path
  hqOnly?: boolean;
  badge?: 'openOrders' | 'lowStock' | 'overdue';
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

/** 지점관리자에게는 라벨을 '우리 지점' 기준으로 바꿔 보여 준다. */
export const NAV: NavGroup[] = [
  {
    group: '운영',
    items: [
      { href: '/dashboard', ko: '대시보드', icon: 'M3 9.5L9 3l6 6.5V15H3z' },
      { href: '/orders', ko: '발주 관리', icon: 'M4 2h10v14l-5-2.6L4 16z', badge: 'openOrders' },
      { href: '/shipping', ko: '출고 · 배차', icon: 'M1 4h9v7H1zM10 6.5h3.4L16 9v2h-6z', hqOnly: true },
    ],
  },
  {
    group: '키오스크',
    items: [
      { href: '/kiosk-orders', ko: '주문 내역', icon: 'M3 3h12v12H3zM6 6h6M6 9h6M6 12h4' },
      { href: '/kiosk-link', ko: '단말 · 연동', icon: 'M4 2h10v11H4zM7 15h4M6.5 5.5h5M6.5 8h3' },
    ],
  },
  {
    group: '자산',
    items: [
      { href: '/inventory', ko: '재고 현황', icon: 'M2 5.5L9 2l7 3.5v7L9 16l-7-3.5z', badge: 'lowStock' },
      { href: '/items', ko: '품목 마스터', icon: 'M3 3h12v3H3zM3 8h12v3H3zM3 13h7v2H3z' },
    ],
  },
  {
    group: '채권',
    items: [
      { href: '/settlement', ko: '정산 · 여신', icon: 'M2 14V6m4 8V3m4 11V8m4 6V4', badge: 'overdue' },
      { href: '/stores', ko: '가맹점', icon: 'M2 7l2-4h10l2 4v8H2zM7 15v-4h4v4', hqOnly: true },
    ],
  },
  {
    group: '관리',
    items: [
      { href: '/accounts', ko: '계정 관리', icon: 'M9 9a3 3 0 100-6 3 3 0 000 6zM2.5 16a6.5 6.5 0 0113 0', hqOnly: true },
    ],
  },
];

export function navFor(isHQ: boolean): NavGroup[] {
  return NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => isHQ || !i.hqOnly) }))
    .filter((g) => g.items.length > 0);
}
