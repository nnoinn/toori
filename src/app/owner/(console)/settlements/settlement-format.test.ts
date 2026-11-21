import { describe, expect, it } from 'vitest';

import {
  adminHoldNoticeLine,
  baseAmountFormula,
  disputeDeadlineText,
  feeRateLabel,
  formatDateKey,
  hoursBeforeText,
  minusWon,
  monthLabel,
  monthRange,
  payoutAccountText,
  periodHrefValue,
  periodLabel,
  resolveSettlementItemSort,
  resolveSettlementPeriod,
  resolveSettlementView,
  settlementsHref,
  settlementStatusText,
  shiftMonth,
  sortSettlementItems,
  STATEMENT_STATUS_LABELS,
  statementAmountNote,
  statementCountsText,
  statementPenaltyLabel,
  statementQueryPeriod,
  statementTotalCount,
  wonOrUnknown,
  zeroReasonText,
} from './settlement-format';

// 원장님 정산 내역 문구와 기간 (O15, S-502). 금액은 docs/settlement-examples.md 3장(10% 할인, 판매가 45,000원) 숫자 그대로
describe('정산 내역 문구 (O15, S-502)', () => {
  it('기준 금액 식: 고객 취소는 판매가 × 위약금 비율, 합의 후 취소는 판매가 × 50% (정산 예시 3장)', () => {
    expect(
      baseAmountFormula({ kind: 'penalty', salePrice: 45000, penaltyRate: 30, baseAmount: 13500 }),
    ).toBe('판매가 45,000원 × 30% = 13,500원');
    expect(
      baseAmountFormula({
        kind: 'agreed_cancel',
        salePrice: 45000,
        penaltyRate: 50,
        baseAmount: 22500,
      }),
    ).toBe('판매가 45,000원 × 50% = 22,500원');
    // 비율 기록이 없으면 식 없이 기준 금액만
    expect(
      baseAmountFormula({
        kind: 'penalty',
        salePrice: 45000,
        penaltyRate: null,
        baseAmount: 13500,
      }),
    ).toBe('13,500원');
  });

  it('기준 금액 식: 이용 완료·노쇼는 판매가 그대로, 원장님 사정 취소·무효는 정산할 금액이 없다', () => {
    expect(
      baseAmountFormula({ kind: 'sale', salePrice: 45000, penaltyRate: null, baseAmount: 45000 }),
    ).toBe('판매가 45,000원 그대로');
    expect(
      baseAmountFormula({
        kind: 'no_show',
        salePrice: 45000,
        penaltyRate: null,
        baseAmount: 45000,
      }),
    ).toBe('판매가 45,000원 그대로');
    expect(
      baseAmountFormula({
        kind: 'owner_cancel',
        salePrice: 45000,
        penaltyRate: null,
        baseAmount: 0,
      }),
    ).toBe('원장님 사정 취소는 정산할 금액이 없어요');
    expect(
      baseAmountFormula({ kind: 'void', salePrice: 45000, penaltyRate: null, baseAmount: 0 }),
    ).toBe('무효 처리된 예약은 정산할 금액이 없어요');
  });

  it('결제 수수료율이 정해지기 전(null)에는 금액·비율을 [미정]으로 둔다(가격 미리보기 S-203과 같다)', () => {
    expect(wonOrUnknown(null)).toBe('[미정]');
    expect(wonOrUnknown(13055)).toBe('13,055원');
    expect(minusWon(null)).toBe('[미정]');
    expect(minusWon(405)).toBe('− 405원');
    expect(feeRateLabel(null)).toBe('기준 금액의 [미정]');
    expect(feeRateLabel(0)).toBe('기준 금액의 0%');
  });

  it('지급일은 함수가 준 날짜 그대로 "11/19(목) 지급 예정"처럼, 보류·지급할 금액 없음은 날짜 없이', () => {
    expect(settlementStatusText({ status: 'scheduled', payoutDate: '2026-11-19' })).toBe(
      '11/19(목) 지급 예정',
    );
    expect(settlementStatusText({ status: 'paid', payoutDate: '2026-11-19' })).toBe(
      '11/19(목) 지급 완료',
    );
    expect(settlementStatusText({ status: 'no_payout', payoutDate: null })).toBe(
      '정산할 금액 없음',
    );
  });

  it('보류 줄은 함수가 준 이유대로: 이의제기면 "이의제기로 보류", 운영자 보류면 "운영자 확인으로 보류" (#468)', () => {
    expect(
      settlementStatusText({
        status: 'held',
        payoutDate: null,
        hold: { reason: 'dispute', receivedAt: '2026-11-14T16:00:00.000Z' },
      }),
    ).toBe('이의제기로 보류');
    expect(
      settlementStatusText({ status: 'held', payoutDate: null, hold: { reason: 'admin' } }),
    ).toBe('운영자 확인으로 보류');
    // 함수는 보류 줄에 늘 이유를 주지만, 없으면 어느 쪽이라고 하지 않는다
    expect(settlementStatusText({ status: 'held', payoutDate: null, hold: null })).toBe('보류');
  });

  it('시작 몇 시간 전에 취소했는지: 30 → "시작 30시간 전", 1시간이 안 됐으면 "시작 1시간 이내"', () => {
    expect(hoursBeforeText(30)).toBe('시작 30시간 전');
    expect(hoursBeforeText(0)).toBe('시작 1시간 이내');
    expect(hoursBeforeText(null)).toBeNull();
  });

  it('이의제기 접수 기한: 남았으면 "…까지 없으면 확정", 지났으면 "…에 확정됐어요", 한국 시간으로', () => {
    const item = {
      status: 'scheduled' as const,
      // 11/18(수) 18:00 한국 시간
      disputeDeadlineAt: '2026-11-18T09:00:00.000Z',
      hold: null,
    };
    expect(disputeDeadlineText(item, new Date('2026-11-18T08:59:00.000Z'))).toBe(
      '11/18(수) 18:00까지 이의제기가 없으면 확정돼요.',
    );
    expect(disputeDeadlineText(item, new Date('2026-11-18T09:00:00.000Z'))).toBe(
      '11/18(수) 18:00에 확정됐어요.',
    );
  });

  it('보류 중이면 접수한 한국 날짜와 다음 지급일 안내, 정산할 금액이 없는 줄은 기한 안내가 없다', () => {
    const now = new Date('2026-11-16T00:00:00.000Z');
    expect(
      disputeDeadlineText(
        {
          status: 'held',
          disputeDeadlineAt: '2026-11-18T09:00:00.000Z',
          // UTC로는 11/14지만 한국 시간으로는 11/15(일) 01:00에 받았다
          hold: { reason: 'dispute', receivedAt: '2026-11-14T16:00:00.000Z' },
        },
        now,
      ),
    ).toBe('이의제기 확인 중이에요(11/15(일) 접수). 결론이 나면 그다음 지급일에 들어가요.');
    // 운영자 보류(#373 ②)는 사유·날짜 없이(11/15 nnoinn)
    expect(
      disputeDeadlineText(
        {
          status: 'held',
          disputeDeadlineAt: '2026-11-18T09:00:00.000Z',
          hold: { reason: 'admin' },
        },
        now,
      ),
    ).toBe('운영자가 확인 중이에요. 확인이 끝나면 그다음 지급일에 들어가요.');
    expect(
      disputeDeadlineText(
        { status: 'no_payout', disputeDeadlineAt: '2026-11-18T09:00:00.000Z', hold: null },
        now,
      ),
    ).toBeNull();
  });
});

