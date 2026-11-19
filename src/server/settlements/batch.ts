// 목요일 정산 묶기 (X-206, #353, W20 ③). 서버에서만 부른다. 예약 작업(/api/cron/settlement-batch)이 매일 새벽 부르고,
// 오늘이 지급일(매주 목요일, 공휴일이면 다음 영업일)일 때 묶는다. 지급일 새벽 작업이 통째로 실패했을 때를 위해
// 지급일 다음 날(SETTLEMENT_CATCH_UP_DAYS) 새벽에도 그 지급일 기준(그날 0시)으로 아직 묶지 않은 샵을 묶는다(따라잡기, #394 리뷰 3번).
//
// 1. 기준 시각 = 지급일 0시(한국 시간). 아직 정산 줄이 없는 끝난 거래 중 정산할 종류이고(settlementKindOf),
//    이의제기 접수 기한이 기준 시각까지 지났고 확인 중 이의제기와 운영자 정산 보류(#373 ②)가 없는 것(isReadyToSettle)을 고른다
// 2. 샵마다 한 트랜잭션으로 정산 묶음·정산 줄·패널티 뗀 기록을 저장한다(batch-rules.ts buildShopSettlement).
//    먼저 샵 줄을 잠그고 운영자 정산 보류를 다시 읽어서, 후보를 읽은 뒤에 걸린 보류도 뺀다(보류를 거는 함수도 같은 샵 줄을 잠근다).
//    한 샵이 실패해도 다른 샵은 계속하고, 실패한 샵은 다음 지급일에 다시 묶인다
// 3. 결제 수수료율(PAYMENT_FEE_RATE)이 정해지기 전(PG 계약 전)에는 정산 금액을 확정할 수 없어서 묶지 않는다(#134, #353)
//
// 다시 불러도 같다: 같은 지급일에 이미 묶은 샵은 건너뛰고, 같은 거래·같은 기간은 DB unique가 두 번 저장되지 않게 막는다.
// 지급 요청은 하지 않는다(운영자가 A-105에서 확인한 뒤 요청한다. PG 지급대행 계약 전에는 잠가 둔다)

import 'server-only';

import type { getDb } from '@/db';
import { violatedConstraint } from '@/lib/db-error';
import { type PlatformFeeMode, SETTLEMENT_CATCH_UP_DAYS } from '@/server/policy';

import {
  buildShopSettlement,
  catchUpPayoutDate,
  kstDateStart,
  payoutDateOn,
  type ShopSettlementDraft,
} from './batch-rules';
import {
  type BatchCandidate,
  hasSettlementOn,
  insertShopSettlement,
  lockShopForBatch,
  readBatchCandidates,
  readHeldReservationIds,
  readOutstandingPenalties,
  readPreviousPayoutDate,
} from './batch-store';
import { isReadyToSettle, type SettleKind, settlementKindOf } from './settle-rules';

type Db = ReturnType<typeof getDb>;

export type SettlementBatchResult =
  | { status: 'not_payout_day' }
  | { status: 'payment_fee_rate_missing'; payoutDate: string }
  | {
      status: 'done';
      payoutDate: string;
      /** 지난 지급일을 따라잡은 실행(지급일 다음 날 새벽). 그날 이미 묶인 거래는 정산 줄이 있어서 후보에 없다 */
      catchUp: boolean;
      /** 이번에 묶은 샵 수와 거래 수 */
      shops: number;
      items: number;
      /** 패널티를 떼고 0원이라 지급 요청 없이 끝난 샵 수 */
      zeroPayouts: number;
      /** 이 지급일에 이미 묶여 있어 건너뛴 샵 수 */
      skipped: number;
      /** 운영자 정산 보류(#373 ②)만 아니면 이번에 묶였을 거래 수. 풀리면 돌아오는 지급일에 묶인다 */
      held: number;
      /** 저장하다 실패한 샵 수(다음 지급일에 다시 묶인다) */
      failed: number;
    };

type ReadyItem = { candidate: BatchCandidate; kind: SettleKind; occurredAt: Date };

/** 샵 하나의 묶기 결과: 이미 묶임 / 모두 운영자 보류라 묶지 않음 / 저장함(held는 보류로 뺀 거래 수) */
type ShopOutcome =
  | { kind: 'already' }
  | { kind: 'held'; held: number }
  | { kind: 'saved'; draft: ShopSettlementDraft; held: number };

