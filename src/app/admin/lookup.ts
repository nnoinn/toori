// 운영자 조회 화면(회원 A-102, 매물·예약 A-103)이 같이 쓰는 검색·목록·표시 모양 (W18).

import type { ReservationStatus, VisitResult } from '@/db/schema';

/** 조회 목록에 한 번에 보여 주는 최대 줄 수. 넘으면 검색으로 좁히라고 안내한다 */
export const ADMIN_LIST_LIMIT = 200;

export type ListResult<Row> = { rows: Row[]; hasMore: boolean };

/** 한 줄 더 읽어 온 결과(`limit(ADMIN_LIST_LIMIT + 1)`)를 자르고 더 있는지 알려 준다 */
export function toListResult<Row>(rows: Row[]): ListResult<Row> {
  return { rows: rows.slice(0, ADMIN_LIST_LIMIT), hasMore: rows.length > ADMIN_LIST_LIMIT };
}

/** 쪽으로 나눠 보는 긴 기록의 한 쪽 줄 수(기술 가이드 7장 "운영자 목록", 11/15 nnoinn) */
export const ADMIN_PAGE_SIZE = 20;

/** 한 쪽 결과. page는 실제로 보여 준 쪽(쪽 수보다 큰 쪽을 달라고 하면 마지막 쪽) */
export type PageResult<Row> = { rows: Row[]; total: number; page: number; pageCount: number };

/** 전체 수와 달라고 한 쪽으로 보여 줄 쪽과 건너뛸 줄 수를 정한다. 기록이 없으면 1쪽에 0건 */
export function toPage(
  total: number,
  requestedPage: number,
): { page: number; pageCount: number; offset: number } {
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pageCount);
  return { page, pageCount, offset: (page - 1) * ADMIN_PAGE_SIZE };
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

/**
 * 예약번호를 찾는 ilike 패턴. 화면은 예약번호를 4자리씩 끊어(1234-5678-9012) 보여 주므로,
 * 복사해 붙여 넣은 하이픈·공백을 빼고 찾는다(저장은 숫자 12자리, 11/22)
 */
export function reservationCodePattern(query: string): string {
  return containsPattern(query.replace(/[-\s]/g, ''));
}
