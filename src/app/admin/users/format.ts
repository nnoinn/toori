// 회원 조회 화면 표시 모양 (A-102, W18).

import type { ReservationStatus, VisitResult } from '@/db/schema';

/** 목록 탭. 주소 ?tab= 값 */
export const USER_TABS = ['customers', 'owners'] as const;
export type UserTab = (typeof USER_TABS)[number];

export function toUserTab(value: string | undefined): UserTab {
  return USER_TABS.find((tab) => tab === value) ?? 'customers';
}

/** 검색어를 다듬는다. 없으면 빈 문자열 */
export function toSearchQuery(value: string | undefined): string {
  return (value ?? '').trim().slice(0, 50);
}

/** 예약 상태 이름. 노쇼는 상태가 아니라 방문 결과로 기록한다(S-405) */
export function labelReservation(status: ReservationStatus, visitResult: VisitResult | null) {
  if (visitResult === 'no_show') return '노쇼';
  if (status === 'cancelled') return '취소';
  if (status === 'completed') return '이용 완료';
  return '예정';
}
