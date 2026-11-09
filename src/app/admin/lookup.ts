// 운영자 조회 화면(회원 A-102, 매물·예약 A-103)이 같이 쓰는 검색·목록·표시 모양 (W18).

import type { ReservationStatus, VisitResult } from '@/db/schema';

/** 조회 목록에 한 번에 보여 주는 최대 줄 수. 넘으면 검색으로 좁히라고 안내한다 */
export const ADMIN_LIST_LIMIT = 200;

export type ListResult<Row> = { rows: Row[]; hasMore: boolean };

/** 한 줄 더 읽어 온 결과(`limit(ADMIN_LIST_LIMIT + 1)`)를 자르고 더 있는지 알려 준다 */
export function toListResult<Row>(rows: Row[]): ListResult<Row> {
  return { rows: rows.slice(0, ADMIN_LIST_LIMIT), hasMore: rows.length > ADMIN_LIST_LIMIT };
}

/** 검색어를 다듬는다. 없으면 빈 문자열 */
export function toSearchQuery(value: string | undefined): string {
  return (value ?? '').trim().slice(0, 50);
}

/** 입력한 글자를 그대로 찾도록 % _ \ 를 막은 ilike 패턴 */
export function containsPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, '\\$&')}%`;
}

/** 예약 상태 이름. 노쇼는 상태가 아니라 방문 결과로 기록한다(S-405) */
export function labelReservation(status: ReservationStatus, visitResult: VisitResult | null) {
  if (visitResult === 'no_show') return '노쇼';
  if (status === 'cancelled') return '취소';
  if (status === 'completed') return '이용 완료';
  return '예정';
}
