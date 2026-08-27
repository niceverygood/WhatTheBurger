/* 시드 기준 데이터 — 왓더버거 실제 운영 품목·메뉴 구성 */

export const ROUTES = [
  { id: 'R1', name: '수도권A', driver_name: '김성호', vehicle: '12가 1000', sort: 1, sido: ['서울'] },
  { id: 'R2', name: '수도권B', driver_name: '이재훈', vehicle: '12가 1137', sort: 2, sido: ['경기', '인천'] },
  { id: 'R3', name: '충청',   driver_name: '박찬영', vehicle: '12가 1274', sort: 3, sido: ['대전', '세종', '충북', '충남'] },
  { id: 'R4', name: '호남',   driver_name: '최동석', vehicle: '12가 1411', sort: 4, sido: ['광주', '전북', '전남'] },
  { id: 'R5', name: '영남A',  driver_name: '정민규', vehicle: '12가 1548', sort: 5, sido: ['부산', '울산', '경남'] },
  { id: 'R6', name: '영남B',  driver_name: '유상철', vehicle: '12가 1685', sort: 6, sido: ['대구', '경북'] },
  { id: 'R7', name: '강원·제주', driver_name: '남기훈', vehicle: '12가 1822', sort: 7, sido: ['강원', '제주'] },
];

export const SUPPLIERS = [
  { name: '대성FS',     lead_days: 3, contact: '02-540-1120' },
  { name: '한울푸드',   lead_days: 3, contact: '031-337-2280' },
  { name: '해원수산',   lead_days: 4, contact: '051-611-8842' },
  { name: '베이크원',   lead_days: 2, contact: '031-987-4410' },
  { name: '미소식품',   lead_days: 3, contact: '043-215-7730' },
  { name: '오뚜기',     lead_days: 2, contact: '02-2010-0114' },
  { name: '서울우유',   lead_days: 2, contact: '02-2085-9114' },
  { name: '신선농산',   lead_days: 1, contact: '063-834-2200' },
  { name: '심플로트',   lead_days: 5, contact: '02-6001-3300' },
  { name: '코카콜라',   lead_days: 3, contact: '080-024-0002' },
  { name: '커피팩토리', lead_days: 4, contact: '031-778-5520' },
  { name: '팩메이트',   lead_days: 4, contact: '032-321-9980' },
  { name: '클린원',     lead_days: 3, contact: '031-492-1180' },
  { name: '롯데푸드',   lead_days: 3, contact: '02-3469-6114' },
];

type TempZone = 'frozen' | 'cold' | 'ambient';

