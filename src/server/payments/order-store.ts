// 주문 저장 (X-201, W11). 서버에서만 부른다.
// 결제 시작(startPayment)이 결제창을 열기 전에 결제 대기(pending) 주문을 남긴다. 결제 확인(W11 ②)과 웹훅(W13)이 이 주문으로 금액을 검증한다.

import 'server-only';

import type { getDb } from '@/db';
import { orders } from '@/db/schema';
import { CHECKOUT_CONSENT_VERSIONS } from '@/server/policy';

type Db = Pick<ReturnType<typeof getDb>, 'insert'>;

/** 포트원에 넘기는 우리 결제 번호. 포트원 규칙: 영문·숫자·-·_, 6~64자 */
export function newPaymentId(): string {
  return `toori-${crypto.randomUUID()}`;
}

export type NewPendingOrder = {
  paymentId: string;
  slotId: string;
  customerId: string;
  salePrice: number;
  couponAmount: number;
  /** 실제 결제액 = 판매가 − 쿠폰. 포트원 결제 검증 기준 */
  amount: number;
  /** 결제 버튼 위 필수 동의 2개(환불 규정, 예약자 정보 제공)를 받은 시각(서버 시각) */
  agreedAt: Date;
};

/** 결제 대기 주문 한 줄. 동의 2개의 문구 버전과 시각을 같이 남긴다(C-402, 10/28 결정) */
export async function createPendingOrder(db: Db, input: NewPendingOrder): Promise<string> {
  const { agreedAt, ...order } = input;
  const [row] = await db
    .insert(orders)
    .values({
      ...order,
      refundPolicyVersion: CHECKOUT_CONSENT_VERSIONS.refundPolicy,
      refundPolicyAgreedAt: agreedAt,
      bookerInfoVersion: CHECKOUT_CONSENT_VERSIONS.bookerInfo,
      bookerInfoAgreedAt: agreedAt,
      status: 'pending',
    })
    .returning({ id: orders.id });
  return row.id;
}