// 원장님 정산서 문구 (O15, S-501). 금액은 docs/settlement-examples.md 3장 숫자 그대로:
// 10% 할인 이용 완료 정산 43,515원, 30시간 전 고객 취소 정산 13,055원, 원장님 귀책 패널티 5,000원
describe('정산서 문구 (O15, S-501)', () => {
  it('종류별 건수는 0건인 종류를 빼고 거래 내역과 같은 이름으로, 거래 수는 모두 더한 것', () => {
    const counts = { sale: 2, no_show: 0, penalty: 1, agreed_cancel: 0 };
    expect(statementCountsText(counts)).toBe('이용 완료 2건 · 고객 취소 1건');
    expect(statementTotalCount(counts)).toBe(3);
    const all = { sale: 1, no_show: 1, penalty: 1, agreed_cancel: 1 };
    expect(statementCountsText(all)).toBe(
      '이용 완료 1건 · 노쇼 1건 · 고객 취소 1건 · 합의 후 취소 1건',
    );
    expect(statementTotalCount(all)).toBe(4);
    expect(statementCountsText({ sale: 0, no_show: 0, penalty: 0, agreed_cancel: 0 })).toBe(
      '거래 없음',
    );
  });

  it('지급 예정 장의 패널티는 "예상", 묶인 장은 "뗀 패널티" (11/14 nnoinn)', () => {
    expect(statementPenaltyLabel('scheduled')).toBe('뗄 패널티 (예상)');
    expect(statementPenaltyLabel('pending')).toBe('뗀 패널티');
    expect(statementPenaltyLabel('paid')).toBe('뗀 패널티');
  });

  it('이용 완료 43,515원에서 패널티 5,000원을 떼면 실지급액 38,515원: 줄 아래에 뗀 패널티를 적는다', () => {
    // 지급액 38,515원은 함수가 준 값이고 화면은 그대로 쓴다
    expect(wonOrUnknown(38515)).toBe('38,515원');
    expect(statementAmountNote({ status: 'paid', zeroReason: null, penaltyDeducted: 5000 })).toBe(
      '패널티 5,000원 뗐어요',
    );
    expect(
      statementAmountNote({ status: 'scheduled', zeroReason: null, penaltyDeducted: 5000 }),
    ).toBe('패널티 5,000원 뗄 예정 (예상)');
  });

  it('뗀 패널티가 없거나(0원) 아직 모르면(결제 수수료율 전, null) 줄 아래 글이 없다', () => {
    expect(
      statementAmountNote({ status: 'paid', zeroReason: null, penaltyDeducted: 0 }),
    ).toBeNull();
    expect(
      statementAmountNote({ status: 'scheduled', zeroReason: null, penaltyDeducted: null }),
    ).toBeNull();
  });

  it('고객 취소 13,055원을 남은 패널티로 모두 떼서 0원이면 "패널티로 상계해서 0원" (#353 4번)', () => {
    expect(zeroReasonText({ status: 'paid', zeroReason: 'penalty_offset' })).toBe(
      '패널티로 상계해서 0원',
    );
    expect(zeroReasonText({ status: 'scheduled', zeroReason: 'penalty_offset' })).toBe(
      '패널티로 상계해서 0원 (예상)',
    );
    expect(zeroReasonText({ status: 'paid', zeroReason: null })).toBeNull();
    // 0원이면 뗀 패널티 금액보다 0원인 이유를 먼저 적는다
    expect(
      statementAmountNote({
        status: 'paid',
        zeroReason: 'penalty_offset',
        penaltyDeducted: 13055,
      }),
    ).toBe('패널티로 상계해서 0원');
  });

  it('상태 이름과 정산 계좌(은행·끝 4자리만)', () => {
    expect(STATEMENT_STATUS_LABELS.scheduled).toBe('지급 예정');
    expect(STATEMENT_STATUS_LABELS.paid).toBe('지급 완료');
    expect(STATEMENT_STATUS_LABELS.failed).toBe('지급 실패 · 다시 요청 예정');
    expect(payoutAccountText({ bankName: '국민은행', accountLast4: '1234' })).toBe(
      '국민은행 ****1234',
    );
  });
});

