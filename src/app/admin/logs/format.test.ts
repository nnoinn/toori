// 운영자 기록 화면의 주소 값·이름표·대상 이름 (#372 5장).

import { describe, expect, it } from 'vitest';

import {
  ACTION_LABELS,
  labelOf,
  logsHref,
  targetHref,
  TARGET_TYPE_LABELS,
  targetLabel,
  type TargetNames,
  toKstRange,
  toLogParams,
} from './format';

const NONE: TargetNames = {
  shopName: null,
  reservationCode: null,
  disputeReservationCode: null,
  customerName: null,
  ownerName: null,
  settlementShopName: null,
  settlementPayoutDate: null,
};

describe('주소 값', () => {
  it('모르는 탭은 처리 기록, 모르는 정렬은 최근 순, 모양이 틀린 운영자·한 일·대상·날짜는 거르지 않는다', () => {
    expect(toLogParams({})).toEqual({
      tab: 'actions',
      sort: 'new',
      admin: null,
      kind: null,
      target: null,
      from: null,
      to: null,
      page: 1,
    });
    expect(
      toLogParams({
        tab: 'access',
        sort: 'old',
        admin: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
        kind: 'shop.approve',
        target: 'shop',
        from: '2026-11-01',
        to: '2026-11-15',
        page: '3',
      }),
    ).toEqual({
      tab: 'access',
      sort: 'old',
      admin: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b',
      kind: 'shop.approve',
      target: 'shop',
      from: '2026-11-01',
      to: '2026-11-15',
      page: 3,
    });
    expect(
      toLogParams({ tab: 'x', admin: 'not-uuid', kind: 'DROP TABLE', target: "'", from: '11/1' }),
    ).toMatchObject({ tab: 'actions', admin: null, kind: null, target: null, from: null });
  });

  it.each(['x shop.approve', 'shop.approve;', 'shop.approve drop', 'Shop', 'a'.repeat(41)])(
    '한 일·대상 값은 처음부터 끝까지 소문자·점·밑줄(40자까지)이어야 쓴다(%j는 거르지 않는다)',
    (value) => {
      expect(toLogParams({ kind: value, target: value })).toMatchObject({
        kind: null,
        target: null,
      });
    },
  );

  it.each(['0', '-2', '1.5', 'abc', ''])('쪽이 1 이상의 정수가 아니면(%j) 1쪽', (page) => {
    expect(toLogParams({ page }).page).toBe(1);
  });

  it('기본값(처리 기록, 최근 순, 빈 거르기, 1쪽)은 주소에 넣지 않는다', () => {
    expect(logsHref({ tab: 'actions' })).toBe('/admin/logs');
    expect(logsHref({ tab: 'actions', sort: 'new', admin: null, page: 1 })).toBe('/admin/logs');
    expect(logsHref({ tab: 'access', sort: 'old', kind: 'view', from: '2026-11-01' })).toBe(
      '/admin/logs?tab=access&sort=old&kind=view&from=2026-11-01',
    );
    expect(logsHref({ tab: 'actions', kind: 'shop.approve', page: 2 })).toBe(
      '/admin/logs?kind=shop.approve&page=2',
    );
  });

  it('기간은 한국 날짜 시작일 0시부터 끝일 다음 날 0시 전까지', () => {
    expect(toKstRange('2026-11-01', '2026-11-15')).toEqual({
      start: new Date('2026-11-01T00:00:00+09:00'),
      end: new Date('2026-11-16T00:00:00+09:00'),
    });
    expect(toKstRange(null, null)).toEqual({ start: null, end: null });
  });
});

