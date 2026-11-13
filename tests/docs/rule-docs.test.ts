// 규칙 문서의 숫자를 코드가 그대로 내는지 본다(로드맵 "테스트가 틀리지 않게" ①).
// 기댓값을 테스트에 옮겨 적지 않고 CLAUDE.md "핵심 비즈니스 규칙"과 docs/settlement-examples.md를 직접 읽는다.
// 그래서 코드만 바뀌어도, 문서만 바뀌어도 여기서 실패한다. 규칙이 바뀌면 문서·코드·이 테스트를 같은 PR에서 고친다.
// 문서 문장을 찾지 못하면 어느 문장을 찾는지 알려 준다. 문장을 고쳤으면 아래 찾는 식(정규식)도 같이 고친다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  AGREED_CANCEL_REFUND_RATE,
  AGREED_CANCEL_RESPONSE_HOURS,
  calcSalePrice,
  COUPON_VALID_DAYS,
  DISCOUNT_RATE_OPTIONS,
  HOLD_MINUTES,
  MIN_DISCOUNT_RATE,
  OWNER_FAULT_COUPON_AMOUNT,
  OWNER_FAULT_PENALTY_AMOUNT,
  type PlatformFeeMode,
  PUBLISH_WINDOW_HOURS,
  REMINDER_MINUTES_BEFORE,
} from '@/server/policy';
import { calcAgreedCancel } from '@/server/refunds/agreed-cancel-rules';
import { calcRefund, getPenaltyBand } from '@/server/refunds/calc-refund';
import {
  calcSettlementFees,
  calcTuriShare,
  settlementBaseAmount,
} from '@/server/settlements/calc-settlement';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8');
const RULES = read('CLAUDE.md');
const EXAMPLES = read('docs/settlement-examples.md');

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-11-02T10:00:00+09:00');

/** 문서에서 문장을 찾아 괄호로 묶은 값을 돌려준다. 없으면 어느 문서의 무엇을 찾는지 알린다 */
function find(doc: string, docName: string, pattern: RegExp): string[] {
  const match = doc.match(pattern);
  if (!match) throw new Error(`${docName}에서 이 문장을 찾지 못했어요: ${pattern}`);
  return match.slice(1);
}

const won = (text: string) => Number(text.replace(/,/g, ''));

/** "1,350 + 135" → [1350, 135], "**43,515**" → [43515], "−2,901" → [-2901], "4,500 + 450 (10%)" → [4500, 450] */
function amounts(cell: string): number[] {
  return cell
    .replace(/\*\*/g, '')
    .replace(/\(.*?\)/g, '')
    .split('+')
    .map((part) => {
      const value = Number(part.trim().replace('−', '-').replace(/,/g, ''));
      if (!Number.isInteger(value)) throw new Error(`표 칸이 금액 모양이 아니에요: "${cell}"`);
      return value;
    });
}

function amount(cell: string): number {
  const values = amounts(cell);
  if (values.length !== 1) throw new Error(`금액 하나가 있어야 해요: "${cell}"`);
  return values[0];
}

type Column = { name: string; get: (label: string) => string };

/** 제목(##·###) 바로 아래 표를 읽는다. 줄은 앞 번호(①~④)를 뺀 이름으로 찾고, 같은 이름이 없으면 앞부분으로 찾는다 */
function tableUnder(heading: string): Column[] {
  const lines = EXAMPLES.split('\n');
  const at = lines.findIndex(
    (line) => /^#{2,3} /.test(line) && line.replace(/^#+ /, '') === heading,
  );
  if (at < 0) throw new Error(`settlement-examples.md에 "${heading}" 제목이 없어요`);
  const rows: string[][] = [];
  for (let i = at + 1; i < lines.length && !/^#{2,3} /.test(lines[i]); i++) {
    if (lines[i].startsWith('|')) {
      rows.push(
        lines[i]
          .trim()
          .slice(1, -1)
          .split('|')
          .map((cell) => cell.trim()),
      );
    } else if (rows.length > 0) {
      break;
    }
  }
  if (rows.length < 3) throw new Error(`"${heading}" 아래에 표가 없어요`);
  const [header, , ...body] = rows;
  const label = (cell: string) => cell.replace(/^[①②③④]\s*/, '');
  return header.slice(1).map((name, c) => ({
    name,
    get: (prefix) => {
      const row =
        body.find((cells) => label(cells[0]) === prefix) ??
        body.find((cells) => label(cells[0]).startsWith(prefix));
      if (!row) throw new Error(`"${heading}" 표에 "${prefix}"로 시작하는 줄이 없어요`);
      return row[c + 1];
    },
  }));
}

