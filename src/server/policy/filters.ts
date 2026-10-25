// 목록 필터 구간 (연결 #5, Issue #48 7장, 정찬형 D7). 구간은 min 이상 max 미만이고, 끝이 없으면 null이다.
// key는 주소창에, label은 화면에 쓴다.

export type FilterRange = { key: string; label: string; min: number | null; max: number | null };

/** 할인가(원) 구간 */
export const PRICE_FILTER_RANGES = [
  { key: 'under_30k', label: '3만 원 미만', min: null, max: 30000 },
  { key: '30k_50k', label: '3~5만 원', min: 30000, max: 50000 },
  { key: '50k_100k', label: '5~10만 원', min: 50000, max: 100000 },
  { key: 'over_100k', label: '10만 원 이상', min: 100000, max: null },
] as const satisfies readonly FilterRange[];

/** 서비스 시작 시각(한국 시간, 시) 구간 */
export const TIME_FILTER_RANGES = [
  { key: 'morning', label: '오전', min: null, max: 12 },
  { key: 'afternoon', label: '오후', min: 12, max: 18 },
  { key: 'evening', label: '저녁', min: 18, max: null },
] as const satisfies readonly FilterRange[];
