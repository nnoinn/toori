import { formatKst } from '@/lib/time';

// 결제 중 매물 막대(#359 1번, 점검 5-1) 문구. 막대는 hold-bar.tsx

/** 막대 영역 이름(화면 읽기 프로그램) */
export const HOLD_BAR_LABEL = '결제 중인 매물';

/** [취소]를 누르면 한 번 묻는 창(11/14 정찬형 승인) */
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