describe('정산서 기간과 탭 주소 (O15, S-501)', () => {
  it('이번 달을 볼 때는 다음 달 말일까지 찾는다(월말에 다음 지급일이 다음 달 목요일이어도 보이게)', () => {
    const november = { kind: 'month' as const, month: '2026-11', ...monthRange('2026-11') };
    expect(statementQueryPeriod(november, '2026-11')).toEqual({
      from: '2026-11-01',
      to: '2026-12-31',
    });
    const december = { kind: 'month' as const, month: '2026-12', ...monthRange('2026-12') };
    expect(statementQueryPeriod(december, '2026-12')).toEqual({
      from: '2026-12-01',
      to: '2027-01-31',
    });
  });

  it('지난 달과 직접 고른 기간은 그대로 찾는다', () => {
    const october = { kind: 'month' as const, month: '2026-10', ...monthRange('2026-10') };
    expect(statementQueryPeriod(october, '2026-11')).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(
      statementQueryPeriod({ kind: 'range', from: '2026-09-01', to: '2026-11-14' }, '2026-11'),
    ).toEqual({ from: '2026-09-01', to: '2026-11-14' });
  });

  it('탭: view=items면 거래 내역, 없거나 다른 값이면 정산서(처음 열면 정산서)', () => {
    expect(resolveSettlementView('items')).toBe('items');
    expect(resolveSettlementView(undefined)).toBe('statements');
    expect(resolveSettlementView('statements')).toBe('statements');
    expect(resolveSettlementView('abc')).toBe('statements');
  });

  it('주소: 거래 내역 탭은 view=items, 펼친 정산서는 payout=지급일, 정산서 탭은 view를 넣지 않는다', () => {
    expect(settlementsHref({ month: '2026-11' }, { view: 'items' })).toBe(
      '/owner/settlements?view=items&month=2026-11',
    );
    expect(settlementsHref({ month: '2026-11' }, { payout: '2026-11-19' })).toBe(
      '/owner/settlements?month=2026-11&payout=2026-11-19',
    );
    expect(
      settlementsHref(
        { from: '2026-09-01', to: '2026-11-14' },
        { view: 'statements', payout: null },
      ),
    ).toBe('/owner/settlements?from=2026-09-01&to=2026-11-14');
    expect(periodHrefValue({ kind: 'month', month: '2026-11', ...monthRange('2026-11') })).toEqual({
      month: '2026-11',
    });
    expect(periodHrefValue({ kind: 'range', from: '2026-09-01', to: '2026-11-14' })).toEqual({
      from: '2026-09-01',
      to: '2026-11-14',
    });
  });
});

