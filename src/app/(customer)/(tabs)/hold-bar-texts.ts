import { formatKst } from '@/lib/time';

// 결제 중 매물(#359 1번, 점검 5-1) 문구. PC 칩·폰 알약은 hold-bar.tsx(11/23 nnoinn 시안 A)

/** 칩·알약 이름(화면 읽기 프로그램) */
export const HOLD_BAR_LABEL = '결제 중인 매물';

/** PC 위쪽 메뉴의 칩과 폰 위쪽 알약의 글자, 칩을 누르면 뜨는 상자 문구(11/23 nnoinn, 시안 A) */
export const HOLD_CHIP = {
  label: '결제 중',
  note: '시간 안에 결제하지 않으면 다른 고객이 예약할 수 있어요',
  continue: '결제 이어서 하기',
  release: '그만두기',
} as const;

/** [그만두기]를 누르면 한 번 묻는 창(11/14 정찬형 승인) */
export const HOLD_RELEASE_CONFIRM = {
  title: '결제를 그만둘까요?',
  description: '이 매물을 다른 고객이 예약할 수 있게 돼요.',
  keep: '계속 결제하기',
  release: '그만두기',
} as const;

/** "안산 헤어 · 여성 커트" */
export function holdBarTitle(hold: { shopName: string; menuName: string }): string {
  return `${hold.shopName} · ${hold.menuName}`;
}

/** "11/14(토) 14:00 시작" */
export function holdBarStartText(startAt: string): string {
  return `${formatKst(new Date(startAt))} 시작`;
}
