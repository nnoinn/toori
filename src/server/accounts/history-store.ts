// 계정 이력(#374) DB 읽기. 서버에서만 부른다. 순서와 권한은 history.ts, 쪽 자르기는 history-page.ts.
// 새 표 없이 지금 시각과 함께 남는 기록을 기록마다 따로 읽는다. 기록마다 조건(기간·종류)에 맞는 전체 수를 같이 세고
// (count(*) over ()), 1/1000초 단위 시각이 늦은 순·같으면 id 순으로 take개까지 읽는다(합쳐서 자르면 맞는 쪽이 된다).
// 고른 종류에 들지 않는 기록은 읽지 않는다. 기간은 from 이후(포함), before 전이다.
// 시각(Date)은 sql`` 안에 직접 넣지 않고 lt처럼 칸을 거쳐 넘긴다(postgres-js가 Date를 받지 않는다, #346).
// 손님이 시간대 안에서 만든 칸(window_id 있음)은 원장님이 올린 매물이 아니라서 매물 이력에 넣지 않는다(ownerListedSlot과 같은 기준).

import 'server-only';

import {
  and,
  type AnyColumn,
  asc,
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

import type { HistoryList } from './history-page';
import type { AccountHistoryEvent, AccountHistoryKind } from './history-types';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

/** 기록마다 읽는 범위: from 이후(포함)·before 전, 고른 종류(null이면 전부), 기록마다 읽을 줄 수 */
export type HistoryReadRange = {
  from: Date | null;
  before: Date | null;
  kinds: readonly AccountHistoryKind[] | null;
  take: number;
};

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

const within = (column: AnyColumn, range: HistoryReadRange) =>
  and(
    range.before ? lt(column, range.before) : undefined,
    range.from ? gte(column, range.from) : undefined,
  );

/** 이 기록에서 나오는 일 중 하나라도 고른 종류에 들면 읽는다 */
const wants = (range: HistoryReadRange, ...kinds: AccountHistoryKind[]) =>
  range.kinds === null || kinds.some((kind) => range.kinds?.includes(kind));

const none = (): Promise<HistoryList> => Promise.resolve({ events: [], total: 0 });

/** 조건에 맞는 전체 수. LIMIT 전에 센다 */
const totalCount = () => sql<number>`count(*) over ()`.mapWith(Number);

/** 1/1000초 단위 시각이 늦은 순, 같으면 id 순(history-page의 줄 세우기와 같다. 화면에 오는 시각도 1/1000초까지다) */
const newestFirst = (time: AnyColumn, id: AnyColumn) => [
  desc(sql`date_trunc('milliseconds', ${time})`),
  asc(id),
];

function toList<Row extends { total: number }>(
  rows: Row[],
  map: (row: Row) => AccountHistoryEvent,
): HistoryList {
  return { events: rows.map(map), total: rows[0]?.total ?? 0 };
}

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

/** 원장님(그 샵) 이력. 기록마다 최신 순 take개와 전체 수 */
export async function readOwnerHistory(
  db: Db,
  input: HistoryReadRange & { shopId: string; now: Date },
): Promise<HistoryList[]> {
  const { shopId, now, ...range } = input;
  const shopSlot = and(eq(slots.shopId, shopId), isNull(slots.windowId));

  return Promise.all([
    // 입점 신청(샵마다 한 번)
    wants(range, 'shop_applied')
      ? db
          .select({ id: shops.id, at: shops.appliedAt })
          .from(shops)
          .where(and(eq(shops.id, shopId), within(shops.appliedAt, range)))
          .then((rows) => ({
            events: rows.map((row) => makeEvent('shop_applied', row.id, row.at)),
            total: rows.length,
          }))
      : none(),
    // 입점 승인·반려(운영자 처리 기록, 반려 메모 포함)
    wants(range, 'shop_approved', 'shop_rejected')
      ? db
          .select({
            id: adminActions.id,
            at: adminActions.createdAt,
            action: adminActions.action,
            memo: adminActions.memo,
            total: totalCount(),
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
          .orderBy(...newestFirst(adminActions.createdAt, adminActions.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent(
                row.action === 'shop.approve' ? 'shop_approved' : 'shop_rejected',
                row.id,
                row.at,
                { reason: row.memo },
              ),
            ),
          )
      : none(),
    // 매물 등록·재등록
    wants(range, 'slot_created', 'slot_relisted')
      ? db
          .select({
            id: slots.id,
            at: slots.createdAt,
            menuName: slots.menuName,
            startAt: slots.startAt,
            salePrice: slots.salePrice,
            relistedFrom: slots.relistedFromSlotId,
            total: totalCount(),
          })
          .from(slots)
          .where(and(shopSlot, within(slots.createdAt, range)))
          .orderBy(...newestFirst(slots.createdAt, slots.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent(row.relistedFrom ? 'slot_relisted' : 'slot_created', row.id, row.at, {
                menuName: row.menuName,
                startAt: row.startAt,
                amount: row.salePrice,
              }),
            ),
          )
      : none(),
    // 미리 올린 매물의 게시(게시 시각이 등록보다 늦고 이미 지났으며, 그 전에 마감하지 않은 것)
    wants(range, 'slot_published')
      ? db
          .select({
            id: slots.id,
            at: slots.publishAt,
            menuName: slots.menuName,
            startAt: slots.startAt,
            total: totalCount(),
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
          .orderBy(...newestFirst(slots.publishAt, slots.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('slot_published', row.id, row.at, {
                menuName: row.menuName,
                startAt: row.startAt,
              }),
            ),
          )
      : none(),
    // 매물 마감(사유)
    wants(range, 'slot_closed')
      ? db
          .select({
            id: slots.id,
            at: slots.closedAt,
            menuName: slots.menuName,
            startAt: slots.startAt,
            reason: slots.closeReason,
            total: totalCount(),
          })
          .from(slots)
          .where(and(shopSlot, isNotNull(slots.closedAt), within(slots.closedAt, range)))
          .orderBy(...newestFirst(slots.closedAt, slots.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('slot_closed', row.id, row.at as Date, {
                menuName: row.menuName,
                startAt: row.startAt,
                reason: row.reason,
              }),
            ),
          )
      : none(),
    // 시간대 등록
    wants(range, 'window_created')
      ? db
          .select({
            id: slotWindows.id,
            at: slotWindows.createdAt,
            startAt: slotWindows.startAt,
            total: totalCount(),
          })
          .from(slotWindows)
          .where(and(eq(slotWindows.shopId, shopId), within(slotWindows.createdAt, range)))
          .orderBy(...newestFirst(slotWindows.createdAt, slotWindows.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('window_created', row.id, row.at, { startAt: row.startAt }),
            ),
          )
      : none(),
    // 시간대 마감(사유)
    wants(range, 'window_closed')
      ? db
          .select({
            id: slotWindows.id,
            at: slotWindows.closedAt,
            startAt: slotWindows.startAt,
            reason: slotWindows.closeReason,
            total: totalCount(),
          })
          .from(slotWindows)
          .where(
            and(
              eq(slotWindows.shopId, shopId),
              isNotNull(slotWindows.closedAt),
              within(slotWindows.closedAt, range),
            ),
          )
          .orderBy(...newestFirst(slotWindows.closedAt, slotWindows.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('window_closed', row.id, row.at as Date, {
                startAt: row.startAt,
                reason: row.reason,
              }),
            ),
          )
      : none(),
    // 새 예약(판매가)
    wants(range, 'reservation_created')
      ? db
          .select({
            id: reservations.id,
            at: reservations.createdAt,
            code: reservations.code,
            menuName: slots.menuName,
            startAt: slots.startAt,
            salePrice: slots.salePrice,
            total: totalCount(),
          })
          .from(reservations)
          .innerJoin(slots, eq(slots.id, reservations.slotId))
          .where(and(eq(slots.shopId, shopId), within(reservations.createdAt, range)))
          .orderBy(...newestFirst(reservations.createdAt, reservations.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('reservation_created', row.id, row.at, {
                reservationId: row.id,
                reservationCode: row.code,
                menuName: row.menuName,
                startAt: row.startAt,
                amount: row.salePrice,
              }),
            ),
          )
      : none(),
    readCancelled(db, eq(slots.shopId, shopId), range),
    ...readAgreedCancel(db, eq(slots.shopId, shopId), range),
    // 방문·노쇼 처리
    wants(range, 'visit_recorded')
      ? db
          .select({
            id: reservations.id,
            at: reservations.visitRecordedAt,
            code: reservations.code,
            menuName: slots.menuName,
            startAt: slots.startAt,
            result: reservations.visitResult,
            total: totalCount(),
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
          .orderBy(...newestFirst(reservations.visitRecordedAt, reservations.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('visit_recorded', row.id, row.at as Date, {
                reservationId: row.id,
                reservationCode: row.code,
                menuName: row.menuName,
                startAt: row.startAt,
                result: row.result,
              }),
            ),
          )
      : none(),
    // 정산 계좌 변경(은행)
    wants(range, 'payout_account_changed')
      ? db
          .select({
            id: payoutAccountChanges.id,
            at: payoutAccountChanges.createdAt,
            bankCode: payoutAccountChanges.bankCode,
            total: totalCount(),
          })
          .from(payoutAccountChanges)
          .where(
            and(
              eq(payoutAccountChanges.shopId, shopId),
              within(payoutAccountChanges.createdAt, range),
            ),
          )
          .orderBy(...newestFirst(payoutAccountChanges.createdAt, payoutAccountChanges.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('payout_account_changed', row.id, row.at, { reason: row.bankCode }),
            ),
          )
      : none(),
    // 정산 지급(0원 정산 포함)
    wants(range, 'settlement_paid')
      ? db
          .select({
            id: settlements.id,
            at: settlements.paidAt,
            amount: settlements.payoutAmount,
            total: totalCount(),
          })
          .from(settlements)
          .where(
            and(
              eq(settlements.shopId, shopId),
              isNotNull(settlements.paidAt),
              within(settlements.paidAt, range),
            ),
          )
          .orderBy(...newestFirst(settlements.paidAt, settlements.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('settlement_paid', row.id, row.at as Date, { amount: row.amount }),
            ),
          )
      : none(),
  ]);
}

/** 고객 이력. 기록마다 최신 순 take개와 전체 수 */
export async function readCustomerHistory(
  db: Db,
  input: HistoryReadRange & { customerId: string; userId: string },
): Promise<HistoryList[]> {
  const { customerId, userId, ...range } = input;
  const mine = eq(reservations.customerId, customerId);

  return Promise.all([
    // 가입(계정마다 한 번)
    wants(range, 'signed_up')
      ? db
          .select({ id: customers.id, at: customers.createdAt })
          .from(customers)
          .where(and(eq(customers.id, customerId), within(customers.createdAt, range)))
          .then((rows) => ({
            events: rows.map((row) => makeEvent('signed_up', row.id, row.at)),
            total: rows.length,
          }))
      : none(),
    // 예약(결제액)
    wants(range, 'reservation_created')
      ? db
          .select({
            id: reservations.id,
            at: reservations.createdAt,
            code: reservations.code,
            menuName: slots.menuName,
            startAt: slots.startAt,
            amount: orders.amount,
            total: totalCount(),
          })
          .from(reservations)
          .innerJoin(slots, eq(slots.id, reservations.slotId))
          .innerJoin(orders, eq(orders.id, reservations.orderId))
          .where(and(mine, within(reservations.createdAt, range)))
          .orderBy(...newestFirst(reservations.createdAt, reservations.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('reservation_created', row.id, row.at, {
                reservationId: row.id,
                reservationCode: row.code,
                menuName: row.menuName,
                startAt: row.startAt,
                amount: row.amount,
              }),
            ),
          )
      : none(),
    readCancelled(db, mine, range),
    // 환불(끝난 것, 환불액과 사유)
    wants(range, 'refund_done')
      ? db
          .select({
            id: refunds.id,
            at: refunds.processedAt,
            amount: refunds.refundAmount,
            reason: refunds.reason,
            reservationId: reservations.id,
            code: reservations.code,
            menuName: slots.menuName,
            startAt: slots.startAt,
            total: totalCount(),
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
          .orderBy(...newestFirst(refunds.processedAt, refunds.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('refund_done', row.id, row.at as Date, {
                reservationId: row.reservationId,
                reservationCode: row.code,
                menuName: row.menuName,
                startAt: row.startAt,
                amount: row.amount,
                reason: row.reason,
              }),
            ),
          )
      : none(),
    ...readAgreedCancel(db, mine, range),
    // 쿠폰 받음
    wants(range, 'coupon_issued')
      ? db
          .select({
            id: coupons.id,
            at: coupons.issuedAt,
            amount: coupons.amount,
            reason: coupons.reason,
            total: totalCount(),
          })
          .from(coupons)
          .where(and(eq(coupons.customerId, customerId), within(coupons.issuedAt, range)))
          .orderBy(...newestFirst(coupons.issuedAt, coupons.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('coupon_issued', row.id, row.at, {
                amount: row.amount,
                reason: row.reason,
              }),
            ),
          )
      : none(),
    // 쿠폰 사용
    wants(range, 'coupon_used')
      ? db
          .select({
            id: coupons.id,
            at: coupons.usedAt,
            amount: coupons.amount,
            total: totalCount(),
          })
          .from(coupons)
          .where(
            and(
              eq(coupons.customerId, customerId),
              isNotNull(coupons.usedAt),
              within(coupons.usedAt, range),
            ),
          )
          .orderBy(...newestFirst(coupons.usedAt, coupons.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('coupon_used', row.id, row.at as Date, { amount: row.amount }),
            ),
          )
      : none(),
    // 이의제기 접수(종류)
    wants(range, 'dispute_filed')
      ? db
          .select({
            id: disputes.id,
            at: disputes.receivedAt,
            type: disputes.type,
            reservationId: reservations.id,
            code: reservations.code,
            total: totalCount(),
          })
          .from(disputes)
          .innerJoin(reservations, eq(reservations.id, disputes.reservationId))
          .where(and(mine, within(disputes.receivedAt, range)))
          .orderBy(...newestFirst(disputes.receivedAt, disputes.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('dispute_filed', row.id, row.at, {
                reservationId: row.reservationId,
                reservationCode: row.code,
                reason: row.type,
              }),
            ),
          )
      : none(),
    // 이의제기 결론
    wants(range, 'dispute_resolved')
      ? db
          .select({
            id: disputes.id,
            at: disputes.handledAt,
            outcome: disputes.outcome,
            reservationId: reservations.id,
            code: reservations.code,
            total: totalCount(),
          })
          .from(disputes)
          .innerJoin(reservations, eq(reservations.id, disputes.reservationId))
          .where(and(mine, isNotNull(disputes.handledAt), within(disputes.handledAt, range)))
          .orderBy(...newestFirst(disputes.handledAt, disputes.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('dispute_resolved', row.id, row.at as Date, {
                reservationId: row.reservationId,
                reservationCode: row.code,
                result: row.outcome,
              }),
            ),
          )
      : none(),
    // 광고성 정보·관심 동네 알림 동의
    wants(range, 'consent_agreed')
      ? db
          .select({
            id: termsAgreements.id,
            at: termsAgreements.agreedAt,
            type: termsAgreements.termsType,
            total: totalCount(),
          })
          .from(termsAgreements)
          .where(and(consentOf(userId), within(termsAgreements.agreedAt, range)))
          .orderBy(...newestFirst(termsAgreements.agreedAt, termsAgreements.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('consent_agreed', row.id, row.at, { reason: row.type }),
            ),
          )
      : none(),
    // 동의 철회
    wants(range, 'consent_withdrawn')
      ? db
          .select({
            id: termsAgreements.id,
            at: termsAgreements.withdrawnAt,
            type: termsAgreements.termsType,
            total: totalCount(),
          })
          .from(termsAgreements)
          .where(
            and(
              consentOf(userId),
              isNotNull(termsAgreements.withdrawnAt),
              within(termsAgreements.withdrawnAt, range),
            ),
          )
          .orderBy(...newestFirst(termsAgreements.withdrawnAt, termsAgreements.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('consent_withdrawn', row.id, row.at as Date, { reason: row.type }),
            ),
          )
      : none(),
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
function readCancelled(db: Db, where: SQL, range: HistoryReadRange): Promise<HistoryList> {
  if (!wants(range, 'reservation_cancelled')) return none();
  return db
    .select({
      id: reservations.id,
      at: reservations.cancelledAt,
      actor: reservations.cancelActor,
      code: reservations.code,
      menuName: slots.menuName,
      startAt: slots.startAt,
      rate: cancelRefund.penaltyRate,
      total: totalCount(),
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
    .orderBy(...newestFirst(reservations.cancelledAt, reservations.id))
    .limit(range.take)
    .then((rows) =>
      toList(rows, (row) => {
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
  range: HistoryReadRange,
): [Promise<HistoryList>, Promise<HistoryList>] {
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
        total: totalCount(),
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
    wants(range, 'agreed_cancel_requested')
      ? base()
          .where(and(where, within(agreedCancelRequests.requestedAt, range)))
          .orderBy(...newestFirst(agreedCancelRequests.requestedAt, agreedCancelRequests.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('agreed_cancel_requested', row.id, row.requestedAt, {
                ...reservationOf(row),
                reason: row.reason,
              }),
            ),
          )
      : none(),
    wants(range, 'agreed_cancel_resolved')
      ? base()
          .where(
            and(
              where,
              isNotNull(agreedCancelRequests.respondedAt),
              within(agreedCancelRequests.respondedAt, range),
            ),
          )
          .orderBy(...newestFirst(agreedCancelRequests.respondedAt, agreedCancelRequests.id))
          .limit(range.take)
          .then((rows) =>
            toList(rows, (row) =>
              makeEvent('agreed_cancel_resolved', row.id, row.respondedAt as Date, {
                ...reservationOf(row),
                result: row.status,
              }),
            ),
          )
      : none(),
  ];
}
