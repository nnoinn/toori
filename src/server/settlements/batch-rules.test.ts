// 목요일 정산 묶기 계산 (#353 결정 1~4, W20 ③). 지급일 판단, 샵 묶음 금액·기간, 패널티 떼기와 0원 정산을 본다.
// 금액 기댓값은 docs/settlement-examples.md 3장(오픈 기간, 결제 수수료 3.0%는 문서의 임시 가정이라 테스트에만 넣는다).

import { describe, expect, it } from 'vitest';

import { kstToUtc } from '@/lib/time';
import { OWNER_FAULT_PENALTY_AMOUNT } from '@/server/policy';

import {
  buildShopSettlement,
  catchUpPayoutDate,
  payoutDateOn,
  ZERO_PAYOUT_MEMO,
} from './batch-rules';
import type { OutstandingPenalty } from './calc-settlement';

function kst(value: string): Date {
  const [date, time] = value.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return kstToUtc({ year, month, day, hour, minute });
}

/** 정산 예시 3장의 가정: 결제 수수료 3.0%(VAT 별도), 정가 50,000원 10% 할인 → 판매가 45,000원 */
const PAYMENT_FEE_RATE = 3;
const SALE_PRICE = 45_000;

const item = (
  orderId: string,
  kind: Parameters<typeof buildShopSettlement>[0]['items'][number]['kind'],
  occurredAt = kst('2026-11-10 12:00'),
) => ({
  orderId,
  kind,
  salePrice: SALE_PRICE,
  discountRate: 10,
  couponAmount: 0,
  occurredAt,
});

const penalty = (
  penaltyId: string,
  createdAt: string,
  collectedAmount = 0,
): OutstandingPenalty => ({
  penaltyId,
  amount: OWNER_FAULT_PENALTY_AMOUNT,
  collectedAmount,
  createdAt: kst(createdAt),
});

describe('payoutDateOn', () => {
  it('목요일이면 그날이 지급일, 다른 요일은 아니다(한국 날짜)', () => {
    expect(payoutDateOn(kst('2026-11-19 00:30'))).toBe('2026-11-19');
    expect(payoutDateOn(kst('2026-11-19 23:59'))).toBe('2026-11-19');
    expect(payoutDateOn(kst('2026-11-18 23:59'))).toBeNull();
    expect(payoutDateOn(kst('2026-11-20 00:30'))).toBeNull();
  });

  it('목요일이 공휴일이면 다음 영업일이 지급일(2027-05-13 부처님오신날 → 금요일, 2026-09-24·25 추석 → 월요일)', () => {
    expect(payoutDateOn(kst('2027-05-13 00:30'))).toBeNull();
    expect(payoutDateOn(kst('2027-05-14 00:30'))).toBe('2027-05-14');
    expect(payoutDateOn(kst('2026-09-24 00:30'))).toBeNull();
    expect(payoutDateOn(kst('2026-09-25 00:30'))).toBeNull();
    expect(payoutDateOn(kst('2026-09-28 00:30'))).toBe('2026-09-28');
  });
});

describe('catchUpPayoutDate: 지급일 새벽 작업이 실패했을 때 따라잡을 지급일(#394 리뷰 3번)', () => {
  it('지급일 다음 날(1일 안)이면 그 지급일, 지급일 당일·이틀 뒤·다른 날은 없다', () => {
    expect(catchUpPayoutDate(kst('2026-11-20 00:30'), 1)).toBe('2026-11-19');
    expect(catchUpPayoutDate(kst('2026-11-19 00:30'), 1)).toBeNull();
    expect(catchUpPayoutDate(kst('2026-11-21 00:30'), 1)).toBeNull();
    expect(catchUpPayoutDate(kst('2026-11-18 00:30'), 1)).toBeNull();
    // 2일까지 보면 이틀 뒤도 그 지급일
    expect(catchUpPayoutDate(kst('2026-11-21 00:30'), 2)).toBe('2026-11-19');
  });

  it('공휴일로 밀린 지급일도 그다음 날 따라잡는다(2027-05-13 부처님오신날 → 금요일 5/14 지급 → 5/15)', () => {
    expect(catchUpPayoutDate(kst('2027-05-15 00:30'), 1)).toBe('2027-05-14');
    // 공휴일 목요일 다음 날(지급일 당일)은 따라잡기가 아니다
    expect(catchUpPayoutDate(kst('2027-05-14 00:30'), 1)).toBeNull();
  });
});

