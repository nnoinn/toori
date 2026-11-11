import { describe, expect, it } from 'vitest';

import { AGREED_CANCEL_REFUND_RATE } from '@/server/policy/refund';

import {
  agreedCancelConfirmText,
  agreedCancelDeadlineText,
  agreedCancelReasonText,
  agreedCancelRefundText,
} from './agreed-cancel-texts';

describe('합의 후 취소 요청 카드 문구', () => {
  it('사유는 이름으로, 기타는 원장님이 적은 내용으로', () => {
    expect(agreedCancelReasonText('style_mismatch', null)).toBe(
      '사유: 원하는 시술이 예약한 서비스와 달라요',
    );
    expect(agreedCancelReasonText('other', '손님이 일정이 바뀌었어요')).toBe(
      '사유: 기타: 손님이 일정이 바뀌었어요',
    );
    expect(agreedCancelReasonText('other', null)).toBe('사유: 기타');
  });

  it('환불액은 서버 값을 그대로, 비율은 정책값, 쿠폰을 썼으면 돌려주지 않는다고 알린다', () => {
    expect(agreedCancelRefundText(30500, 0)).toBe(
      `합의 후 취소에 동의하시면 결제액의 ${AGREED_CANCEL_REFUND_RATE}%(30,500원)만 환불받을 수 있어요.`,
    );
    expect(agreedCancelRefundText(30500, 3000)).toContain('쓴 쿠폰은 돌려드리지 않아요.');
  });

  it('답할 마지막 시각은 한국 시각으로', () => {
    // 2026-11-12(목) 15:00 KST
    expect(agreedCancelDeadlineText('2026-11-12T06:00:00.000Z')).toBe(
      '11/12(목) 15:00까지 답하지 않으면 요청이 사라져요.',
    );
  });

  it('확인 창은 되돌릴 수 없다고 한 번 더 알린다(#301 Q1)', () => {
    expect(agreedCancelConfirmText(30500)).toBe(
      `결제액의 ${AGREED_CANCEL_REFUND_RATE}%(30,500원)만 환불돼요. 취소하면 되돌릴 수 없어요.`,
    );
  });
});