/** [이름, 분류, 구매단위, 공급가, 매입원가, 보관, 공급사, 1회 발주 기본수량] */
export const ITEMS: [string, string, string, number, number, TempZone, string, number][] = [
  ['시그니처 비프패티 150g', '패티', 'BOX(40ea)', 42000, 34200, 'frozen', '대성FS', 7],
  ['더블 비프패티 200g', '패티', 'BOX(30ea)', 47500, 38900, 'frozen', '대성FS', 5],
  ['크리스피 치킨패티', '패티', 'BOX(40ea)', 33800, 26400, 'frozen', '한울푸드', 3],
  ['통새우 패티', '패티', 'BOX(30ea)', 51200, 41800, 'frozen', '해원수산', 2],
  ['스파이시 치킨패티', '패티', 'BOX(40ea)', 35600, 28100, 'frozen', '한울푸드', 2],
  ['브리오슈 번', '번', 'BOX(48ea)', 21600, 15900, 'ambient', '베이크원', 8],
  ['참깨 번', '번', 'BOX(48ea)', 18400, 13200, 'ambient', '베이크원', 4],
  ['흑미 프리미엄 번', '번', 'BOX(36ea)', 24800, 18600, 'ambient', '베이크원', 2],
  ['왓더 시그니처 소스', '소스', 'BOX(4L×3)', 38500, 27400, 'cold', '미소식품', 1],
  ['갈릭 마요 소스', '소스', 'BOX(4L×3)', 34200, 24100, 'cold', '미소식품', 1],
  ['스파이시 핫소스', '소스', 'BOX(4L×3)', 32900, 23300, 'cold', '미소식품', 1],
  ['토마토 케첩 파우치', '소스', 'BOX(3.3kg×4)', 26800, 19700, 'ambient', '오뚜기', 1],
  ['머스타드 파우치', '소스', 'BOX(3.3kg×4)', 24300, 17800, 'ambient', '오뚜기', 1],
  ['체다 슬라이스 치즈', '치즈·유제품', 'BOX(500ea)', 58900, 47200, 'cold', '서울우유', 1],
  ['모짜렐라 슈레드', '치즈·유제품', 'BOX(2.5kg×4)', 62400, 50100, 'cold', '서울우유', 1],
  ['버터 시즈닝', '치즈·유제품', 'BOX(1kg×6)', 29700, 21400, 'cold', '서울우유', 1],
  ['양상추 (세척완료)', '채소', 'BOX(4kg)', 18900, 14600, 'cold', '신선농산', 4],
  ['토마토 슬라이스', '채소', 'BOX(3kg)', 22400, 17300, 'cold', '신선농산', 4],
  ['양파 슬라이스', '채소', 'BOX(5kg)', 14200, 10800, 'cold', '신선농산', 2],
  ['할라피뇨 피클', '채소', 'BOX(3kg×4)', 31600, 23900, 'cold', '신선농산', 1],
  ['오이 피클 슬라이스', '채소', 'BOX(3kg×4)', 27300, 20200, 'cold', '신선농산', 1],
  ['프렌치프라이 9mm', '사이드', 'BOX(2kg×6)', 34800, 27600, 'frozen', '심플로트', 2],
  ['웨지 포테이토', '사이드', 'BOX(2kg×5)', 31200, 24800, 'frozen', '심플로트', 1],
  ['모짜렐라 치즈스틱', '사이드', 'BOX(1kg×5)', 41300, 33100, 'frozen', '한울푸드', 1],
  ['어니언링', '사이드', 'BOX(1kg×6)', 36700, 29200, 'frozen', '한울푸드', 1],
  ['치킨 텐더', '사이드', 'BOX(2kg×4)', 44900, 35700, 'frozen', '한울푸드', 1],
  ['콜라 BIB 10L', '음료', 'EA', 28400, 22100, 'ambient', '코카콜라', 3],
  ['사이다 BIB 10L', '음료', 'EA', 26900, 20800, 'ambient', '코카콜라', 1],
  ['제로콜라 BIB 10L', '음료', 'EA', 29100, 22700, 'ambient', '코카콜라', 1],
  ['에스프레소 원두 1kg', '음료', 'BOX(6ea)', 87600, 68400, 'ambient', '커피팩토리', 1],
  ['버거 포장지 (로고)', '포장재', 'BOX(2000ea)', 46200, 33800, 'ambient', '팩메이트', 1],
  ['크라프트 종이백 대', '포장재', 'BOX(1000ea)', 52800, 39100, 'ambient', '팩메이트', 1],
  ['프라이 박스 (로고)', '포장재', 'BOX(1500ea)', 38900, 28400, 'ambient', '팩메이트', 1],
  ['드링크 컵 16oz + 리드', '포장재', 'BOX(1000set)', 61400, 46700, 'ambient', '팩메이트', 1],
  ['배달 봉인 스티커', '포장재', 'BOX(5000ea)', 19700, 12900, 'ambient', '팩메이트', 1],
  ['위생장갑 니트릴 M', '소모품', 'BOX(2000ea)', 33600, 25100, 'ambient', '클린원', 1],
  ['튀김유 카놀라 18L', '소모품', 'EA', 41800, 34900, 'ambient', '롯데푸드', 3],
  ['주방 세정제 5L', '소모품', 'BOX(4ea)', 27400, 19600, 'ambient', '클린원', 1],
];

