// 계정 이력(#374) DB 읽기. 서버에서만 부른다. 순서와 권한은 history.ts, 한 쪽 자르기는 history-page.ts.
// 새 표 없이 지금 시각과 함께 남는 기록을 기록마다 최신 순으로 limit + 1개씩 읽는다(합쳐서 자르면 맞는 limit개가 된다).
// from을 주면 그 시각 이후만 읽는다(자르는 시각의 일을 다시 읽을 때, history-page.ts).
// 시각(Date)은 sql`` 안에 직접 넣지 않고 lt처럼 칸을 거쳐 넘긴다(postgres-js가 Date를 받지 않는다, #346).
// 손님이 시간대 안에서 만든 칸(window_id 있음)은 원장님이 올린 매물이 아니라서 매물 이력에 넣지 않는다(ownerListedSlot과 같은 기준).

import 'server-only';

import {
  and,
  type AnyColumn,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { getDb } from '@/db';
import {
  adminActions,
  agreedCancelRequests,
  coupons,
  customers,
  disputes,
  orders,
  owners,
  payoutAccountChanges,
  refunds,
  reservations,
  settlements,
  shops,
  slots,
  slotWindows,
  termsAgreements,
} from '@/db/schema';
import { hoursUntil } from '@/lib/time';

import type { AccountHistoryEvent, AccountHistoryKind } from './history-types';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

/** 고객 취소·합의 후 취소의 끝난 환불(위약금 비율을 읽는다) */
const cancelRefund = alias(refunds, 'cancel_refund');

const EMPTY: Omit<AccountHistoryEvent, 'key' | 'at' | 'kind'> = {
  reservationId: null,
  reservationCode: null,
  menuName: null,
  startAt: null,
  amount: null,
  rate: null,
  hoursBeforeStart: null,
  reason: null,
  result: null,
};

type EventFields = Partial<Omit<AccountHistoryEvent, 'key' | 'at' | 'kind' | 'startAt'>> & {
  startAt?: Date | null;
};

function makeEvent(
  kind: AccountHistoryKind,
  id: string,
  at: Date,
  fields: EventFields = {},
): AccountHistoryEvent {
  const { startAt, ...rest } = fields;
  return {
    ...EMPTY,
    ...rest,
    startAt: startAt ? startAt.toISOString() : null,
    key: `${kind}:${id}`,
    at: at.toISOString(),
    kind,
  };
}

/** 서비스 시작 몇 시간 전에 취소했는지(버림). 시작 뒤에 취소했으면 null */
function hoursBefore(startAt: Date, cancelledAt: Date): number | null {
  const hours = hoursUntil(startAt, cancelledAt);
  return hours >= 0 ? Math.floor(hours) : null;
}

/** before보다 앞서고 from(있으면, 포함) 이후인 일을 기록마다 take개까지 */
type Range = { before: Date | null; from: Date | null; take: number };

/** 읽는 범위. 받은 limit보다 하나 더 읽어서 더 있는지 안다 */
const toRange = (input: { before: Date | null; from?: Date | null; limit: number }): Range => ({
  before: input.before,
  from: input.from ?? null,
  take: input.limit + 1,
});

const within = (column: AnyColumn, range: Range) =>
  and(
    range.before ? lt(column, range.before) : undefined,
    range.from ? gte(column, range.from) : undefined,
  );

/** 원장님 계정 id로 샵 id. 없으면 null */
export async function readOwnerShopId(db: Db, ownerId: string): Promise<string | null> {
  const [row] = await db
    .select({ shopId: shops.id })
    .from(shops)
    .innerJoin(owners, eq(owners.id, shops.ownerId))
    .where(eq(owners.id, ownerId))
    .limit(1);
  return row?.shopId ?? null;
}

/** 고객 계정 id로 로그인 정보 id. 없으면 null */
export async function readCustomerUserId(db: Db, customerId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: customers.userId })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return row?.userId ?? null;
}

