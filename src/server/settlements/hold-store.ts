// 운영자 정산 보류·풀기(#373 ②, #433)의 DB 읽기·저장. 서버에서만 부른다. 순서와 권한은 holds.ts.
// 모두 트랜잭션 안에서 부르고, 처리 기록(settlement.hold·settlement.release)도 같은 트랜잭션에 남긴다.
//
// 보류를 걸 때는 그 샵 줄을 잠근다(for no key update). 목요일 묶기(batch.ts)도 샵마다 같은 줄을 잠그고(for share) 보류를 다시 읽어서,
// 묶는 동안 건 보류는 묶기가 끝난 뒤 "이미 묶임"이 되고, 먼저 건 보류는 묶기가 뺀다(보류가 새는 틈이 없다).
// 같은 샵의 보류 걸기도 이 잠금으로 줄을 서서, "풀리지 않은 보류는 거래마다·샵마다 하나"를 먼저 확인할 수 있다(unique 인덱스는 마지막 안전장치)

import 'server-only';

import { and, eq, isNull, type SQL } from 'drizzle-orm';

import type { getDb } from '@/db';
import { reservations, settlementHolds, settlementItems, shops, slots } from '@/db/schema';
import { ok, type Result } from '@/lib/result';
import { recordAdminAction } from '@/server/admin/action-store';

import { settlementHoldFail } from './hold-errors';
import { settlementKindOf } from './settle-rules';
import {
  cancelRefund,
  cancelRefundJoin,
  narrowSettleTarget,
  settleTargetColumns,
} from './settle-query';

/** 트랜잭션(getDb().transaction의 tx) */
export type HoldTx = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update'>;
type Tx = HoldTx;

export type HeldSettlement = { holdId: string; heldAt: string };
export type ReleasedSettlementHold = { holdId: string; releasedAt: string };

/** 보류를 거는 동안 그 샵 줄을 잠근다. 샵이 없으면 false */
async function lockShopForHold(tx: Tx, shopId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: shops.id })
    .from(shops)
    .where(eq(shops.id, shopId))
    .for('no key update');
  return row !== undefined;
}

/**
 * 거래 하나의 정산 보류. 예정 예약도 걸 수 있다(끝나도 묶이지 않는다).
 * 정산 줄이 생기지 않는 예약(원장님 사정 취소·자동 취소·운영자 취소)은 NOTHING_TO_SETTLE, 이미 묶였으면 ALREADY_BUNDLED(11/15 nnoinn: 묶이기 전만)
 */
export async function holdReservationInTx(
  tx: Tx,
  input: { reservationId: string; adminId: string; reason: string; now: Date },
): Promise<Result<HeldSettlement>> {
  const [found] = await tx
    .select({
      shopId: slots.shopId,
      orderId: reservations.orderId,
      ...settleTargetColumns,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .leftJoin(cancelRefund, cancelRefundJoin)
    .where(eq(reservations.id, input.reservationId));
  if (!found) return settlementHoldFail('RESERVATION_NOT_FOUND');
  const target = narrowSettleTarget(found);
  if (target.status !== 'confirmed' && settlementKindOf(target) === null) {
    return settlementHoldFail('NOTHING_TO_SETTLE');
  }

  await lockShopForHold(tx, found.shopId);
  // 잠근 뒤에 본다: 묶기가 먼저 잠갔으면 그 묶음이 끝난 뒤의 상태다
  const [bundled] = await tx
    .select({ id: settlementItems.id })
    .from(settlementItems)
    .where(eq(settlementItems.orderId, found.orderId))
    .limit(1);
  if (bundled) return settlementHoldFail('ALREADY_BUNDLED');
  if (await hasActiveHold(tx, eq(settlementHolds.reservationId, input.reservationId))) {
    return settlementHoldFail('ALREADY_HELD');
  }

  const held = await insertHold(tx, { ...input, shopId: null });
  await recordAdminAction(tx, {
    adminId: input.adminId,
    action: 'settlement.hold',
    targetType: 'reservation',
    targetId: input.reservationId,
    memo: input.reason,
  });
  return ok(held);
}

/** 샵 전체의 정산 보류. 아직 묶이지 않은 그 샵 거래가 모두 멈춘다(이미 묶인 정산은 그대로) */
export async function holdShopInTx(
  tx: Tx,
  input: { shopId: string; adminId: string; reason: string; now: Date },
): Promise<Result<HeldSettlement>> {
  if (!(await lockShopForHold(tx, input.shopId))) return settlementHoldFail('SHOP_NOT_FOUND');
  if (await hasActiveHold(tx, eq(settlementHolds.shopId, input.shopId))) {
    return settlementHoldFail('ALREADY_HELD');
  }

  const held = await insertHold(tx, { ...input, reservationId: null });
  await recordAdminAction(tx, {
    adminId: input.adminId,
    action: 'settlement.hold',
    targetType: 'shop',
    targetId: input.shopId,
    memo: input.reason,
  });
  return ok(held);
}

/** 보류를 푼다. 푼 운영자·시각·메모를 남기고 보류 줄은 지우지 않는다(언제 왜 멈췄는지 남긴다) */
export async function releaseHoldInTx(
  tx: Tx,
  input: { holdId: string; adminId: string; memo: string; now: Date },
): Promise<Result<ReleasedSettlementHold>> {
  const [released] = await tx
    .update(settlementHolds)
    .set({ releasedBy: input.adminId, releasedAt: input.now, releaseMemo: input.memo })
    .where(and(eq(settlementHolds.id, input.holdId), isNull(settlementHolds.releasedAt)))
    .returning({
      reservationId: settlementHolds.reservationId,
      shopId: settlementHolds.shopId,
    });
  if (!released) {
    const [found] = await tx
      .select({ id: settlementHolds.id })
      .from(settlementHolds)
      .where(eq(settlementHolds.id, input.holdId));
    return settlementHoldFail(found ? 'ALREADY_RELEASED' : 'HOLD_NOT_FOUND');
  }

  await recordAdminAction(tx, {
    adminId: input.adminId,
    action: 'settlement.release',
    // 거래와 샵 중 하나만 채운다(settlement_holds_target_check)
    targetType: released.reservationId ? 'reservation' : 'shop',
    targetId: (released.reservationId ?? released.shopId) as string,
    memo: input.memo,
  });
  return ok({ holdId: input.holdId, releasedAt: input.now.toISOString() });
}

async function hasActiveHold(tx: Tx, target: SQL): Promise<boolean> {
  const [row] = await tx
    .select({ id: settlementHolds.id })
    .from(settlementHolds)
    .where(and(target, isNull(settlementHolds.releasedAt)))
    .limit(1);
  return row !== undefined;
}

async function insertHold(
  tx: Tx,
  input: {
    reservationId: string | null;
    shopId: string | null;
    adminId: string;
    reason: string;
    now: Date;
  },
): Promise<HeldSettlement> {
  const [row] = await tx
    .insert(settlementHolds)
    .values({
      reservationId: input.reservationId,
      shopId: input.shopId,
      reason: input.reason,
      heldBy: input.adminId,
      heldAt: input.now,
    })
    .returning({ id: settlementHolds.id });
  return { holdId: row.id, heldAt: input.now.toISOString() };
}
