// FLOW-05 이의제기 → 정산(docs/test-scenarios.md 16장): 이의제기 → 정산 보류 → 운영자 결론 → 보류 해제 → 목요일 정산에 들어간다.
// 회귀 테스트 ②(서버 흐름): 화면이 부르는 실제 서버 함수를 테스트 DB에서 차례로 부르고, 바깥 서비스와 시각만 가짜(./fakes.ts)로 바꾼다.
// 손님 예약까지는 FLOW-01과 같은 실제 결제 흐름이다(./booking.ts). 목요일 정산 묶기는 예약 작업이 부르는 함수를 바로 부른다.
// 기댓값은 규칙 문서의 숫자와 문장 그대로다.
// - 이의제기 접수 기한: CLAUDE.md 핵심 규칙(X-206) "서비스 시작 뒤 영업일 기준 48시간(토·일·공휴일 제외, 방문 처리가 시작보다
//   늦으면 그때부터)". 11/1(일) 16:30 방문 처리 → 11/4(수) 0시. 이의제기 중인 거래는 결론이 날 때까지 정산하지 않는다
// - 지급일: 매주 목요일(X-206). 결론이 나면 돌아오는 지급일에 들어간다(OPS-09와 같다)
// - 금액: docs/settlement-examples.md 3장 "10% 할인, 쿠폰 없음" 열(판매가 45,000원, 결제 수수료 3.0% 가정 → 원장님 정산 43,515원)

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';

import { getDb } from '@/db';
import { disputes, profiles, reservations, settlementItems, settlements } from '@/db/schema';
import { resolveDispute } from '@/server/disputes/admin';
import { submitDispute } from '@/server/disputes/dispute';
import { runSettlementBatch } from '@/server/settlements/batch';
import { getSettlementItems } from '@/server/settlements/get-settlement-items';
import { recordVisit } from '@/server/visits/record-visit';

import { createTestCustomer, createTestShop, createTestUser } from '../db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../db/test-db';
import { bookSlot } from './booking';
import { dataOf, flow, resetFlow, signIn } from './fakes';

vi.mock('@/db', async () => (await import('./fakes')).fakeDb);
vi.mock('@/lib/request-time', async () => (await import('./fakes')).fakeRequestTime);
vi.mock('@/server/supabase/server', async () => (await import('./fakes')).fakeSupabase);
vi.mock('next/headers', async () => (await import('./fakes')).fakeNextHeaders);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  ...(await import('./fakes')).fakeNextServer,
}));
vi.mock('@/server/payments/portone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/payments/portone')>()),
  ...(await import('./fakes')).fakePortOne,
}));
vi.mock('@/server/notifications/send-web-push', async () => (await import('./fakes')).fakeWebPush);

const kst = (dateTime: string) => new Date(`${dateTime}+09:00`);

/** 서비스는 11/1(일) 15:00~16:00. 게시는 시작 48시간 전(S-204), 손님은 10/31에 예약했다 */
const TIMES = {
  startAt: kst('2026-11-01T15:00:00'),
  endAt: kst('2026-11-01T16:00:00'),
  publishAt: kst('2026-10-30T15:00:00'),
  browseAt: kst('2026-10-31T10:00:00'),
  paidAt: kst('2026-10-31T10:05:00'),
};
/** 원장님이 방문 완료로 처리한 시각. 이의제기 접수 기한은 이때부터 영업일 48시간(11/4 0시) */
const VISIT_AT = kst('2026-11-01T16:30:00');
/** 손님이 앱에서 이의제기를 접수한 시각(기한 안) */
const DISPUTE_AT = kst('2026-11-02T10:00:00');
/** 첫 지급일 11/5(목) 새벽 정산 묶기 */
const FIRST_PAYOUT_RUN = kst('2026-11-05T00:30:00');
/** 운영자가 결론을 낸 시각 */
const RESOLVE_AT = kst('2026-11-06T14:00:00');
/** 다음 지급일 11/12(목) 새벽 정산 묶기 */
const NEXT_PAYOUT_RUN = kst('2026-11-12T00:30:00');
/** 결제 수수료 3.0% 가정(docs/settlement-examples.md, PG 계약 전 임시 숫자) */
const PAYMENT_FEE_RATE = 3;

/** 운영자 계정(운영자 입구로 로그인한다) */
async function createAdmin(tx: TestTx) {
  const userId = await createTestUser(tx);
  await tx.update(profiles).set({ isAdmin: true }).where(eq(profiles.id, userId));
  return userId;
}

