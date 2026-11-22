// 서버 흐름 테스트(회귀 테스트 ②)의 공통 단계. 여러 흐름이 "손님이 예약한 뒤"에서 시작해서, 예약까지는 FLOW-01과 같은
// 실제 결제 흐름(10분 홀딩 → 결제 대기 주문 → 결제창 결제 → 결제 확인)으로 만든다. 이 파일을 쓰는 테스트 파일은
// FLOW-01처럼 맨 위에서 vi.mock으로 '@/db'·로그인·포트원·푸시 등을 ./fakes.ts의 가짜로 바꿔 둔다.

import { eq } from 'drizzle-orm';

import { customers, pushSubscriptions, slots } from '@/db/schema';
import { confirmPayment, holdSlot, startPayment } from '@/server/payments/checkout';

import { type TestShop, testSlot } from '../db/fixtures';
import type { TestTx } from '../db/test-db';
import { dataOf, flow, paidOnPortOne, runAfterTasks, signIn } from './fakes';

/** 이 계정으로 기기 하나에서 푸시 알림을 켠다. 기기 주소(endpoint)를 돌려준다 */
export async function enablePush(
  tx: TestTx,
  userId: string,
  accountType: 'customer' | 'owner',
): Promise<string> {
  const endpoint = `https://push.test/${crypto.randomUUID()}`;
  await tx.insert(pushSubscriptions).values({
    userId,
    accountType,
    endpoint,
    p256dh: 'test-p256dh',
    auth: 'test-auth',
  });
  return endpoint;
}

/** 예약된 매물 */
export type BookedSlot = {
  slotId: string;
  reservationId: string;
  reservationCode: string;
  /** 포트원 결제 번호 */
  paymentId: string;
};

/**
 * 손님이 매물(정가 50,000원 10% 할인, 판매가 45,000원, 쿠폰 없음)을 실제 결제 흐름으로 예약한다.
 * 매물은 게시중이고 시작·끝·게시 시각은 받은 대로다. 손님은 browseAt에 [예약하기]를 누르고 paidAt에 결제를 마친다(10분 안).
 * 끝나면 고객 계정으로 로그인한 상태이고, 예약 확정 알림은 이미 보내고 비워 둔다(flow.pushes가 빈 채로 다음 단계를 본다)
 */
export async function bookSlot(
  tx: TestTx,
  input: {
    shop: TestShop;
    customer: { userId: string; customerId: string };
    startAt: Date;
    endAt: Date;
    publishAt: Date;
    browseAt: Date;
    paidAt: Date;
  },
): Promise<BookedSlot> {
  // 결제 대기 주문을 만들려면 휴대폰 번호가 있어야 한다(예약자 정보)
  await tx
    .update(customers)
    .set({ phone: '010-0000-0000' })
    .where(eq(customers.id, input.customer.customerId));
  const [slot] = await tx
    .insert(slots)
    .values(
      testSlot(input.shop, '15:00', '16:00', {
        startAt: input.startAt,
        endAt: input.endAt,
        publishAt: input.publishAt,
        listPrice: 50000,
        discountRate: 10,
        salePrice: 45000,
      }),
    )
    .returning({ id: slots.id });

  flow.now = input.browseAt;
  signIn(input.customer.userId, 'customer');
  dataOf(await holdSlot(slot.id));
  const request = dataOf(
    await startPayment({ slotId: slot.id, refundPolicyAgreed: true, bookerInfoAgreed: true }),
  );
  flow.now = input.paidAt;
  paidOnPortOne(request.paymentId, 45000, input.paidAt);
  const confirmed = dataOf(await confirmPayment({ paymentId: request.paymentId }));
  await runAfterTasks();
  flow.pushes = [];
  return {
    slotId: slot.id,
    reservationId: confirmed.reservationId,
    reservationCode: confirmed.reservationCode,
    paymentId: request.paymentId,
  };
}