describe('정산 내역 기간 (O15, S-502)', () => {
  it('달의 첫날과 마지막 날: 30일·31일 달, 2월(윤년 29일)', () => {
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('달을 앞뒤로 옮기면 해를 넘어간다', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-11', -1)).toBe('2026-10');
  });

  it('주소 값이 없거나 틀리면 이번 달(한국 날짜). UTC로는 11/30이어도 한국이 12/1이면 12월', () => {
    // 한국 시간 12/1(화) 00:30
    const now = new Date('2026-11-30T15:30:00.000Z');
    const december = { kind: 'month', month: '2026-12', from: '2026-12-01', to: '2026-12-31' };
    expect(resolveSettlementPeriod({}, now)).toEqual(december);
    expect(resolveSettlementPeriod({ month: '2026-13' }, now)).toEqual(december);
    expect(resolveSettlementPeriod({ month: '11월' }, now)).toEqual(december);
  });

  it('month 값이 맞으면 그 달, 시작일·끝일이 둘 다 있으면 그 기간(맞는 기간인지는 서버가 본다)', () => {
    const now = new Date('2026-11-14T03:00:00.000Z');
    expect(resolveSettlementPeriod({ month: '2026-10' }, now)).toEqual({
      kind: 'month',
      month: '2026-10',
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(resolveSettlementPeriod({ from: '2026-09-01', to: '2026-11-14' }, now)).toEqual({
      kind: 'range',
      from: '2026-09-01',
      to: '2026-11-14',
    });
    // 끝일만 비었으면 직접 기간으로 보지 않고 이번 달
    expect(resolveSettlementPeriod({ from: '2026-09-01' }, now)).toMatchObject({
      kind: 'month',
      month: '2026-11',
    });
  });

  it('시작일·끝일 중 하나라도 비거나 날짜 모양이 아니면 그 기간으로 보지 않고 month 값의 달', () => {
    const now = new Date('2026-11-14T03:00:00.000Z');
    const october = { kind: 'month', month: '2026-10' };
    for (const range of [
      { to: '2026-11-14' },
      { from: '2026-09-01', to: '2026-11-14x' },
      { from: 'x2026-09-01', to: '2026-11-14' },
      { from: '2026-09-01T00', to: '2026-11-14' },
      { from: '2026-09-01', to: 'x2026-11-14' },
    ]) {
      expect(resolveSettlementPeriod({ month: '2026-10', ...range }, now)).toMatchObject(october);
    }
  });

  it('month 값은 YYYY-MM 모양의 1~12월만 받는다', () => {
    const now = new Date('2026-11-14T03:00:00.000Z');
    expect(resolveSettlementPeriod({ month: '2026-09' }, now)).toMatchObject({ month: '2026-09' });
    for (const month of ['2026-00', '2026-13', '2026-10x', 'x2026-10']) {
      expect(resolveSettlementPeriod({ month }, now)).toMatchObject({ month: '2026-11' });
    }
    expect(monthLabel('2026-09')).toBe('2026년 9월');
  });

  it('주소와 기간 이름', () => {
    expect(settlementsHref({ month: '2026-11' })).toBe('/owner/settlements?month=2026-11');
    expect(settlementsHref({ from: '2026-09-01', to: '2026-11-14' })).toBe(
      '/owner/settlements?from=2026-09-01&to=2026-11-14',
    );
    expect(formatDateKey('2026-11-19')).toBe('11/19(목)');
    expect(periodLabel('2026-11-01', '2026-11-30')).toBe('11/1(일) ~ 11/30(월)');
    expect(periodLabel('2026-12-01', '2027-01-31')).toBe('2026. 12/1(화) ~ 2027. 1/31(일)');
  });
});

describe('거래 내역 정렬 (#358 5번, 11/18 정민석)', () => {
  /** 거래 하나: 이름, 처리·취소 시각, 서비스 일시(한국 시간) */
  const item = (name: string, occurred: string, start: string) => ({
    name,
    occurredAt: new Date(`${occurred}+09:00`).toISOString(),
    startAt: new Date(`${start}+09:00`).toISOString(),
  });
  // 서버 함수가 주는 순서(처리·취소 최신 순). C와 D는 같은 시각에 처리했고, B와 D는 서비스 일시가 같다
  const items = [
    item('A', '2026-11-16T20:00', '2026-11-16T18:00'),
    item('C', '2026-11-15T12:00', '2026-11-14T10:00'),
    item('D', '2026-11-15T12:00', '2026-11-17T15:00'),
    item('B', '2026-11-13T09:00', '2026-11-17T15:00'),
  ];
  const names = (list: readonly { name: string }[]) => list.map((entry) => entry.name).join('');

  it('처리·취소 시각 순: 같은 시각에 처리했으면 서비스 일시도 같은 방향으로', () => {
    expect(names(sortSettlementItems(items, 'occurred_desc'))).toBe('ADCB');
    expect(names(sortSettlementItems(items, 'occurred_asc'))).toBe('BCDA');
  });

  it('서비스 일시 순(목록 첫 칸): 서비스 일시가 같으면 처리·취소 시각도 같은 방향으로', () => {
    expect(names(sortSettlementItems(items, 'start_desc'))).toBe('DBAC');
    expect(names(sortSettlementItems(items, 'start_asc'))).toBe('CABD');
  });

  it('받은 순서가 달라도 결과는 같다(같은 시각끼리도 둘째 기준으로 정한다)', () => {
    const reversed = [...items].reverse();
    expect(names(sortSettlementItems(reversed, 'occurred_desc'))).toBe('ADCB');
    expect(names(sortSettlementItems(reversed, 'occurred_asc'))).toBe('BCDA');
    expect(names(sortSettlementItems(reversed, 'start_desc'))).toBe('DBAC');
    expect(names(sortSettlementItems(reversed, 'start_asc'))).toBe('CABD');
  });

  it('순서만 바꾸고 받은 목록은 그대로 둔다', () => {
    const sorted = sortSettlementItems(items, 'start_asc');
    expect(names(items)).toBe('ACDB');
    expect(sorted[0]).toBe(items[1]);
  });

  it('주소의 sort: 모르는 값·없으면 처리·취소 최신 순', () => {
    expect(resolveSettlementItemSort('start_asc')).toBe('start_asc');
    expect(resolveSettlementItemSort('amount')).toBe('occurred_desc');
    expect(resolveSettlementItemSort(undefined)).toBe('occurred_desc');
  });

  it('주소: 거래 내역 탭에서 기본이 아닌 정렬만 sort=로 쓰고, 정산서 탭에는 쓰지 않는다', () => {
    expect(settlementsHref({ month: '2026-11' }, { view: 'items', sort: 'start_desc' })).toBe(
      '/owner/settlements?view=items&month=2026-11&sort=start_desc',
    );
    expect(
      settlementsHref(
        { from: '2026-09-01', to: '2026-11-14' },
        { view: 'items', sort: 'occurred_asc' },
      ),
    ).toBe('/owner/settlements?view=items&from=2026-09-01&to=2026-11-14&sort=occurred_asc');
    expect(settlementsHref({ month: '2026-11' }, { view: 'items', sort: 'occurred_desc' })).toBe(
      '/owner/settlements?view=items&month=2026-11',
    );
    expect(settlementsHref({ month: '2026-11' }, { view: 'statements', sort: 'start_desc' })).toBe(
      '/owner/settlements?month=2026-11',
    );
  });
});

describe('운영자 정산 보류 사유 한 줄 (#489, #499)', () => {
  it('운영자가 고른 사유와 다음에 할 일을 정책 문구 그대로', () => {
    expect(adminHoldNoticeLine({ reason: 'admin', code: 'payout_info_check' })).toBe(
      '사유: 정산 계좌·사업자 정보 확인이 필요해요 · 정산 계좌를 확인해 주세요',
    );
    expect(adminHoldNoticeLine({ reason: 'admin', code: 'other' })).toBe(
      '사유: 기타 · 자세한 내용은 투리 카카오톡 채널로 안내해 드려요',
    );
  });

  it('다음에 할 일이 "돌아오는 지급일에 들어가요"면 위 문장과 겹쳐서 사유만, 다음에 할 일이 없으면(원장님 요청) 사유만', () => {
    expect(adminHoldNoticeLine({ reason: 'admin', code: 'user_inquiry' })).toBe(
      '사유: 이용자 문의를 확인하고 있어요',
    );
    expect(adminHoldNoticeLine({ reason: 'admin', code: 'payment_check' })).toBe(
      '사유: 결제·환불 내역을 확인하고 있어요',
    );
    expect(adminHoldNoticeLine({ reason: 'admin', code: 'owner_request' })).toBe(
      '사유: 원장님이 요청하셨어요',
    );
  });

  it('이의제기 보류나 보류가 아니면 없다', () => {
    expect(
      adminHoldNoticeLine({ reason: 'dispute', receivedAt: '2026-11-15T01:00:00.000Z' }),
    ).toBeNull();
    expect(adminHoldNoticeLine(null)).toBeNull();
    expect(adminHoldNoticeLine(undefined)).toBeNull();
  });
});
