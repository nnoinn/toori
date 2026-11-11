// 주문 저장·정리 대상 읽기 (X-201, W11, W12 ②). 서버에서만 부른다.
// 결제 시작(startPayment)이 결제창을 열기 전에 결제 대기(pending) 주문을 남긴다. 결제 확인(W11 ②)과 웹훅(W13)이 이 주문으로 금액을 검증한다.

import 'server-only';

import { and, asc, eq, inArray, lt } from 'drizzle-orm';

import type { getDb } from '@/db';
import { orders } from '@/db/schema';
import { CHECKOUT_CONSENT_VERSIONS } from '@/server/policy';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'insert'>;

/** 포트원에 넘기는 우리 결제 번호. 포트원 규칙: 영문·숫자·-·_, 6~64자 */
export function newPaymentId(): string {
  return `toori-${crypto.randomUUID()}`;
}

export type NewPendingOrder = {
  paymentId: string;
  slotId: string;
  customerId: string;
  salePrice: number;
  /** 고른 쿠폰. 결제를 확정할 때 '사용됨'이 된다(#300). 안 쓰면 null이나 생략 */
  couponId?: string | null;
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

export type StaleOrder = {
  orderId: string;
  paymentId: string;
  amount: number;
  status: 'pending' | 'paid';
};

/**
 * 정리 작업이 볼 주문: 결제 대기(pending)와 취소를 끝내지 못한 결제 확인(paid) 중 createdBefore 전에 만든 것, 오래 안 본 순서로.
 * 결제 중인 주문을 건드리지 않도록 최근 주문은 고르지 않는다
 */
export async function readStaleOrders(
  db: Pick<Db, 'select'>,
  input: { createdBefore: Date; limit: number },
): Promise<StaleOrder[]> {
  const rows = await db
    .select({
      orderId: orders.id,
      paymentId: orders.paymentId,
      amount: orders.amount,
      status: orders.status,
    })
    .from(orders)
    .where(
      and(inArray(orders.status, ['pending', 'paid']), lt(orders.createdAt, input.createdBefore)),
    )
    .orderBy(asc(orders.updatedAt), asc(orders.createdAt))
    .limit(input.limit);
  return rows as StaleOrder[];
}

/** 이번에 결과를 정하지 못한 주문을 뒤로 보낸다. 그런 주문이 쌓여도 다음 실행은 안 본 주문부터 본다 */
export async function markOrderChecked(
  db: Pick<ReturnType<typeof getDb>, 'update'>,
  orderId: string,
  now: Date,
): Promise<void> {
  await db.update(orders).set({ updatedAt: now }).where(eq(orders.id, orderId));
}

/** 결제 번호로 주문을 읽는다(웹훅). 없으면 null */
export async function readOrderByPaymentId(db: Pick<Db, 'select'>, paymentId: string) {
  const [row] = await db
    .select({
      orderId: orders.id,
      paymentId: orders.paymentId,
      amount: orders.amount,
      status: orders.status,
      failureCode: orders.failureCode,
    })
    .from(orders)
    .where(eq(orders.paymentId, paymentId));
  return row ?? null;
}
