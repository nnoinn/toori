import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getMyReservationDetail,
  type MyReservationDetail,
} from '@/app/(customer)/(tabs)/reservations/queries';
import { fail, ok } from '@/lib/result';

import { loadCompletedReservation } from './actions';

// 조회(본인 예약만, X-102)는 내 예약 상세의 함수를 흉내 낸다. 그 함수는 queries.db.test.ts에서 본다.
// 여기서는 "예약 완료 화면에 필요한 값만 돌려주는지(샵 전화번호·예약번호·환불 등은 빼고)"를 본다
vi.mock('@/app/(customer)/(tabs)/reservations/queries', () => ({
  getMyReservationDetail: vi.fn(),
}));

const detailMock = vi.mocked(getMyReservationDetail);

const DETAIL: MyReservationDetail = {
  reservationId: 'reservation-1',
  code: 'AXLPLPSG',
  shopName: '샘플 헤어',
  menuName: '여성 커트',
  startAt: '2026-11-07T02:00:00.000Z',
  amount: 17_000,
  noShow: false,
  cancelledAt: null,
  status: 'confirmed',
  shop: {
    shopId: 'shop-1',
    name: '샘플 헤어',
    roadAddress: '경기 안산시 단원구 샘플로 1',
    addressDetail: '1층',
    phone: '031-000-0001',
    lat: 37.3,
    lng: 126.8,
  },
  durationMinutes: 60,
  payment: { salePrice: 20_000, couponAmount: 3_000, amount: 17_000, paidAt: null },
  refund: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  detailMock.mockResolvedValue(ok(DETAIL));
});

describe('loadCompletedReservation', () => {
  it('예약 완료 화면에 필요한 값만 돌려준다. 결제 금액은 쿠폰을 뺀 실제 결제액이다', async () => {
    expect(await loadCompletedReservation('reservation-1')).toEqual(
      ok({
        menuName: '여성 커트',
        startAt: '2026-11-07T02:00:00.000Z',
        durationMinutes: 60,
        amount: 17_000,
        shop: {
          shopId: 'shop-1',
          name: '샘플 헤어',
          roadAddress: '경기 안산시 단원구 샘플로 1',
          addressDetail: '1층',
          lat: 37.3,
          lng: 126.8,
        },
      }),
    );
    expect(detailMock).toHaveBeenCalledWith('reservation-1');
  });

  it('본인 예약이 아니거나 없으면(조회 실패) 그 이유를 그대로 돌려준다', async () => {
    detailMock.mockResolvedValueOnce(fail('NOT_FOUND', '예약을 찾을 수 없어요'));
    const result = await loadCompletedReservation('reservation-2');
    expect(!result.ok && result.error.code).toBe('NOT_FOUND');
  });
});