export const CAT_CODE: Record<string, string> = {
  '패티': 'PT', '번': 'BN', '소스': 'SC', '치즈·유제품': 'CH', '채소': 'VG',
  '사이드': 'SD', '음료': 'BV', '포장재': 'PK', '소모품': 'CS',
};

/** 구매 1단위로 만들 수 있는 인분 수 = 낱개(EA) 환산 계수 */
export const YIELD: Record<string, number> = {
  'PT-001': 40, 'PT-002': 30, 'PT-003': 40, 'PT-004': 30, 'PT-005': 40,
  'BN-001': 48, 'BN-002': 48, 'BN-003': 36,
  'SC-001': 600, 'SC-002': 600, 'SC-003': 600, 'SC-004': 500, 'SC-005': 500,
  'CH-001': 500, 'CH-002': 160, 'CH-003': 240,
  'VG-001': 160, 'VG-002': 100, 'VG-003': 250, 'VG-004': 400, 'VG-005': 400,
  'SD-001': 80, 'SD-002': 66, 'SD-003': 50, 'SD-004': 60, 'SD-005': 80,
  'BV-001': 55, 'BV-002': 55, 'BV-003': 55, 'BV-004': 600,
  'PK-001': 2000, 'PK-002': 1000, 'PK-003': 1500, 'PK-004': 1000, 'PK-005': 5000,
  'CS-001': 2000, 'CS-002': 200, 'CS-003': 100,
};

/** 버거 공통 레시피 조각 */
const SIG: [string, number][] = [
  ['CH-001', 1], ['VG-001', 1], ['VG-002', 1], ['VG-003', 1], ['SC-001', 1], ['PK-001', 1],
];

export interface MenuSeed {
  code: string; category: string; emoji: string; name: string;
  price: number; daily: number; bom: [string, number][];
}

export const BASE_MENUS: MenuSeed[] = [
  { code: 'B1', category: '버거', emoji: '🍔', name: '왓더 시그니처', price: 6900, daily: 46, bom: [['PT-001', 1], ['BN-001', 1], ...SIG] },
  { code: 'B2', category: '버거', emoji: '🍔', name: '더블 시그니처', price: 9800, daily: 28, bom: [['PT-002', 1], ['PT-001', 1], ['BN-001', 1], ['CH-001', 2], ['VG-001', 1], ['VG-003', 1], ['SC-001', 1], ['PK-001', 1]] },
  { code: 'B3', category: '버거', emoji: '🍗', name: '크리스피 치킨', price: 6400, daily: 32, bom: [['PT-003', 1], ['BN-002', 1], ['VG-001', 1], ['VG-005', 1], ['SC-002', 1], ['PK-001', 1]] },
  { code: 'B4', category: '버거', emoji: '🌶️', name: '스파이시 치킨', price: 6900, daily: 24, bom: [['PT-005', 1], ['BN-002', 1], ['VG-001', 1], ['VG-004', 1], ['SC-003', 1], ['PK-001', 1]] },
  { code: 'B5', category: '버거', emoji: '🍤', name: '통새우 버거', price: 7900, daily: 18, bom: [['PT-004', 1], ['BN-001', 1], ['VG-001', 1], ['VG-002', 1], ['SC-002', 1], ['PK-001', 1]] },
  { code: 'B6', category: '버거', emoji: '🥯', name: '흑미 프리미엄', price: 8900, daily: 14, bom: [['PT-002', 1], ['BN-003', 1], ['CH-001', 1], ['CH-003', 1], ['VG-001', 1], ['VG-002', 1], ['SC-001', 1], ['PK-001', 1]] },
  { code: 'S1', category: '사이드', emoji: '🍟', name: '프렌치프라이', price: 2900, daily: 40, bom: [['SD-001', 1], ['PK-003', 1]] },
  { code: 'S2', category: '사이드', emoji: '🥔', name: '웨지 포테이토', price: 3400, daily: 22, bom: [['SD-002', 1], ['PK-003', 1]] },
  { code: 'S3', category: '사이드', emoji: '🧀', name: '모짜렐라 치즈스틱', price: 3900, daily: 26, bom: [['SD-003', 1], ['PK-003', 1]] },
  { code: 'S4', category: '사이드', emoji: '🧅', name: '어니언링', price: 3400, daily: 20, bom: [['SD-004', 1], ['PK-003', 1]] },
  { code: 'S5', category: '사이드', emoji: '🍗', name: '치킨 텐더', price: 4900, daily: 16, bom: [['SD-005', 1], ['PK-003', 1]] },
  { code: 'D1', category: '음료', emoji: '🥤', name: '콜라', price: 2200, daily: 55, bom: [['BV-001', 1], ['PK-004', 1]] },
  { code: 'D2', category: '음료', emoji: '🫧', name: '제로콜라', price: 2200, daily: 35, bom: [['BV-003', 1], ['PK-004', 1]] },
  { code: 'D3', category: '음료', emoji: '🥤', name: '사이다', price: 2200, daily: 28, bom: [['BV-002', 1], ['PK-004', 1]] },
  { code: 'D4', category: '음료', emoji: '☕', name: '아메리카노', price: 2500, daily: 45, bom: [['BV-004', 1], ['PK-004', 1]] },
];