/** 오늘이 지급일이면 그날, 지급일 다음 날이면 그 지급일(따라잡기)로 묶을 거래를 샵별로 묶어 저장한다 */
export async function runSettlementBatch(
  db: Db,
  input: { now: Date; paymentFeeRate: number | null; mode?: PlatformFeeMode },
): Promise<SettlementBatchResult> {
  const today = payoutDateOn(input.now);
  const payoutDate = today ?? catchUpPayoutDate(input.now, SETTLEMENT_CATCH_UP_DAYS);
  if (!payoutDate) return { status: 'not_payout_day' };
  const { paymentFeeRate } = input;
  if (paymentFeeRate === null) return { status: 'payment_fee_rate_missing', payoutDate };

  const cutoff = kstDateStart(payoutDate);
  const byShop = new Map<string, ReadyItem[]>();
  let held = 0;
  for (const candidate of await readBatchCandidates(db, { cutoff })) {
    const kind = settlementKindOf(candidate);
    if (!kind) continue;
    const holds = { hasOpenDispute: candidate.hasOpenDispute, cutoff };
    if (!isReadyToSettle(candidate, { ...holds, hasAdminHold: candidate.hasAdminHold })) {
      // 운영자 보류만 아니면 묶였을 거래는 따로 센다(예약 작업 기록에 남는다)
      if (candidate.hasAdminHold && isReadyToSettle(candidate, { ...holds, hasAdminHold: false })) {
        held += 1;
      }
      continue;
    }
    const occurredAt =
      candidate.status === 'completed' ? candidate.visitRecordedAt : candidate.cancelledAt;
    if (!occurredAt) continue;
    byShop.set(candidate.shopId, [
      ...(byShop.get(candidate.shopId) ?? []),
      { candidate, kind, occurredAt },
    ]);
  }

  const result = { shops: 0, items: 0, zeroPayouts: 0, skipped: 0, held, failed: 0 };
  for (const [shopId, candidates] of byShop) {
    try {
      const outcome = await db.transaction(async (tx): Promise<ShopOutcome> => {
        await lockShopForBatch(tx, shopId);
        if (await hasSettlementOn(tx, { shopId, payoutDate })) return { kind: 'already' };
        // 후보를 읽은 뒤에 걸린 운영자 정산 보류를 뺀다
        const holds = await readHeldReservationIds(tx, {
          shopId,
          reservationIds: candidates.map(({ candidate }) => candidate.reservationId),
          cutoff,
        });
        const ready = holds.shop
          ? []
          : candidates.filter(
              ({ candidate }) => !holds.reservationIds.has(candidate.reservationId),
            );
        if (ready.length === 0) return { kind: 'held', held: candidates.length };
        const draft = buildShopSettlement({
          payoutDate,
          previousPayoutDate: await readPreviousPayoutDate(tx, shopId),
          items: ready.map(({ candidate, kind, occurredAt }) => ({
            orderId: candidate.orderId,
            kind,
            salePrice: candidate.salePrice,
            discountRate: candidate.discountRate,
            couponAmount: candidate.couponAmount,
            occurredAt,
          })),
          penalties: await readOutstandingPenalties(tx, shopId),
          paymentFeeRate,
          mode: input.mode,
        });
        await insertShopSettlement(tx, { shopId, draft, now: input.now });
        return { kind: 'saved', draft, held: candidates.length - ready.length };
      });
      if (outcome.kind === 'already') {
        result.skipped += 1;
        continue;
      }
      result.held += outcome.held;
      if (outcome.kind === 'held') continue;
      result.shops += 1;
      result.items += outcome.draft.itemCount;
      if (outcome.draft.status === 'paid') result.zeroPayouts += 1;
    } catch (error) {
      // 같은 때 다른 묶기가 먼저 저장했다(같은 기간·같은 거래). 다시 묶지 않는다
      const constraint = violatedConstraint(error);
      if (
        constraint === 'settlements_shop_period_unique' ||
        constraint === 'settlement_items_order_id_unique'
      ) {
        result.skipped += 1;
        continue;
      }
      result.failed += 1;
      console.error(
        '[settlements] 정산 묶기 실패:',
        shopId,
        error instanceof Error ? error.name : 'unknown',
      );
    }
  }
  return { status: 'done', payoutDate, catchUp: today === null, ...result };
}