// 3장 "가정"의 숫자. 문서 가정이 바뀌면 여기서 먼저 실패한다
const [LIST_PRICE, , PG_FEE_RATE, PAYMENT_FEE_RATE] = find(
  EXAMPLES,
  'settlement-examples.md 3장 가정',
  /정가 ([\d,]+)원, 쿠폰 ([\d,]+)원, 실제 PG 수수료 ([\d.]+)% \+ VAT, 결제 수수료 N ([\d.]+)%/,
).map(won);

/** 문서 가정: 실제 PG 수수료 = 카드에 남은 돈 × PG 수수료율(원 미만 버림), 그 VAT 10%(원 미만 버림) */
function pgFeeOf(cardAmount: number) {
  const pgFee = Math.floor((cardAmount * Math.round(PG_FEE_RATE * 10)) / 1000);
  return { pgFee, pgFeeVat: Math.floor(pgFee / 10) };
}

/** 표 열 이름의 쿠폰: "쿠폰 없음" → 0, "쿠폰 3,000원" → 3000 */
function couponOf(name: string): number {
  const [coupon] = find(name, `표 열 "${name}"`, /쿠폰 (없음|[\d,]+)/);
  return coupon === '없음' ? 0 : won(coupon);
}

/** 플랫폼 수수료 칸: 오픈 기간은 금액 하나(0), 법인 전환 뒤는 수수료 + VAT */
function expectPlatformFee(cell: number[], fees: { feeAmount: number; feeVat: number }) {
  if (cell.length === 1) {
    expect(fees.feeAmount, '플랫폼 수수료').toBe(cell[0]);
    expect(fees.feeVat, '플랫폼 수수료 VAT').toBe(0);
  } else {
    expect([fees.feeAmount, fees.feeVat], '플랫폼 수수료 + VAT').toEqual(cell);
  }
}

describe('CLAUDE.md 핵심 비즈니스 규칙의 숫자', () => {
  it('할인율 선택지와 최저 할인율', () => {
    const [options] = find(RULES, 'CLAUDE.md', /할인율은 ([\d/]+)% 중에서 고른다/);
    const [min] = find(RULES, 'CLAUDE.md', /최저 할인율은 (\d+)%다/);
    expect([...DISCOUNT_RATE_OPTIONS]).toEqual(options.split('/').map(Number));
    expect(MIN_DISCOUNT_RATE).toBe(Number(min));
  });

  it('판매가 예시: 정가 × (1 − 할인율), 100원 단위로 올리지 않는다', () => {
    const [list, rate, sale] = find(
      RULES,
      'CLAUDE.md',
      /정가 ([\d,]+)원, (\d+)% 할인 → ([\d,]+)원/,
    );
    expect(calcSalePrice(won(list), Number(rate))).toBe(won(sale));
  });

  it('고객 취소 위약금 경계: 24시간 이상 30%, 6시간 이상 24시간 미만 50%, 6시간 미만 100%', () => {
    const [h1, r1, h2, h3, r2, h4, r3] = find(
      RULES,
      'CLAUDE.md',
      /남은 시간이 (\d+)시간 이상이면 (\d+)%, (\d+)시간 이상 (\d+)시간 미만이면 (\d+)%, (\d+)시간 미만이면 (\d+)%/,
    ).map(Number);
    expect(h3).toBe(h1);
    expect(h4).toBe(h2);
    const rateAt = (msLeft: number) =>
      getPenaltyBand(new Date(NOW.getTime() + msLeft), NOW).penaltyRate;
    expect(rateAt(h1 * HOUR)).toBe(r1);
    expect(rateAt(h1 * HOUR - 1)).toBe(r2);
    expect(rateAt(h2 * HOUR)).toBe(r2);
    expect(rateAt(h2 * HOUR - 1)).toBe(r3);
    expect(rateAt(-HOUR)).toBe(r3);
  });

  it('홀딩·게시·리마인드 시각', () => {
    const [hold] = find(RULES, 'CLAUDE.md', /그 매물을 (\d+)분 동안 홀딩한다/);
    const [publish] = find(RULES, 'CLAUDE.md', /매물은 서비스 시작 (\d+)시간 전부터 게시할 수 있다/);
    const [first, second] = find(
      RULES,
      'CLAUDE.md',
      /예약 리마인드는 서비스 시작 (\d+)시간 전과 (\d+)분 전에 보낸다/,
    );
    expect(HOLD_MINUTES).toBe(Number(hold));
    expect(PUBLISH_WINDOW_HOURS).toBe(Number(publish));
    expect([...REMINDER_MINUTES_BEFORE]).toEqual([Number(first) * 60, Number(second)]);
  });

  it('원장님 귀책 취소의 쿠폰·패널티와 쿠폰 유효기간', () => {
    const [coupon, penalty] = find(
      RULES,
      'CLAUDE.md',
      /고객 계정에 ([\d,]+)원 쿠폰을 주고.*?원장님은 패널티 ([\d,]+)원/,
    );
    const [days] = find(RULES, 'CLAUDE.md', /결제 1건에 1장, 유효기간 (\d+)일/);
    expect(OWNER_FAULT_COUPON_AMOUNT).toBe(won(coupon));
    expect(OWNER_FAULT_PENALTY_AMOUNT).toBe(won(penalty));
    expect(COUPON_VALID_DAYS).toBe(Number(days));
  });

  it('합의 후 취소: 손님 답 기한과 환불 비율', () => {
    const [hours] = find(RULES, 'CLAUDE.md', /손님이 동의하지 않거나 (\d+)시간 안에 답하지 않으면/);
    const [rate] = find(RULES, 'CLAUDE.md', /손님은 실제 결제액의 (\d+)%를 환불받고/);
    expect(AGREED_CANCEL_RESPONSE_HOURS).toBe(Number(hours));
    expect(AGREED_CANCEL_REFUND_RATE).toBe(Number(rate));
  });
});

