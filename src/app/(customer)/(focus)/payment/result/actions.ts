'use server';

// 예약 완료 화면의 예약 내용 (J11, C-405). 결제 확인(confirmPayment)이 예약을 확정한 뒤 결과 화면이 부른다.
// 조회는 내 예약 상세(J12)와 같은 것을 쓴다(본인 예약만, X-102). 화면에 필요한 값만 돌려준다.

import { getMyReservationDetail } from '@/app/(customer)/(tabs)/reservations/queries';
import { ok, type Result } from '@/lib/result';

export type CompletedReservation = {
  menuName: string;
  /** ISO */
  startAt: string;
  durationMinutes: number;
  /** 실제 결제액 */
  amount: number;
  shop: {
    shopId: string;
    name: string;
    roadAddress: string;
    addressDetail: string | null;
    lat: number;
    lng: number;
  };
};

export async function loadCompletedReservation(
  reservationId: string,
): Promise<Result<CompletedReservation>> {
  const result = await getMyReservationDetail(reservationId);
  if (!result.ok) return result;
  const { menuName, startAt, durationMinutes, payment, shop } = result.data;
  return ok({
    menuName,
    startAt,
    durationMinutes,
    amount: payment.amount,
    shop: {
      shopId: shop.shopId,
      name: shop.name,
      roadAddress: shop.roadAddress,
      addressDetail: shop.addressDetail,
      lat: shop.lat,
      lng: shop.lng,
    },
  });
}