/** 원장님(그 샵) 이력. 기록마다 최신 순 limit + 1개씩 */
export async function readOwnerHistory(
  db: Db,
  input: { shopId: string; before: Date | null; from?: Date | null; limit: number; now: Date },
): Promise<AccountHistoryEvent[][]> {
  const { shopId, now } = input;
  const range = toRange(input);
  const shopSlot = and(eq(slots.shopId, shopId), isNull(slots.windowId));

  return Promise.all([
    // 입점 신청
    db
      .select({ id: shops.id, at: shops.appliedAt })
      .from(shops)
      .where(and(eq(shops.id, shopId), within(shops.appliedAt, range)))
      .then((rows) => rows.map((row) => makeEvent('shop_applied', row.id, row.at))),
    // 입점 승인·반려(운영자 처리 기록, 반려 메모 포함)
    db
      .select({
        id: adminActions.id,
        at: adminActions.createdAt,
        action: adminActions.action,
        memo: adminActions.memo,
      })
      .from(adminActions)
      .where(
        and(
          eq(adminActions.targetType, 'shop'),
          eq(adminActions.targetId, shopId),
          inArray(adminActions.action, ['shop.approve', 'shop.reject']),
          within(adminActions.createdAt, range),
        ),
      )
      .orderBy(desc(adminActions.createdAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent(
            row.action === 'shop.approve' ? 'shop_approved' : 'shop_rejected',
            row.id,
            row.at,
            {
              reason: row.memo,
            },
          ),
        ),
      ),
    // 매물 등록·재등록
    db
      .select({
        id: slots.id,
        at: slots.createdAt,
        menuName: slots.menuName,
        startAt: slots.startAt,
        salePrice: slots.salePrice,
        relistedFrom: slots.relistedFromSlotId,
      })
      .from(slots)
      .where(and(shopSlot, within(slots.createdAt, range)))
      .orderBy(desc(slots.createdAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent(row.relistedFrom ? 'slot_relisted' : 'slot_created', row.id, row.at, {
            menuName: row.menuName,
            startAt: row.startAt,
            amount: row.salePrice,
          }),
        ),
      ),
    // 미리 올린 매물의 게시(게시 시각이 등록보다 늦고 이미 지났으며, 그 전에 마감하지 않은 것)
    db
      .select({
        id: slots.id,
        at: slots.publishAt,
        menuName: slots.menuName,
        startAt: slots.startAt,
      })
      .from(slots)
      .where(
        and(
          shopSlot,
          lte(slots.publishAt, now),
          sql`${slots.publishAt} > ${slots.createdAt} + interval '1 minute'`,
          or(isNull(slots.closedAt), gt(slots.closedAt, slots.publishAt)),
          within(slots.publishAt, range),
        ),
      )
      .orderBy(desc(slots.publishAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('slot_published', row.id, row.at, {
            menuName: row.menuName,
            startAt: row.startAt,
          }),
        ),
      ),
    // 매물 마감(사유)
    db
      .select({
        id: slots.id,
        at: slots.closedAt,
        menuName: slots.menuName,
        startAt: slots.startAt,
        reason: slots.closeReason,
      })
      .from(slots)
      .where(and(shopSlot, isNotNull(slots.closedAt), within(slots.closedAt, range)))
      .orderBy(desc(slots.closedAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('slot_closed', row.id, row.at as Date, {
            menuName: row.menuName,
            startAt: row.startAt,
            reason: row.reason,
          }),
        ),
      ),
    // 시간대 등록
    db
      .select({ id: slotWindows.id, at: slotWindows.createdAt, startAt: slotWindows.startAt })
      .from(slotWindows)
      .where(and(eq(slotWindows.shopId, shopId), within(slotWindows.createdAt, range)))
      .orderBy(desc(slotWindows.createdAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) => makeEvent('window_created', row.id, row.at, { startAt: row.startAt })),
      ),
    // 시간대 마감(사유)
    db
      .select({
        id: slotWindows.id,
        at: slotWindows.closedAt,
        startAt: slotWindows.startAt,
        reason: slotWindows.closeReason,
      })
      .from(slotWindows)
      .where(
        and(
          eq(slotWindows.shopId, shopId),
          isNotNull(slotWindows.closedAt),
          within(slotWindows.closedAt, range),
        ),
      )
      .orderBy(desc(slotWindows.closedAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('window_closed', row.id, row.at as Date, {
            startAt: row.startAt,
            reason: row.reason,
          }),
        ),
      ),
    // 새 예약(판매가)
    db
      .select({
        id: reservations.id,
        at: reservations.createdAt,
        code: reservations.code,
        menuName: slots.menuName,
        startAt: slots.startAt,
        salePrice: slots.salePrice,
      })
      .from(reservations)
      .innerJoin(slots, eq(slots.id, reservations.slotId))
      .where(and(eq(slots.shopId, shopId), within(reservations.createdAt, range)))
      .orderBy(desc(reservations.createdAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('reservation_created', row.id, row.at, {
            reservationId: row.id,
            reservationCode: row.code,
            menuName: row.menuName,
            startAt: row.startAt,
            amount: row.salePrice,
          }),
        ),
      ),
    readCancelled(db, eq(slots.shopId, shopId), range),
    ...readAgreedCancel(db, eq(slots.shopId, shopId), range),
    // 방문·노쇼 처리
    db
      .select({
        id: reservations.id,
        at: reservations.visitRecordedAt,
        code: reservations.code,
        menuName: slots.menuName,
        startAt: slots.startAt,
        result: reservations.visitResult,
      })
      .from(reservations)
      .innerJoin(slots, eq(slots.id, reservations.slotId))
      .where(
        and(
          eq(slots.shopId, shopId),
          isNotNull(reservations.visitRecordedAt),
          within(reservations.visitRecordedAt, range),
        ),
      )
      .orderBy(desc(reservations.visitRecordedAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('visit_recorded', row.id, row.at as Date, {
            reservationId: row.id,
            reservationCode: row.code,
            menuName: row.menuName,
            startAt: row.startAt,
            result: row.result,
          }),
        ),
      ),
    // 정산 계좌 변경(은행)
    db
      .select({
        id: payoutAccountChanges.id,
        at: payoutAccountChanges.createdAt,
        bankCode: payoutAccountChanges.bankCode,
      })
      .from(payoutAccountChanges)
      .where(
        and(eq(payoutAccountChanges.shopId, shopId), within(payoutAccountChanges.createdAt, range)),
      )
      .orderBy(desc(payoutAccountChanges.createdAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('payout_account_changed', row.id, row.at, { reason: row.bankCode }),
        ),
      ),
    // 정산 지급(0원 정산 포함)
    db
      .select({ id: settlements.id, at: settlements.paidAt, amount: settlements.payoutAmount })
      .from(settlements)
      .where(
        and(
          eq(settlements.shopId, shopId),
          isNotNull(settlements.paidAt),
          within(settlements.paidAt, range),
        ),
      )
      .orderBy(desc(settlements.paidAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('settlement_paid', row.id, row.at as Date, { amount: row.amount }),
        ),
      ),
  ]);
}