describe('settlement-examples.md 2장: 원 미만 처리', () => {
  it('고객 취소 위약금은 원 미만을 버리고, 환불 = 결제액 − 위약금', () => {
    const examples = [
      ...EXAMPLES.matchAll(
        /결제액 ([\d,]+)원, (\d+)시간 전 취소 → 위약금 ([\d,]+)원.*?환불 ([\d,]+)원/g,
      ),
    ].map(([, paid, hours, penalty, refund]) => ({
      paid: won(paid),
      hours: Number(hours),
      penalty: won(penalty),
      refund: won(refund),
    }));
    let splitsRounding = false;
    for (const example of examples) {
      const result = calcRefund({
        paidAmount: example.paid,
        salePrice: example.paid,
        startAt: new Date(NOW.getTime() + example.hours * HOUR),
        now: NOW,
      });
      expect([result.penaltyAmount, result.refundAmount], `결제액 ${example.paid}원`).toEqual([
        example.penalty,
        example.refund,
      ]);
      // 원 미만이 0.5 이상인 예시가 있어야 버림과 반올림이 갈린다(0.1이면 둘 다 같아서 반올림으로 바뀌어도 못 잡는다)
      if ((example.paid * result.penaltyRate) % 100 >= 50) splitsRounding = true;
    }
    expect(examples.length, '2장의 고객 취소 예시').toBeGreaterThan(0);
    expect(splitsRounding, '2장에 원 미만이 0.5 이상인 예시가 있어야 해요').toBe(true);
  });
});