/** 세트 = 버거 + 프렌치프라이 + 콜라, 700원 할인 */
export function buildMenus(): MenuSeed[] {
  const menus = [...BASE_MENUS];
  const fry = BASE_MENUS.find((m) => m.code === 'S1')!;
  const cola = BASE_MENUS.find((m) => m.code === 'D1')!;
  const setDaily = [52, 30, 34, 22, 16, 12];

  BASE_MENUS.filter((m) => m.category === '버거').forEach((m, i) => {
    menus.push({
      code: `C${i + 1}`,
      category: '세트',
      emoji: m.emoji,
      name: `${m.name} 세트`,
      price: m.price + fry.price + cola.price - 700,
      daily: setDaily[i],
      bom: [...m.bom, ...fry.bom, ...cola.bom, ['PK-002', 1]],
    });
  });
  return menus;
}

/** 지역별 상권. 시드 규모를 조절하기 쉽게 시·도별로 묶어 둔다. */
export const DISTRICTS: Record<string, string[]> = {
  '서울': ['강남', '역삼', '삼성', '신사', '홍대입구', '신촌', '건대입구', '성수', '잠실', '송파', '노원', '목동', '여의도', '영등포', '종로', '이태원'],
  '경기': ['수원역', '광교', '판교', '분당정자', '동탄중앙', '평촌', '일산라페스타', '부천중동', '안산고잔', '의정부', '용인기흥', '하남미사'],
  '인천': ['부평', '송도', '청라', '구월'],
  '대전': ['둔산', '유성온천'],
  '세종': ['나성'],
  '충북': ['청주율량'],
  '충남': ['천안불당', '아산탕정'],
  '광주': ['상무지구', '충장로'],
  '전북': ['전주효자'],
  '전남': ['순천신대', '여수학동'],
  '부산': ['서면', '해운대', '센텀시티', '광안리', '동래'],
  '울산': ['삼산'],
  '경남': ['창원상남', '김해장유', '진주혁신'],
  '대구': ['동성로', '수성범어', '동대구'],
  '경북': ['구미인동', '포항양덕'],
  '강원': ['강릉교동', '원주무실'],
  '제주': ['제주노형'],
};

export const MANAGER_NAMES = [
  '김민준', '이서연', '박도윤', '최지우', '정하준', '강수아', '조은우', '윤서준',
  '장예린', '임태오', '한소율', '오지훈', '신다은', '권준서', '황유나', '서건우',
  '문채원', '배지호', '노아린', '심우진', '홍지아', '전시우', '고나윤', '유하람',
];
