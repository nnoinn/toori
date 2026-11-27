// 원장님 튜토리얼 화면별 말풍선(S-412, 3단계 3-A). 주요 화면에 처음 들어가면 단계별로 한 칸씩 설명한다.
// 말풍선이 붙는 칸은 화면 코드에 `data-tour="이름"`으로 표시해 두고, 지금 화면에 보이는 칸만 차례로 보여준다
// (예: 처리 전 예약이 아니면 방문 처리 버튼이 없어서 그 말풍선은 건너뛴다).
// 부분 마감 화면의 말풍선은 S-210을 만들 때 더한다. 화면('use client')에서 쓴다.

import { PUBLISH_WINDOW_HOURS } from '@/server/policy';

export const TOUR_KEYS = ['slot_single', 'slot_window', 'reservation_detail'] as const;
export type TourKey = (typeof TOUR_KEYS)[number];

export type TourStep = {
  /** 말풍선을 붙일 칸의 `data-tour` 값 */
  target: string;
  title: string;
  body: string;
};

export const TOURS: Record<TourKey, readonly TourStep[]> = {
  // 매물 등록 > 한 시술 매물(처음 열리는 탭)
  slot_single: [
    {
      target: 'slot-methods',
      title: '등록 방식 고르기',
      body: '한 시술 매물은 서비스 하나를 정한 시각에 올려요. 비어 있는 시간을 통째로 올리려면 시간대 매물을 골라요.',
    },
    {
      target: 'slot-presets',
      title: '지난 매물로 빠르게 올리기',
      body: '전에 올린 구성을 누르면 서비스·할인율이 채워지고 ② 시간부터 열려요.',
    },
    {
      target: 'slot-steps',
      title: '서비스 → 시간 → 할인율',
      body: `차례대로 고르면 매물이 올라가요. 손님에게는 시작 ${PUBLISH_WINDOW_HOURS}시간 전부터 보이고, 그보다 먼저 올리면 게시예정으로 기다려요.`,
    },
  ],
  // 매물 등록 > 시간대 매물(탭을 처음 열 때)
  slot_window: [
    {
      target: 'window-time',
      title: '날짜와 시간대 고르기',
      body: '날짜를 고르면 시간표가 나와요. 비어 있는 시간을 끌어서 고르면 손님이 그 안에서 서비스와 시작 시각을 골라 예약해요.',
    },
    {
      target: 'window-steps',
      title: '시간 → 서비스 → 할인율 → 확인',
      body: '시간대에 담을 서비스를 고르고, 서비스마다 할인율을 정한 뒤 확인하면 올라가요.',
    },
  ],
  // 예약 상세
  reservation_detail: [
    {
      target: 'reservation-header',
      title: '예약번호 맞춰 보기',
      body: '손님이 보여 주는 예약번호와 끝 4자리를 맞춰 봐요. 오른쪽 위에 지금 예약 상태가 보여요.',
    },
    {
      target: 'reservation-visit',
      title: '방문 완료·노쇼',
      body: '서비스 시작 뒤에 방문 완료나 노쇼를 눌러 주세요. 처리해야 정산이 진행되고, 처리한 뒤에는 바꿀 수 없어요.',
    },
    {
      target: 'reservation-cancel',
      title: '예약 취소',
      body: '원장님 사정으로 취소하거나, 손님과 합의한 뒤 취소를 요청할 수 있어요. 누르면 금액과 결과를 먼저 보여 드려요.',
    },
    {
      target: 'reservation-booker',
      title: '예약자 연락처',
      body: '연락처는 방문·노쇼를 처리하기 전까지만 다 보여요. 처리하거나 취소되면 가운데를 가려요.',
    },
  ],
};

/** 지금 화면에 보이는 칸의 말풍선만 순서대로 */
export function availableSteps(
  steps: readonly TourStep[],
  isShown: (target: string) => boolean,
): TourStep[] {
  return steps.filter((step) => isShown(step.target));
}

export function isTourKey(value: unknown): value is TourKey {
  return typeof value === 'string' && (TOUR_KEYS as readonly string[]).includes(value);
}