describe('settlement-examples.md 3장·4장 이용 완료 표', () => {
  const saleTables: { heading: string; mode: PlatformFeeMode }[] = [
    { heading: '3. 오픈 기간 예시 (지금 적용: 플랫폼 수수료 0%)', mode: 'launch' },
    { heading: '4. 법인 전환 뒤 예시 (할인율별 플랫폼 수수료, 보관)', mode: 'tiered' },
  ];
  for (const { heading, mode } of saleTables) {
    for (const column of tableUnder(heading)) {
      it(`${heading.slice(0, 1)}장 ${column.name}`, () => {
        const [rate] = find(column.name, `표 열 "${column.name}"`, /(\d+)% 할인/);
        const discountRate = Number(rate);
        const salePrice = calcSalePrice(LIST_PRICE, discountRate);
        const paid = salePrice - couponOf(column.name);
        const fees = calcSettlementFees({
          baseAmount: settlementBaseAmount({ kind: 'sale', salePrice }),
          discountRate,
          paymentFeeRate: PAYMENT_FEE_RATE,
          mode,
        });
        const pg = pgFeeOf(paid);
        const turi = calcTuriShare({ fees, paidAmount: paid, refundAmount: 0, ...pg });

        expect(salePrice, '판매가').toBe(amount(column.get('판매가')));
        expect(paid, '고객 카드 결제').toBe(amount(column.get('고객 카드 결제')));
        expect([pg.pgFee, pg.pgFeeVat], '실제 PG 수수료').toEqual(
          amounts(column.get('실제 PG 수수료')),
        );
        expect(turi.pgHeld, 'PG가 맡아 둔 돈').toBe(amount(column.get('PG가 맡아 둔 돈')));
        expectPlatformFee(amounts(column.get('플랫폼 수수료')), fees);
        expect([fees.paymentFee, fees.paymentFeeVat], '결제 수수료').toEqual(
          amounts(column.get('결제 수수료')),
        );
        expect(fees.payoutAmount, '원장님 정산').toBe(amount(column.get('원장님 정산')));
        expect(turi.turiRemaining, '투리에 남는 돈').toBe(amount(column.get('투리에 남는 돈')));
        expect(turi.turiProfit, '투리 손익').toBe(amount(column.get('투리 손익')));
      });
    }
  }

});

describe('settlement-examples.md 3장·4장 고객 취소 표', () => {
  const cancelTables: { heading: string; mode: PlatformFeeMode }[] = [
    {
      heading: '오픈 기간, 고객이 30시간 전에 취소한 경우 (위약금 30%, 10% 할인 매물)',
      mode: 'launch',
    },
    { heading: '고객이 30시간 전에 취소한 경우 (위약금 30%, 10% 할인 매물)', mode: 'tiered' },
  ];
  for (const { heading, mode } of cancelTables) {
    const [hours, penaltyRate, discountRate] = find(
      heading,
      `제목 "${heading}"`,
      /(\d+)시간 전에 취소한 경우 \(위약금 (\d+)%, (\d+)% 할인 매물\)/,
    ).map(Number);
    for (const column of tableUnder(heading)) {
      it(`${mode === 'launch' ? '3' : '4'}장 ${column.name}`, () => {
        const salePrice = calcSalePrice(LIST_PRICE, discountRate);
        const paid = salePrice - couponOf(column.name);
        const refund = calcRefund({
          paidAmount: paid,
          salePrice,
          startAt: new Date(NOW.getTime() + hours * HOUR),
          now: NOW,
        });
        const base = settlementBaseAmount({
          kind: 'penalty',
          salePrice,
          penaltyRate: refund.penaltyRate,
        });
        const fees = calcSettlementFees({
          baseAmount: base,
          discountRate,
          paymentFeeRate: PAYMENT_FEE_RATE,
          mode,
        });
        const pg = pgFeeOf(paid - refund.refundAmount);
        const turi = calcTuriShare({
          fees,
          paidAmount: paid,
          refundAmount: refund.refundAmount,
          ...pg,
        });
        const [platformCell, paymentCell] = column.get('플랫폼 수수료').split('/').map(amounts);

        expect(refund.penaltyRate, '위약금 비율').toBe(penaltyRate);
        expect(paid, '고객 카드 결제').toBe(amount(column.get('고객 카드 결제')));
        expect(refund.refundAmount, '고객 환불').toBe(amount(column.get('고객 환불')));
        expect(turi.cardRemaining, '카드에 남은 돈').toBe(amount(column.get('카드에 남은 돈')));
        expect([pg.pgFee, pg.pgFeeVat], '실제 PG 수수료').toEqual(
          amounts(column.get('실제 PG 수수료')),
        );
        expect(turi.pgHeld, 'PG가 맡아 둔 돈').toBe(amount(column.get('PG가 맡아 둔 돈')));
        expect(base, '기준 금액').toBe(amount(column.get('기준 금액')));
        expect(refund.ownerBaseAmount, '환불 계산의 원장님 기준 금액').toBe(base);
        expectPlatformFee(platformCell, fees);
        expect([fees.paymentFee, fees.paymentFeeVat], '결제 수수료').toEqual(paymentCell);
        expect(fees.payoutAmount, '원장님 정산').toBe(amount(column.get('원장님 정산')));
        expect(turi.turiRemaining, '투리에 남는 돈').toBe(amount(column.get('투리에 남는 돈')));
        expect(turi.turiProfit, '투리 손익').toBe(amount(column.get('투리 손익')));
      });
    }
  }

});