describe('buildShopSettlement', () => {
  it('정산 예시 3장: 이용 완료·노쇼 43,515원, 고객 취소(30%) 13,055원, 합의 후 취소(50%) 21,758원과 합계', () => {
    const draft = buildShopSettlement({
      payoutDate: '2026-11-19',
      previousPayoutDate: null,
      items: [
        item('o-sale', { kind: 'sale' }),
        item('o-noshow', { kind: 'no_show' }),
        item('o-cancel', { kind: 'penalty', penaltyRate: 30 }),
        item('o-agreed', { kind: 'agreed_cancel', penaltyRate: 50 }),
      ],
      penalties: [],
      paymentFeeRate: PAYMENT_FEE_RATE,
      mode: 'launch',
    });
    expect(
      draft.items.map((row) => [
        row.orderId,
        row.kind,
        row.baseAmount,
        row.paymentFee,
        row.paymentFeeVat,
        row.payoutAmount,
      ]),
    ).toEqual([
      ['o-sale', 'sale', 45_000, 1_350, 135, 43_515],
      ['o-noshow', 'no_show', 45_000, 1_350, 135, 43_515],
      ['o-cancel', 'penalty', 13_500, 405, 40, 13_055],
      ['o-agreed', 'agreed_cancel', 22_500, 675, 67, 21_758],
    ]);
    expect(draft).toMatchObject({
      periodEnd: '2026-11-19',
      itemCount: 4,
      totalBaseAmount: 126_000,
      totalFeeAmount: 1_485 + 1_485 + 445 + 742,
      payoutBeforePenalty: 43_515 + 43_515 + 13_055 + 21_758,
      collections: [],
      penaltyDeducted: 0,
      payoutAmount: 43_515 + 43_515 + 13_055 + 21_758,
      status: 'pending',
      memo: null,
    });
  });

  it('기간: 첫 정산은 처음 묶이는 거래가 끝난 한국 날짜부터, 다음부터는 직전 지급일 다음 날부터 지급일까지', () => {
    const items = [
      item('o-1', { kind: 'sale' }, kst('2026-11-12 09:00')),
      // 한국 시간 11/10 23:30(UTC로는 11/10 14:30) — 한국 날짜로 센다
      item('o-2', { kind: 'sale' }, kst('2026-11-10 23:30')),
    ];
    const base = {
      payoutDate: '2026-11-19',
      items,
      penalties: [],
      paymentFeeRate: PAYMENT_FEE_RATE,
    };
    expect(buildShopSettlement({ ...base, previousPayoutDate: null }).periodStart).toBe(
      '2026-11-10',
    );
    expect(buildShopSettlement({ ...base, previousPayoutDate: '2026-11-12' }).periodStart).toBe(
      '2026-11-13',
    );
    expect(() => buildShopSettlement({ ...base, items: [], previousPayoutDate: null })).toThrow(
      RangeError,
    );
  });

  it('남은 원장님 귀책 패널티(5,000원)를 오래된 것부터 떼고, 다 걷은 패널티를 표시한다', () => {
    const draft = buildShopSettlement({
      payoutDate: '2026-11-19',
      previousPayoutDate: null,
      items: [item('o-cancel', { kind: 'penalty', penaltyRate: 30 })],
      penalties: [
        penalty('p-new', '2026-11-10 10:00'),
        penalty('p-old', '2026-11-01 10:00', 1_000),
      ],
      paymentFeeRate: PAYMENT_FEE_RATE,
    });
    expect(draft).toMatchObject({
      payoutBeforePenalty: 13_055,
      collections: [
        { penaltyId: 'p-old', amount: 4_000, fullyCollected: true },
        { penaltyId: 'p-new', amount: 5_000, fullyCollected: true },
      ],
      penaltyDeducted: 9_000,
      payoutAmount: 4_055,
      status: 'pending',
      memo: null,
    });
  });

  it('패널티를 떼고 0원이면 지급 요청 없이 지급 완료(paid)이고 이유를 남기며, 못 뗀 패널티는 다음 정산으로 넘긴다(#353 결정 4)', () => {
    const draft = buildShopSettlement({
      payoutDate: '2026-11-19',
      previousPayoutDate: null,
      items: [item('o-cancel', { kind: 'penalty', penaltyRate: 30 })],
      penalties: [
        penalty('p-1', '2026-11-01 10:00'),
        penalty('p-2', '2026-11-02 10:00'),
        penalty('p-3', '2026-11-03 10:00'),
      ],
      paymentFeeRate: PAYMENT_FEE_RATE,
    });
    expect(ZERO_PAYOUT_MEMO).toBe('패널티로 상계해서 0원');
    expect(draft).toMatchObject({
      collections: [
        { penaltyId: 'p-1', amount: 5_000, fullyCollected: true },
        { penaltyId: 'p-2', amount: 5_000, fullyCollected: true },
        { penaltyId: 'p-3', amount: 3_055, fullyCollected: false },
      ],
      penaltyDeducted: 13_055,
      payoutAmount: 0,
      status: 'paid',
      memo: '패널티로 상계해서 0원',
    });
  });
});
