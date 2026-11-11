import { describe, expect, it } from 'vitest';

import { AGREED_CANCEL_REFUND_RATE, AGREED_CANCEL_RESPONSE_HOURS } from '@/server/policy/refund';
import { AGREED_CANCEL_REASON_TEXT_MAX } from '@/server/refunds/agreed-cancel-types';

import {
  AGREED_CANCEL_CONFIRM_LABEL,
  AGREED_CANCEL_REASON_CHIPS,
  agreedCancelFailIsFinal,
  agreedCancelFailShowsNewState,
  agreedCancelOutcomes,
  agreedCancelReasonText,
  agreedCancelRequestedLine,
  agreedCancelSentText,
  agreedCancelStatusText,
  canSubmitAgreedCancel,
} from './cancel-request';

describe('원장님 합의 후 취소 요청 (S-410)', () => {
  it('처리 안내: 비율은 정책값, 원장님 금액은 서버가 준 기준 금액 그대로', () => {
    const [customer, owner, consent] = agreedCancelOutcomes(8750);
    expect(customer).toContain(`결제한 금액의 ${AGREED_CANCEL_REFUND_RATE}%를 환불받아요`);
    expect(customer).toContain('쓴 쿠폰은 돌려드리지 않아요');
    expect(owner).toContain(`판매가의 ${100 - AGREED_CANCEL_REFUND_RATE}%(8,750원)`);
    expect(owner).toContain('패널티는 없어요');
    expect(consent).toContain(`${AGREED_CANCEL_RESPONSE_HOURS}시간 안에`);
    expect(AGREED_CANCEL_CONFIRM_LABEL).toContain(`${AGREED_CANCEL_REFUND_RATE}% 환불을 설명했고`);
  });

  it('사유 칩은 동의 문구 순서(달라요 → 원하지 않아요 → 기타)', () => {
    expect(AGREED_CANCEL_REASON_CHIPS.map((chip) => chip.key)).toEqual([
      'style_mismatch',
      'customer_declined',
      'other',
    ]);
  });

  it('요청 버튼: 사유와 확인이 모두 있어야 하고, 기타는 내용이 1~100자', () => {
    const base = { reasonText: '', confirmed: true };
    expect(canSubmitAgreedCancel({ ...base, reason: null })).toBe(false);
    expect(canSubmitAgreedCancel({ ...base, reason: 'style_mismatch' })).toBe(true);
    expect(canSubmitAgreedCancel({ ...base, reason: 'style_mismatch', confirmed: false })).toBe(
      false,
    );
    expect(canSubmitAgreedCancel({ ...base, reason: 'other' })).toBe(false);
    expect(canSubmitAgreedCancel({ ...base, reason: 'other', reasonText: '   ' })).toBe(false);
    expect(canSubmitAgreedCancel({ ...base, reason: 'other', reasonText: '일정이 생겼어요' })).toBe(
      true,
    );
    const tooLong = 'a'.repeat(AGREED_CANCEL_REASON_TEXT_MAX + 1);
    expect(canSubmitAgreedCancel({ ...base, reason: 'other', reasonText: tooLong })).toBe(false);
  });

  it('사유 한 줄: 기타면 적은 내용, 요청 시각은 한국 시각', () => {
    expect(agreedCancelReasonText('customer_declined', null)).toBe(
      '사유: 손님이 시술을 원하지 않아요',
    );
    expect(agreedCancelReasonText('other', '일정이 생겼어요')).toBe('사유: 기타: 일정이 생겼어요');
    expect(agreedCancelRequestedLine('2026-11-01T05:00:00.000Z', 'style_mismatch', null)).toBe(
      '요청 11/1(일) 14:00 · 사유: 원하는 시술이 예약한 서비스와 달라요',
    );
  });

  it('보낸 뒤 안내: 손님이 동의해야 하는 마지막 시각', () => {
    expect(agreedCancelSentText('2026-11-02T05:00:00.000Z')).toBe(
      '11/2(월) 14:00까지 손님이 동의하면 취소돼요.',
    );
  });

  it('상태 문구: 동의하면 기준 금액, 거절·만료는 예약 그대로', () => {
    expect(agreedCancelStatusText('agreed', 8750).body).toContain('(8,750원)');
    expect(agreedCancelStatusText('declined', 8750).body).toBe('예약은 그대로예요.');
    expect(agreedCancelStatusText('expired', 8750).title).toContain(
      `${AGREED_CANCEL_RESPONSE_HOURS}시간 안에`,
    );
  });

  it('실패: 다른 요청이 생겼거나 예약이 바뀌었으면 화면을 다시 받고 버튼을 잠근다', () => {
    expect(agreedCancelFailShowsNewState('ALREADY_REQUESTED')).toBe(true);
    expect(agreedCancelFailShowsNewState('NOT_REQUESTABLE')).toBe(true);
    expect(agreedCancelFailShowsNewState('INVALID_INPUT')).toBe(false);
    expect(agreedCancelFailIsFinal('RESERVATION_NOT_FOUND')).toBe(true);
    // 입력값 오류는 고치면 다시 누를 수 있다
    expect(agreedCancelFailIsFinal('INVALID_INPUT')).toBe(false);
  });
});