describe('settlement-examples.md 3장 합의 후 취소 원 미만', () => {
  it('합의 후 취소 원 미만은 고객 취소처럼 손님 쪽으로: 위약금 쪽에서 버리고 환불 = 결제액 − 위약금', () => {
    const examples = [
      ...EXAMPLES.matchAll(
        /결제액 ([\d,]+)원, 합의 후 취소 → 위약금 ([\d,]+)원.*?손님 환불 ([\d,]+)원/g,
      ),
    ].map(([, paid, penalty, refund]) => ({
      paid: won(paid),
      penalty: won(penalty),
      refund: won(refund),
    }));
    expect(examples.length, '3장의 합의 후 취소 원 미만 예시').toBeGreaterThan(0);
    for (const example of examples) {
      // 원 미만이 0.5라서 버림(손님 쪽)과 반올림·올림(원장님 쪽)이 갈린다
      expect((example.paid * (100 - AGREED_CANCEL_REFUND_RATE)) % 100, '원 미만이 생기는 예시').toBe(
        50,
      );
      const { refundAmount } = calcAgreedCancel({
        paidAmount: example.paid,
        salePrice: example.paid,
      });
      expect([example.paid - refundAmount, refundAmount], `결제액 ${example.paid}원`).toEqual([
        example.penalty,
        example.refund,
      ]);
    }
  });
});

describe('settlement-examples.md 3장 합의 후 취소 표', () => {
  const agreedHeading = '오픈 기간, 손님과 합의 후 취소한 경우 (손님 50% 환불, 10% 할인 매물)';
  const [refundRate, agreedDiscount] = find(
    agreedHeading,
    `제목 "${agreedHeading}"`,
    /손님 (\d+)% 환불, (\d+)% 할인 매물/,
  ).map(Number);
  for (const column of tableUnder(agreedHeading)) {
    it(column.name, () => {
      const salePrice = calcSalePrice(LIST_PRICE, agreedDiscount);
      const paid = salePrice - couponOf(column.name);
      const agreed = calcAgreedCancel({ paidAmount: paid, salePrice });
      const fees = calcSettlementFees({
        baseAmount: agreed.baseAmount,
        discountRate: agreedDiscount,
        paymentFeeRate: PAYMENT_FEE_RATE,
        mode: 'launch',
      });
      const pg = pgFeeOf(paid - agreed.refundAmount);
      const turi = calcTuriShare({
        fees,
        paidAmount: paid,
        refundAmount: agreed.refundAmount,
        ...pg,
      });
      const [platformCell, paymentCell] = column.get('플랫폼 수수료').split('/').map(amounts);

      expect(AGREED_CANCEL_REFUND_RATE, '환불 비율').toBe(refundRate);
      expect(paid, '고객 카드 결제').toBe(amount(column.get('고객 카드 결제')));
      expect(agreed.refundAmount, '고객 환불').toBe(amount(column.get('고객 환불')));
      expect(turi.cardRemaining, '카드에 남은 돈').toBe(amount(column.get('카드에 남은 돈')));
      expect([pg.pgFee, pg.pgFeeVat], '실제 PG 수수료').toEqual(
        amounts(column.get('실제 PG 수수료')),
      );
      expect(turi.pgHeld, 'PG가 맡아 둔 돈').toBe(amount(column.get('PG가 맡아 둔 돈')));
      expect(agreed.baseAmount, '기준 금액').toBe(amount(column.get('기준 금액')));
      expectPlatformFee(platformCell, fees);
      expect([fees.paymentFee, fees.paymentFeeVat], '결제 수수료').toEqual(paymentCell);
      expect(fees.payoutAmount, '원장님 정산').toBe(amount(column.get('원장님 정산')));
      expect(turi.turiRemaining, '투리에 남는 돈').toBe(amount(column.get('투리에 남는 돈')));
      expect(turi.turiProfit, '투리 손익').toBe(amount(column.get('투리 손익')));
    });
  }
});
