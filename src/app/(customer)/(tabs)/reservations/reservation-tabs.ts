// 내 예약 탭 (J12, C-501). 예약 상태(reservations.status)로 나눈다. 화면과 서버 어디서나 쓴다.
// 노쇼는 상태가 아니라 '이용 완료' 예약에 붙는 기록이라 '이용 완료' 탭에 "노쇼" 표시로 보여준다(S-405, 10/25).

import type { ReservationStatus } from '@/db/schema';

export const RESERVATION_TABS = [
  { key: 'upcoming', label: '예정', status: 'confirmed' },
  { key: 'completed', label: '이용 완료', status: 'completed' },
  { key: 'cancelled', label: '취소', status: 'cancelled' },
] as const satisfies readonly { key: string; label: string; status: ReservationStatus }[];

export type ReservationTab = (typeof RESERVATION_TABS)[number]['key'];

export const DEFAULT_TAB: ReservationTab = 'upcoming';

export const TAB_PARAM = 'tab';

/** 주소창 ?tab= 값. 목록에 없으면 '예정' */
export function parseTab(value: string | string[] | undefined): ReservationTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return RESERVATION_TABS.find((tab) => tab.key === raw)?.key ?? DEFAULT_TAB;
}

export function statusOfTab(tab: ReservationTab): ReservationStatus {
  return RESERVATION_TABS.find((item) => item.key === tab)!.status;
}

/** 탭 이동 주소. 기본 탭이면 주소를 짧게 둔다 */
export function tabHref(tab: ReservationTab): string {
  return tab === DEFAULT_TAB ? '/reservations' : `/reservations?${TAB_PARAM}=${tab}`;
}

/**
 * "방문 확인 중": 시작 시각이 지났는데(같은 시각 포함) 아직 예정(confirmed)인 예약.
 * 원장님이 방문·노쇼 처리를 하기 전이라 '예정' 탭에 두고 표시만 붙인다(10/25 결정, #92 리뷰).
 * now는 서버 시각(getRequestNow)을 넘긴다. 기기 시계를 믿지 않는다.
 */
export function isVisitPending(status: ReservationStatus, startAt: string, now: Date): boolean {
  return status === 'confirmed' && new Date(startAt).getTime() <= now.getTime();
}

/**
 * 예약 상세에 '예약 취소' 영역을 둘 예약: 시작 전 예정 예약(J13, C-503). 시작이 지난 예약(방문 확인 중)은 취소할 것이 없다.
 * 버튼을 보여줄지, 6시간 미만이라 안내만 보여줄지는 서버 미리보기(previewRefund)의 refundable이 정한다
 */
export function showsCancelSection(status: ReservationStatus, startAt: string, now: Date): boolean {
  return status === 'confirmed' && !isVisitPending(status, startAt, now);
}
