// 첫 로그인 안내(C-107) 장 내용. 화면(onboarding-dialog.tsx)과 테스트가 같이 쓴다.
// 내용은 docs/stage3-spec.md C-107의 🟡 기본값 4장이다: 투리가 뭔지, 예약 방법, 결제 직후에도 무료 취소가 되지 않음, 관심·알림 켜기.
// 숫자(48시간, 10분, 최대 할인율, 환불 구간)는 정책값에서 가져오고, 환불 문장은 결제 동의 문구와 같은 함수로 만든다(C-402와 같은 글자).
// 고객 계정으로 처음 들어오면 한 번 저절로 열린다(고객 계정의 안내 본 시각 onboarding_seen_at, #616·#623, onboarding-gate.tsx).

import { SITE_NAME } from '@/lib/site';
import {
  DISCOUNT_RATE_OPTIONS,
  HOLD_MINUTES,
  NO_SHOW_PENALTY_RATE,
  OWNER_FAULT_COUPON_AMOUNT,
  PUBLISH_WINDOW_HOURS,
  REFUND_BANDS,
} from '@/server/policy';

import { refundPolicyLines, refundPolicyNotes } from './(tabs)/slots/[slotId]/detail-format';

export type OnboardingIcon = 'discount' | 'hold' | 'refund' | 'alert';

export type OnboardingStep = {
  key: 'what' | 'how' | 'refund' | 'alert';
  icon: OnboardingIcon;
  title: string;
  /** 본문 문단 */
  lines: string[];
  /** 문단 아래 짧은 목록(환불 구간). 없으면 빈 배열 */
  bullets: string[];
};

const MAX_DISCOUNT_RATE = Math.max(...DISCOUNT_RATE_OPTIONS);
const refundNotes = refundPolicyNotes(OWNER_FAULT_COUPON_AMOUNT);

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    key: 'what',
    icon: 'discount',
    title: '빈 시간을 할인해서 예약해요',
    lines: [
      `${SITE_NAME}는 미용실·네일샵의 취소된 시간이나 비어 있는 시간을 할인해서 파는 곳이에요.`,
      `${PUBLISH_WINDOW_HOURS}시간 안에 시작하는 시간만 올라오고, 최대 ${MAX_DISCOUNT_RATE}%까지 할인해요.`,
    ],
    bullets: [],
  },
  {
    key: 'how',
    icon: 'hold',
    title: `${HOLD_MINUTES}분 안에 결제하면 예약이 끝나요`,
    lines: [
      `[예약하기]를 누르면 그 시간을 ${HOLD_MINUTES}분 동안 나만 결제할 수 있게 잡아 둬요.`,
      '그 안에 결제하면 바로 예약이 확정돼요. 결제는 예약할 때 미리 해요.',
    ],
    bullets: [],
  },
  {
    key: 'refund',
    icon: 'refund',
    title: '결제 직후에도 무료 취소가 되지 않아요',
    lines: refundNotes.before,
    bullets: refundPolicyLines(REFUND_BANDS, NO_SHOW_PENALTY_RATE),
  },
  {
    key: 'alert',
    icon: 'alert',
    title: '마음에 드는 샵은 모아 두세요',
    lines: [
      '샵 이름 옆 하트(♡)를 누르면 그 샵의 매물을 모아 볼 수 있어요.',
      '내 정보에서 관심 동네와 새 매물 알림을 켜 두면 새 할인 매물을 알려 드려요.',
    ],
    bullets: [],
  },
];

/** 다음 장 번호. 마지막 장이면 null(시작하기로 닫는다) */
export function nextOnboardingStep(index: number, count: number = ONBOARDING_STEPS.length) {
  return index + 1 < count ? index + 1 : null;
}

/** 이전 장 번호. 첫 장이면 null */
export function previousOnboardingStep(index: number) {
  return index > 0 ? index - 1 : null;
}