describeDb('FLOW-05 이의제기 → 정산 (서버 흐름, 실제 DB)', () => {
  beforeEach(() => {
    resetFlow();
    // 결제 시작은 포트원 상점 값이 있어야 결제창 값을 돌려준다. 가짜 값이고 포트원은 부르지 않는다
    vi.stubEnv('NEXT_PUBLIC_PORTONE_STORE_ID', 'store-flow-test');
    vi.stubEnv('NEXT_PUBLIC_PORTONE_CHANNEL_KEY', 'channel-flow-test');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterAll(closeTestDb);

  it('방문 처리 → 이의제기 → 원장님 정산에 보류 → 목요일에 묶이지 않음 → 운영자 결론 → 다음 목요일 정산에 들어간다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      const shop = await createTestShop(tx, { status: 'approved' });
      const customer = await createTestCustomer(tx);
      const adminId = await createAdmin(tx);
      const booked = await bookSlot(tx, { shop, customer, ...TIMES });
      const { reservationId } = booked;
      const [{ orderId }] = await tx
        .select({ orderId: reservations.orderId })
        .from(reservations)
        .where(eq(reservations.id, reservationId));

      /** 원장님 정산 내역(S-502)에서 이 거래 한 줄 */
      const ownerSettlementRow = async () => {
        signIn(shop.createdBy, 'owner');
        const list = dataOf(
          await getSettlementItems({ shopId: shop.shopId, from: '2026-11-01', to: '2026-11-30' }),
        );
        return list.items.find((item) => item.reservationId === reservationId);
      };
      /** 이 거래의 정산 줄과 그 정산 묶음의 지급일 */
      const settled = () =>
        tx
          .select({
            kind: settlementItems.kind,
            baseAmount: settlementItems.baseAmount,
            feeAmount: settlementItems.feeAmount,
            paymentFee: settlementItems.paymentFee,
            paymentFeeVat: settlementItems.paymentFeeVat,
            payoutAmount: settlementItems.payoutAmount,
            payoutDate: settlements.periodEnd,
          })
          .from(settlementItems)
          .leftJoin(settlements, eq(settlements.id, settlementItems.settlementId))
          .where(eq(settlementItems.orderId, orderId));

      // 1. 서비스가 끝나고 원장님이 방문 완료로 처리한다
      flow.now = VISIT_AT;
      signIn(shop.createdBy, 'owner');
      dataOf(await recordVisit({ reservationId, result: 'visited' }));

      // 2. 손님이 내 예약 상세에서 이의제기를 접수한다(기한 11/4 0시 안)
      flow.now = DISPUTE_AT;
      signIn(customer.userId, 'customer');
      const filed = dataOf(
        await submitDispute({
          reservationId,
          type: 'after_start',
          content: '시술 중에 약속한 디자인과 다르게 진행됐어요',
        }),
      );

      // 3. 원장님 정산 내역에는 이의제기로 보류된 거래로 보이고, 지급일이 없다
      expect(await ownerSettlementRow()).toMatchObject({
        status: 'held',
        hold: { reason: 'dispute', receivedAt: DISPUTE_AT.toISOString() },
        payoutDate: null,
      });

      // 4. 11/5(목) 정산 묶기: 접수 기한은 지났지만 이의제기 중이라 묶지 않는다
      flow.now = FIRST_PAYOUT_RUN;
      expect(
        await runSettlementBatch(getDb(), { now: flow.now, paymentFeeRate: PAYMENT_FEE_RATE }),
      ).toMatchObject({ status: 'done', payoutDate: '2026-11-05' });
      expect(await settled()).toEqual([]);

      // 5. 운영자가 결론(바꾸지 않음)을 기록하면 보류가 풀리고, 원장님 정산 내역에는 돌아오는 지급일(11/12)이 보인다
      flow.now = RESOLVE_AT;
      signIn(adminId, 'admin');
      expect(
        dataOf(
          await resolveDispute({
            disputeId: filed.disputeId,
            outcome: 'no_change',
            memo: '원장님과 손님 이야기를 들어 보니 약속한 시술과 같았어요',
          }),
        ),
      ).toEqual({
        disputeId: filed.disputeId,
        outcome: 'no_change',
        handledAt: RESOLVE_AT.toISOString(),
      });
      const [dispute] = await tx
        .select({ status: disputes.status, outcome: disputes.outcome })
        .from(disputes)
        .where(eq(disputes.id, filed.disputeId));
      expect(dispute).toEqual({ status: 'resolved', outcome: 'no_change' });
      expect(await ownerSettlementRow()).toMatchObject({
        status: 'scheduled',
        hold: null,
        payoutDate: '2026-11-12',
      });

      // 6. 11/12(목) 정산 묶기: 이제 묶인다. 판매가 45,000원 − 결제 수수료 1,350원 − VAT 135원 = 43,515원
      flow.now = NEXT_PAYOUT_RUN;
      expect(
        await runSettlementBatch(getDb(), { now: flow.now, paymentFeeRate: PAYMENT_FEE_RATE }),
      ).toMatchObject({ status: 'done', payoutDate: '2026-11-12' });
      expect(await settled()).toEqual([
        {
          kind: 'sale',
          baseAmount: 45000,
          feeAmount: 0,
          paymentFee: 1350,
          paymentFeeVat: 135,
          payoutAmount: 43515,
          payoutDate: '2026-11-12',
        },
      ]);

      // 7. 원장님 정산 내역에는 11/12에 묶인(지급 요청 전) 거래로 보인다
      expect(await ownerSettlementRow()).toMatchObject({
        status: 'pending',
        hold: null,
        payoutDate: '2026-11-12',
      });
    });
  });
});
