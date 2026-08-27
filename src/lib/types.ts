/* 도메인 타입 — supabase/migrations 의 스키마와 1:1 로 맞춘다. */

export type UserRole = 'hq_admin' | 'store_manager';
export type StoreStatus = 'operating' | 'suspended' | 'closed';
export type StoreGrade = 'franchise' | 'direct';
export type TempZone = 'frozen' | 'cold' | 'ambient';
export type OrderStage =
  | 'received' | 'approved' | 'picking' | 'shipped' | 'delivering' | 'done' | 'hold' | 'canceled';
export type OrderSource = 'manual' | 'kiosk_auto' | 'ai_replenish';
export type KioskStatus = 'paid' | 'canceled';
export type LedgerReason = 'kiosk_sale' | 'po_receive' | 'adjust' | 'waste' | 'opening';

export interface Route {
  id: string;
  name: string;
  driver_name: string | null;
  vehicle: string | null;
  sort: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  lead_days: number;
  is_active: boolean;
}

export interface Store {
  id: string;
  code: string;
  name: string;
  sido: string;
  district: string | null;
  route_id: string | null;
  grade: StoreGrade;
  status: StoreStatus;
  manager_name: string | null;
  tel: string | null;
  address: string | null;
  opened_at: string | null;
  credit_limit: number;
  kiosk_token: string;
  kiosk_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  store_id: string | null;
  phone: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_by: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface Item {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  ea_per_unit: number;
  price: number;
  cost: number;
  temp: TempZone;
  supplier_id: string | null;
  is_active: boolean;
}

export interface WarehouseStock {
  item_id: string;
  on_hand: number;
  allocated: number;
  safety_stock: number;
  updated_at: string;
}

export interface StoreStock {
  store_id: string;
  item_id: string;
  on_hand: number;
  safety_stock: number;
  daily_usage: number;
  updated_at: string;
}

export interface PurchaseOrder {
  id: string;
  order_no: string;
  store_id: string;
  route_id: string | null;
  stage: OrderStage;
  source: OrderSource;
  is_urgent: boolean;
  ordered_at: string;
  ordered_ts: string;
  due_date: string | null;
  total_amount: number;
  memo: string | null;
  driver_name: string | null;
  created_by: string | null;
  updated_at: string;
}

export interface PurchaseOrderLine {
  id: string;
  order_id: string;
  item_id: string;
  qty: number;
  unit_price: number;
  amount: number;
}

export interface PurchaseOrderEvent {
  id: string;
  order_id: string;
  stage: OrderStage;
  actor_id: string | null;
  actor_name: string | null;
  note: string | null;
  created_at: string;
}

export interface Menu {
  id: string;
  code: string;
  category: string;
  name: string;
  price: number;
  emoji: string;
  sort: number;
  is_active: boolean;
}

export interface KioskOrder {
  id: string;
  order_no: string;
  store_id: string;
  total: number;
  item_count: number;
  status: KioskStatus;
  order_type: string;
  paid_at: string;
}

export interface KioskOrderLine {
  id: string;
  kiosk_order_id: string;
  menu_id: string;
  menu_name: string;
  qty: number;
  unit_price: number;
  amount: number;
}

export interface Settlement {
  id: string;
  store_id: string;
  period: string;
  prev_amount: number;
  paid_amount: number;
  carry_amount: number;
  mtd_amount: number;
  overdue_days: number;
  tax_status: string;
  due_date: string | null;
}

export interface InventoryLedgerRow {
  id: string;
  store_id: string | null;
  item_id: string;
  delta: number;
  balance: number;
  reason: LedgerReason;
  ref_type: string | null;
  ref_id: string | null;
  created_at: string;
}

/* ---------------- 발주 단계 ---------------- */
export const STAGES: { k: OrderStage; ko: string; desc: string }[] = [
  { k: 'received',   ko: '접수',   desc: '가맹점이 발주 등록, 본사 승인 대기' },
  { k: 'approved',   ko: '승인',   desc: '본사 승인 완료, 물류센터 재고 할당됨' },
  { k: 'picking',    ko: '피킹',   desc: '물류센터 피킹·검수 진행' },
  { k: 'shipped',    ko: '출고',   desc: '차량 상차 완료, 배차 대기' },
  { k: 'delivering', ko: '배송중', desc: '기사 배송 진행 중' },
  { k: 'done',       ko: '완료',   desc: '납품 확인, 매입 확정' },
  { k: 'hold',       ko: '보류',   desc: '여신 초과·결품 등으로 보류' },
  { k: 'canceled',   ko: '취소',   desc: '발주 취소' },
];

export const STAGE_KO: Record<OrderStage, string> = Object.fromEntries(
  STAGES.map((s) => [s.k, s.ko]),
) as Record<OrderStage, string>;

/** 진행 순서. hold/canceled 는 흐름 밖이므로 -1. */
export const STAGE_INDEX: Record<OrderStage, number> = {
  received: 0, approved: 1, picking: 2, shipped: 3, delivering: 4, done: 5, hold: -1, canceled: -1,
};

/** 본사가 이 단계에서 넘어갈 수 있는 다음 단계들 */
export const NEXT_STAGES: Record<OrderStage, OrderStage[]> = {
  received:   ['approved', 'hold', 'canceled'],
  approved:   ['picking', 'hold'],
  picking:    ['shipped', 'hold'],
  shipped:    ['delivering', 'hold'],
  delivering: ['done', 'hold'],
  done:       [],
  hold:       ['received', 'approved', 'canceled'],
  canceled:   [],
};

export const SOURCE_KO: Record<OrderSource, string> = {
  manual: '수기 등록',
  kiosk_auto: '키오스크 자동',
  ai_replenish: 'AI 보충',
};

export const TEMP_KO: Record<TempZone, string> = { frozen: '냉동', cold: '냉장', ambient: '상온' };
export const STORE_STATUS_KO: Record<StoreStatus, string> = {
  operating: '운영중', suspended: '휴점', closed: '폐점',
};
export const GRADE_KO: Record<StoreGrade, string> = { franchise: '가맹', direct: '직영' };
export const ROLE_KO: Record<UserRole, string> = { hq_admin: '본사 총괄관리자', store_manager: '지점관리자' };
export const LEDGER_KO: Record<LedgerReason, string> = {
  kiosk_sale: '키오스크 판매', po_receive: '발주 입고', adjust: '수동 조정', waste: '폐기', opening: '기초재고',
};
