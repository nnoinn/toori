import { describe, expect, it } from 'vitest';

import {
  DISCOUNT_RATE_OPTIONS,
  HOLD_MINUTES,
  NO_SHOW_PENALTY_RATE,
  OWNER_FAULT_COUPON_AMOUNT,
  PUBLISH_WINDOW_HOURS,
  REFUND_BANDS,
} from '@/server/policy';

import { refundPolicyLines, refundPolicyNotes } from './(tabs)/slots/[slotId]/detail-format';
import { nextOnboardingStep, ONBOARDING_STEPS, previousOnboardingStep } from './onboarding-rules';

const step = (key: (typeof ONBOARDING_STEPS)[number]['key']) => {
  const found = ONBOARDING_STEPS.find((item) => item.key === key);
  if (!found) throw new Error(`안내 ${key} 없음`);
  return found;
};

describe('첫 로그인 안내 내용 (C-107)', () => {
  it('4장이고 순서는 투리가 뭔지 → 예약 방법 → 무료 취소 안 됨 → 관심·알림', () => {
    expect(ONBOARDING_STEPS.map((item) => item.key)).toEqual(['what', 'how', 'refund', 'alert']);
  });

  it('게시 시간·최대 할인율·홀딩 시간은 정책값으로 쓴다', () => {
    const what = step('what').lines.join(' ');
    expect(what).toContain(`${PUBLISH_WINDOW_HOURS}시간 안에`);
    expect(what).toContain(`최대 ${Math.max(...DISCOUNT_RATE_OPTIONS)}%`);
    const how = step('how');
    expect(how.title).toContain(`${HOLD_MINUTES}분`);
    expect(how.lines.join(' ')).toContain(`${HOLD_MINUTES}분 동안`);
  });

  it('취소 안내는 결제 동의 문구와 글자까지 같다(무료 취소 안 됨, 환불 구간)', () => {
    const refund = step('refund');
    expect(refund.lines).toEqual(refundPolicyNotes(OWNER_FAULT_COUPON_AMOUNT).before);
    expect(refund.lines[0]).toContain('결제 직후에도 무료 취소가 되지 않아요');
    expect(refund.bullets).toEqual(refundPolicyLines(REFUND_BANDS, NO_SHOW_PENALTY_RATE));
  });

  it('장마다 제목과 본문이 있다', () => {
    for (const item of ONBOARDING_STEPS) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.lines.length).toBeGreaterThan(0);
    }
  });
});

describe('안내 장 넘기기', () => {
  it('다음: 마지막 장이면 null(시작하기로 닫는다)', () => {
    expect(nextOnboardingStep(0)).toBe(1);
    expect(nextOnboardingStep(ONBOARDING_STEPS.length - 2)).toBe(ONBOARDING_STEPS.length - 1);
    expect(nextOnboardingStep(ONBOARDING_STEPS.length - 1)).toBeNull();
  });

  it('이전: 첫 장이면 null', () => {
    expect(previousOnboardingStep(0)).toBeNull();
    expect(previousOnboardingStep(2)).toBe(1);
  });
});
