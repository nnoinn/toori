// 목요일 정산 묶기 계산 (X-206, #353 결정 1~4, W20 ③). 계산만 한다. DB 읽기·저장은 batch-store.ts, 순서는 batch.ts.
//
// - 묶는 날: 지급일(매주 목요일, 공휴일이면 다음 영업일) 새벽. 기준 시각은 지급일 0시(한국 시간)이고,
//   그때까지 이의제기 접수 기한이 지났고 확인 중 이의제기가 없는 거래를 묶는다(settle-rules.ts isReadyToSettle)
// - 샵 하나 × 지급일 하나로 묶는다. 기간은 그 샵의 직전 지급일 다음 날 ~ 지급일, 첫 정산은 처음 묶이는 거래가 끝난 날부터
// - 비율은 묶는 날의 정책값(플랫폼 수수료 방식, 결제 수수료율)을 쓴다(결정 1)
// - 남은 원장님 귀책 패널티를 오래된 것부터 떼고(allocatePenalties), 0원이 되면 지급 요청 없이 지급 완료(0원)로 끝낸다(결정 4)

import type { SettlementItemKind, SettlementStatus } from '@/db/schema/settlements';
import { kstDateKey, kstToUtc } from '@/lib/time';
import type { PlatformFeeMode } from '@/server/policy';

import {
  allocatePenalties,
  calcSettlementFees,
  type OutstandingPenalty,
  type SettlementFees,
  settlementBaseAmount,
} from './calc-settlement';
import { payoutDateFor } from './payout-date';
import type { SettleKind } from './settle-rules';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 0원 정산의 메모. 원장님 정산 내역(S-501)이 이유로 보여준다(#353 결정 4) */
export const ZERO_PAYOUT_MEMO = '패널티로 상계해서 0원';

/** 한국 날짜 'YYYY-MM-DD'의 0시 */
export function kstDateStart(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return kstToUtc({ year, month, day, hour: 0, minute: 0 });
}

/** now가 든 한국 날짜가 지급일이면 그 날짜('YYYY-MM-DD'), 아니면 null */
export function payoutDateOn(now: Date): string | null {
  const today = kstDateKey(now);
  // 오늘 0시가 지난 거래가 묶이는 첫 지급일이 오늘이면 오늘이 지급일이다
  return payoutDateFor(kstDateStart(today)) === today ? today : null;
}

/** 다음 날('YYYY-MM-DD') */
function nextDate(date: string): string {
  return kstDateKey(new Date(kstDateStart(date).getTime() + DAY_MS));
}

/** 묶을 거래 하나(이미 정산 규칙을 통과한 것) */
export type BatchItemInput = {
  orderId: string;
  kind: SettleKind;
  salePrice: number;
  discountRate: number;
  /** 고객이 쓴 쿠폰 금액(투리 부담, 원장님 정산과 무관) */
  couponAmount: number;
  /** 방문·노쇼 처리 또는 취소 시각 */
  occurredAt: Date;
};

/** 저장할 정산 줄 하나 */
export type BatchItemDraft = SettlementFees & {
  orderId: string;
  kind: SettlementItemKind;
  couponAmount: number;
};

/** 저장할 샵 하나의 정산 묶음 */
export type ShopSettlementDraft = {
  periodStart: string;
  periodEnd: string;
  items: BatchItemDraft[];
  itemCount: number;
  totalBaseAmount: number;
  /** 플랫폼 수수료 + VAT + 결제 수수료 + VAT 합 */
  totalFeeAmount: number;
  /** 패널티를 떼기 전 원장님 정산액 합 */
  payoutBeforePenalty: number;
  /** 이번에 뗄 패널티(penalty_collections). fullyCollected: 이번으로 그 패널티를 다 걷었음 */
  collections: { penaltyId: string; amount: number; fullyCollected: boolean }[];
  penaltyDeducted: number;
  /** 최종 지급액 */
  payoutAmount: number;
  /** 지급 전(pending). 0원이면 지급 요청 없이 지급 완료(paid) */
  status: Extract<SettlementStatus, 'pending' | 'paid'>;
  memo: string | null;
};

/**
 * 샵 하나의 정산 묶음 계산. items는 1개 이상이어야 한다.
 * previousPayoutDate는 그 샵의 직전 정산 지급일(없으면 첫 정산)
 */
export function buildShopSettlement(input: {
  payoutDate: string;
  previousPayoutDate: string | null;
  items: readonly BatchItemInput[];
  penalties: readonly OutstandingPenalty[];
  paymentFeeRate: number;
  mode?: PlatformFeeMode;
}): ShopSettlementDraft {
  const { payoutDate, previousPayoutDate, items, penalties, paymentFeeRate, mode } = input;
  if (items.length === 0) throw new RangeError('묶을 거래가 없어요');

  const drafts = items.map((item): BatchItemDraft => {
    const baseAmount = settlementBaseAmount(
      item.kind.kind === 'penalty' || item.kind.kind === 'agreed_cancel'
        ? { kind: item.kind.kind, salePrice: item.salePrice, penaltyRate: item.kind.penaltyRate }
        : { kind: item.kind.kind, salePrice: item.salePrice },
    );
    const fees = calcSettlementFees({
      baseAmount,
      discountRate: item.discountRate,
      paymentFeeRate,
      mode,
    });
    return {
      ...fees,
      orderId: item.orderId,
      kind: item.kind.kind,
      couponAmount: item.couponAmount,
    };
  });

  const sum = (pick: (draft: BatchItemDraft) => number) =>
    drafts.reduce((total, draft) => total + pick(draft), 0);
  const payoutBeforePenalty = sum((draft) => draft.payoutAmount);
  const allocated = allocatePenalties(payoutBeforePenalty, penalties);
  const payoutAfter = allocated.payoutAfter;
  const stillOwed = new Set(allocated.outstanding.map((penalty) => penalty.penaltyId));
  const collections = allocated.collections.map((collection) => ({
    ...collection,
    fullyCollected: !stillOwed.has(collection.penaltyId),
  }));
  const earliest = Math.min(...items.map((item) => item.occurredAt.getTime()));

  return {
    periodStart: previousPayoutDate ? nextDate(previousPayoutDate) : kstDateKey(new Date(earliest)),
    periodEnd: payoutDate,
    items: drafts,
    itemCount: drafts.length,
    totalBaseAmount: sum((draft) => draft.baseAmount),
    totalFeeAmount: sum(
      (draft) => draft.feeAmount + draft.feeVat + draft.paymentFee + draft.paymentFeeVat,
    ),
    payoutBeforePenalty,
    collections,
    penaltyDeducted: payoutBeforePenalty - payoutAfter,
    payoutAmount: payoutAfter,
    status: payoutAfter === 0 ? 'paid' : 'pending',
    memo: payoutAfter === 0 ? ZERO_PAYOUT_MEMO : null,
  };
}