/** 고객 이력. 기록마다 최신 순 limit + 1개씩 */
export async function readCustomerHistory(
  db: Db,
  input: {
    customerId: string;
    userId: string;
    before: Date | null;
    from?: Date | null;
    limit: number;
  },
): Promise<AccountHistoryEvent[][]> {
  const { customerId, userId } = input;
  const range = toRange(input);
  const mine = eq(reservations.customerId, customerId);

  return Promise.all([
    // 가입
    db
      .select({ id: customers.id, at: customers.createdAt })
      .from(customers)
      .where(and(eq(customers.id, customerId), within(customers.createdAt, range)))
      .then((rows) => rows.map((row) => makeEvent('signed_up', row.id, row.at))),
    // 예약(결제액)
    db
      .select({
        id: reservations.id,
        at: reservations.createdAt,
        code: reservations.code,
        menuName: slots.menuName,
        startAt: slots.startAt,
        amount: orders.amount,
      })
      .from(reservations)
      .innerJoin(slots, eq(slots.id, reservations.slotId))
      .innerJoin(orders, eq(orders.id, reservations.orderId))
      .where(and(mine, within(reservations.createdAt, range)))
      .orderBy(desc(reservations.createdAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('reservation_created', row.id, row.at, {
            reservationId: row.id,
            reservationCode: row.code,
            menuName: row.menuName,
            startAt: row.startAt,
            amount: row.amount,
          }),
        ),
      ),
    readCancelled(db, mine, range),
    // 환불(끝난 것, 환불액과 사유)
    db
      .select({
        id: refunds.id,
        at: refunds.processedAt,
        amount: refunds.refundAmount,
        reason: refunds.reason,
        reservationId: reservations.id,
        code: reservations.code,
        menuName: slots.menuName,
        startAt: slots.startAt,
      })
      .from(refunds)
      .innerJoin(orders, eq(orders.id, refunds.orderId))
      .leftJoin(reservations, eq(reservations.id, refunds.reservationId))
      .leftJoin(slots, eq(slots.id, orders.slotId))
      .where(
        and(
          eq(orders.customerId, customerId),
          eq(refunds.status, 'done'),
          isNotNull(refunds.processedAt),
          within(refunds.processedAt, range),
        ),
      )
      .orderBy(desc(refunds.processedAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('refund_done', row.id, row.at as Date, {
            reservationId: row.reservationId,
            reservationCode: row.code,
            menuName: row.menuName,
            startAt: row.startAt,
            amount: row.amount,
            reason: row.reason,
          }),
        ),
      ),
    ...readAgreedCancel(db, mine, range),
    // 쿠폰 받음
    db
      .select({
        id: coupons.id,
        at: coupons.issuedAt,
        amount: coupons.amount,
        reason: coupons.reason,
      })
      .from(coupons)
      .where(and(eq(coupons.customerId, customerId), within(coupons.issuedAt, range)))
      .orderBy(desc(coupons.issuedAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('coupon_issued', row.id, row.at, { amount: row.amount, reason: row.reason }),
        ),
      ),
    // 쿠폰 사용
    db
      .select({ id: coupons.id, at: coupons.usedAt, amount: coupons.amount })
      .from(coupons)
      .where(
        and(
          eq(coupons.customerId, customerId),
          isNotNull(coupons.usedAt),
          within(coupons.usedAt, range),
        ),
      )
      .orderBy(desc(coupons.usedAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) => makeEvent('coupon_used', row.id, row.at as Date, { amount: row.amount })),
      ),
    // 이의제기 접수(종류)
    db
      .select({
        id: disputes.id,
        at: disputes.receivedAt,
        type: disputes.type,
        reservationId: reservations.id,
        code: reservations.code,
      })
      .from(disputes)
      .innerJoin(reservations, eq(reservations.id, disputes.reservationId))
      .where(and(mine, within(disputes.receivedAt, range)))
      .orderBy(desc(disputes.receivedAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('dispute_filed', row.id, row.at, {
            reservationId: row.reservationId,
            reservationCode: row.code,
            reason: row.type,
          }),
        ),
      ),
    // 이의제기 결론
    db
      .select({
        id: disputes.id,
        at: disputes.handledAt,
        outcome: disputes.outcome,
        reservationId: reservations.id,
        code: reservations.code,
      })
      .from(disputes)
      .innerJoin(reservations, eq(reservations.id, disputes.reservationId))
      .where(and(mine, isNotNull(disputes.handledAt), within(disputes.handledAt, range)))
      .orderBy(desc(disputes.handledAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('dispute_resolved', row.id, row.at as Date, {
            reservationId: row.reservationId,
            reservationCode: row.code,
            result: row.outcome,
          }),
        ),
      ),
    // 광고성 정보·관심 동네 알림 동의
    db
      .select({
        id: termsAgreements.id,
        at: termsAgreements.agreedAt,
        type: termsAgreements.termsType,
      })
      .from(termsAgreements)
      .where(and(consentOf(userId), within(termsAgreements.agreedAt, range)))
      .orderBy(desc(termsAgreements.agreedAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) => makeEvent('consent_agreed', row.id, row.at, { reason: row.type })),
      ),
    // 동의 철회
    db
      .select({
        id: termsAgreements.id,
        at: termsAgreements.withdrawnAt,
        type: termsAgreements.termsType,
      })
      .from(termsAgreements)
      .where(
        and(
          consentOf(userId),
          isNotNull(termsAgreements.withdrawnAt),
          within(termsAgreements.withdrawnAt, range),
        ),
      )
      .orderBy(desc(termsAgreements.withdrawnAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('consent_withdrawn', row.id, row.at as Date, { reason: row.type }),
        ),
      ),
  ]);
}

