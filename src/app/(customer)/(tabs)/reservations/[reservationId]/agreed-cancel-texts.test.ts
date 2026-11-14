import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AGREED_CANCEL_REFUND_RATE } from '@/server/policy/refund';

import {
  AGREED_CANCEL_GUIDE,
  AGREED_CANCEL_TITLE,
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
    // 적은 내용은 기타일 때만 보여준다
    expect(agreedCancelReasonText('customer_declined', '메모')).toBe(
      '사유: 손님이 시술을 원하지 않아요',
    );
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

// 요청 카드 문구가 동의 문구 초안(docs/legal/consent-texts.md 8-2장)과 어긋나지 않는지 본다
describe('요청 카드와 동의 문구 8-2', () => {
  const consentDoc = readFileSync(join(process.cwd(), 'docs/legal/consent-texts.md'), 'utf8');
  // 8-2 화면 모양. 첫 줄은 ```text의 text
  const lines = consentDoc.split('### 8-2.')[1].split('```')[1].split('\n');

  it('제목과 안내가 문서와 같다', () => {
    expect(lines[1]).toBe(AGREED_CANCEL_TITLE);
    // 문서의 두 줄을 화면에서는 한 문단으로 이어 붙인다
    const guide = lines.findIndex((line) => line.startsWith('원장님께 안내를'));
    expect(`${lines[guide]} ${lines[guide + 1]}`).toBe(AGREED_CANCEL_GUIDE);
  });
});
