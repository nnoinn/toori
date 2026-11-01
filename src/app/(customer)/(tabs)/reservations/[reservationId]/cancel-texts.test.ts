import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REFUND_BANDS } from '@/server/policy';

import { appliedRefundRule, cancelDoneText, COUPON_NOT_RETURNED_NOTE } from './cancel-texts';

// 화면 문구가 동의 문구 초안(docs/legal/consent-texts.md 3장)과 어긋나지 않는지 본다
const consentDoc = readFileSync(join(process.cwd(), 'docs/legal/consent-texts.md'), 'utf8');

describe('예약 취소 확인 창 문구 (C-503)', () => {
  it('위약금 비율로 그 구간의 환불 규정 줄을 고른다', () => {
    expect(appliedRefundRule(30)).toBe('24시간 이상 남음: 70% 환불(위약금 30%)');
    expect(appliedRefundRule(50)).toBe('6시간 이상 24시간 미만: 50% 환불(위약금 50%)');
  });

  it('구간마다 위약금 비율이 달라서 비율로 구간을 하나만 찾을 수 있다', () => {
    const rates = REFUND_BANDS.map((band) => band.penaltyRate);
    expect(new Set(rates).size).toBe(rates.length);
  });

  it('정책에 없는 비율이면 줄을 보여주지 않는다', () => {
    expect(appliedRefundRule(42)).toBeNull();
  });

  it('쿠폰 안내는 동의 문구와 같다', () => {
    expect(consentDoc).toContain(COUPON_NOT_RETURNED_NOTE);
  });

  it('취소한 뒤 돌려줄 금액을 알린다. 0원이면 환불 문구를 빼고 알린다', () => {
    expect(cancelDoneText(19600)).toBe('19,600원을 환불해 드려요.');
    expect(cancelDoneText(0)).toBe('돌려드릴 결제 금액은 없어요.');
  });
});