/** 고객 계정의 선택 동의(광고성 정보, 관심 동네·찜한 샵 새 매물 알림) */
function consentOf(userId: string) {
  return and(
    eq(termsAgreements.userId, userId),
    eq(termsAgreements.accountType, 'customer'),
    inArray(termsAgreements.termsType, ['marketing', 'interest_alert']),
  );
}

/** 예약 취소(누가 취소했는지, 위약금 비율, 시작 몇 시간 전). where는 샵이나 고객 조건 */
function readCancelled(db: Db, where: SQL, range: Range): Promise<AccountHistoryEvent[]> {
  return db
    .select({
      id: reservations.id,
      at: reservations.cancelledAt,
      actor: reservations.cancelActor,
      code: reservations.code,
      menuName: slots.menuName,
      startAt: slots.startAt,
      rate: cancelRefund.penaltyRate,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .leftJoin(
      cancelRefund,
      and(
        eq(cancelRefund.reservationId, reservations.id),
        inArray(cancelRefund.reason, ['customer_cancel', 'agreed_cancel']),
        eq(cancelRefund.status, 'done'),
      ),
    )
    .where(and(where, isNotNull(reservations.cancelledAt), within(reservations.cancelledAt, range)))
    .orderBy(desc(reservations.cancelledAt))
    .limit(range.take)
    .then((rows) =>
      rows.map((row) => {
        const at = row.at as Date;
        return makeEvent('reservation_cancelled', row.id, at, {
          reservationId: row.id,
          reservationCode: row.code,
          menuName: row.menuName,
          startAt: row.startAt,
          rate: row.rate,
          hoursBeforeStart: hoursBefore(row.startAt, at),
          reason: row.actor,
        });
      }),
    );
}

/** 합의 후 취소 요청과 결과(동의·거절·만료·끝남). where는 샵이나 고객 조건 */
function readAgreedCancel(
  db: Db,
  where: SQL,
  range: Range,
): [Promise<AccountHistoryEvent[]>, Promise<AccountHistoryEvent[]>] {
  const base = () =>
    db
      .select({
        id: agreedCancelRequests.id,
        requestedAt: agreedCancelRequests.requestedAt,
        respondedAt: agreedCancelRequests.respondedAt,
        status: agreedCancelRequests.status,
        reason: agreedCancelRequests.reason,
        reservationId: reservations.id,
        code: reservations.code,
        menuName: slots.menuName,
        startAt: slots.startAt,
      })
      .from(agreedCancelRequests)
      .innerJoin(reservations, eq(reservations.id, agreedCancelRequests.reservationId))
      .innerJoin(slots, eq(slots.id, reservations.slotId));
  const reservationOf = (row: {
    reservationId: string;
    code: string;
    menuName: string;
    startAt: Date;
  }) => ({
    reservationId: row.reservationId,
    reservationCode: row.code,
    menuName: row.menuName,
    startAt: row.startAt,
  });
  return [
    base()
      .where(and(where, within(agreedCancelRequests.requestedAt, range)))
      .orderBy(desc(agreedCancelRequests.requestedAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('agreed_cancel_requested', row.id, row.requestedAt, {
            ...reservationOf(row),
            reason: row.reason,
          }),
        ),
      ),
    base()
      .where(
        and(
          where,
          isNotNull(agreedCancelRequests.respondedAt),
          within(agreedCancelRequests.respondedAt, range),
        ),
      )
      .orderBy(desc(agreedCancelRequests.respondedAt))
      .limit(range.take)
      .then((rows) =>
        rows.map((row) =>
          makeEvent('agreed_cancel_resolved', row.id, row.respondedAt as Date, {
            ...reservationOf(row),
            result: row.status,
          }),
        ),
      ),
  ];
}