describe('이름표와 대상', () => {
  it('아는 한 일은 이름으로, 모르는 값(객체 속성 이름 포함)은 그대로', () => {
    expect(labelOf(ACTION_LABELS, 'shop.approve')).toBe('입점 승인');
    expect(labelOf(ACTION_LABELS, 'dispute.resolve')).toBe('이의제기 결론');
    // 알림 확인(#373 ⑤)의 한 일과 대상
    expect(labelOf(ACTION_LABELS, 'notification.resend')).toBe('알림 다시 보내기');
    expect(labelOf(TARGET_TYPE_LABELS, 'notification')).toBe('알림');
    // 결제·환불 확인(#373 ①)의 한 일과 대상
    expect(labelOf(ACTION_LABELS, 'payment.retry')).toBe('결제 다시 시도');
    expect(labelOf(ACTION_LABELS, 'refund.retry')).toBe('환불 다시 시도');
    expect(labelOf(ACTION_LABELS, 'refund.review_check')).toBe('환불 금액 확인함');
    expect(labelOf(TARGET_TYPE_LABELS, 'order')).toBe('주문');
    expect(labelOf(TARGET_TYPE_LABELS, 'refund')).toBe('환불');
    // 원장님 대신 방문·노쇼 처리(#373 ③). 노쇼 되돌리기는 이의제기 결론과 같은 visit.override
    expect(labelOf(ACTION_LABELS, 'visit.record')).toBe('방문·노쇼 대신 처리');
    expect(labelOf(ACTION_LABELS, 'settlement.hold')).toBe('정산 보류');
    expect(labelOf(ACTION_LABELS, 'settlement.release')).toBe('정산 보류 풀기');
    expect(labelOf(ACTION_LABELS, 'shop.publish_pause')).toBe('게시 멈춤');
    expect(labelOf(ACTION_LABELS, 'shop.publish_resume')).toBe('게시 다시 열기');
    expect(labelOf(ACTION_LABELS, 'slot.force_close')).toBe('운영자 마감');
    expect(labelOf(TARGET_TYPE_LABELS, 'slot')).toBe('매물');
    expect(labelOf(TARGET_TYPE_LABELS, 'slot_window')).toBe('시간대 매물');
    expect(labelOf(ACTION_LABELS, 'reservation.owner_fault_cancel')).toBe('원장님 사정 취소(대신)');
    expect(labelOf(ACTION_LABELS, 'shop.new_thing')).toBe('shop.new_thing');
    expect(labelOf(ACTION_LABELS, 'constructor')).toBe('constructor');
  });

  it('대상 종류마다 이름을 고르고(이의제기는 그 예약번호, 정산은 샵 이름과 지급일), 목록·지운 대상은 null', () => {
    expect(targetLabel('shop', { ...NONE, shopName: '샘플 헤어' })).toBe('샘플 헤어');
    // 운영자 마감한 매물·시간대 매물(#373 ④): 샵 이름과 시작 시각(한국 시간)
    const start = new Date('2026-11-05T06:00:00.000Z');
    expect(
      targetLabel('slot', {
        ...NONE,
        slotShopName: '샘플 헤어',
        slotMenuName: '커트',
        slotStartAt: start,
      }),
    ).toMatch(/^샘플 헤어 커트 .*15:00/);
    expect(
      targetLabel('slot_window', { ...NONE, windowShopName: '샘플 헤어', windowStartAt: start }),
    ).toMatch(/^샘플 헤어 .*15:00 시간대$/);
    expect(targetLabel('slot', NONE)).toBeNull();
    expect(targetLabel('reservation', { ...NONE, reservationCode: 'AB12CD34' })).toBe('AB12CD34');
    expect(targetLabel('dispute', { ...NONE, disputeReservationCode: 'AB12CD34' })).toBe(
      'AB12CD34',
    );
    expect(targetLabel('customer', { ...NONE, customerName: '김투리' })).toBe('김투리');
    expect(targetLabel('owner', { ...NONE, ownerName: '원장님' })).toBe('원장님');
    expect(
      targetLabel('settlement', {
        ...NONE,
        settlementShopName: '샘플 헤어',
        settlementPayoutDate: '2026-11-19',
      }),
    ).toBe('샘플 헤어 2026-11-19 정산');
    expect(targetLabel('list', NONE)).toBeNull();
    expect(targetLabel('shop', NONE)).toBeNull();
  });

  it('정산·매물·시간대 매물은 이름에 쓰는 값이 하나라도 없으면(지운 대상) null', () => {
    const start = new Date('2026-11-05T06:00:00.000Z');
    expect(targetLabel('settlement', { ...NONE, settlementShopName: '샘플 헤어' })).toBeNull();
    expect(targetLabel('settlement', { ...NONE, settlementPayoutDate: '2026-11-19' })).toBeNull();
    expect(
      targetLabel('slot', { ...NONE, slotShopName: '샘플 헤어', slotStartAt: start }),
    ).toBeNull();
    expect(targetLabel('slot', { ...NONE, slotMenuName: '커트', slotStartAt: start })).toBeNull();
    expect(
      targetLabel('slot', { ...NONE, slotShopName: '샘플 헤어', slotMenuName: '커트' }),
    ).toBeNull();
    expect(targetLabel('slot_window', { ...NONE, windowShopName: '샘플 헤어' })).toBeNull();
    expect(targetLabel('slot_window', { ...NONE, windowStartAt: start })).toBeNull();
  });

  it('운영자 화면이 있는 대상만 주소를 준다', () => {
    expect(targetHref('shop', 's-1')).toBe('/admin/shops/s-1');
    expect(targetHref('reservation', 'r-1')).toBe('/admin/reservations/r-1');
    expect(targetHref('dispute', 'd-1')).toBe('/admin/disputes/d-1');
    expect(targetHref('customer', 'c-1')).toBe('/admin/users/customers/c-1');
    expect(targetHref('settlement', 'st-1')).toBe('/admin/settlements/st-1');
    expect(targetHref('slot', 'sl-1')).toBe('/admin/reservations/slots/sl-1');
    expect(targetHref('slot_window', 'w-1')).toBeNull();
    expect(targetHref('owner', 'o-1')).toBeNull();
    expect(targetHref('list', null)).toBeNull();
    // 대상 id가 없으면(지운 대상) 화면이 있는 종류여도 주소가 없다
    expect(targetHref('shop', null)).toBeNull();
    expect(targetHref('reservation', '')).toBeNull();
  });
});
