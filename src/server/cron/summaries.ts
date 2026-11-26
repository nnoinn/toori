// 예약 작업 4개가 실행 기록(cron_runs.summary)에 남기는 처리 개수의 모양(타입만). #373 ⑥
// 작업 주소(src/app/api/cron/*/route.ts)가 이 타입으로 결과를 돌려주고, 운영자 예약 작업 화면(src/app/admin/jobs/format.ts)이 값마다 이름을 붙인다.
// 작업 결과에 값을 더하면 여기를 고치고, 화면 이름표도 더한다(빠뜨리면 타입 검사에서 걸린다)

import type { WithdrawalEraseSummary } from '@/server/accounts/withdrawal-erase';
import type { ConsentRecheckSummary, DigestSummary, ReminderSummary } from '@/server/notifications';
import type { SweepSummary } from '@/server/payments';
import type { AgreedCancelSweepSummary } from '@/server/refunds';
import type { CancelSweepSummary } from '@/server/refunds/sweep-cancels';
import type { SettlementBatchResult } from '@/server/settlements/batch';
import type { BusinessDocCleanup } from '@/server/storage/business-doc-cleanup';

/** 결제 정리(10분마다): 오래된 주문, 진행 중으로 남은 취소·무효, 결제 없이 끝난 시간대 칸 */
export type PaymentsSweepSummary = {
  orders: SweepSummary;
  cancels: CancelSweepSummary;
  windowHolds: number;
};

/** 리마인드(5분마다): 예약 리마인드, 합의 후 취소 요청 정리 */
export type RemindersSummary = {
  reminders: ReminderSummary;
  agreedCancels: AgreedCancelSweepSummary;
};

/** 새 매물 알림(매일 오후 1시): 새 매물 알림, 사업자등록증 정리, 동의 2년 확인, 탈퇴 30일 뒤 지우기 */
export type SlotDigestRunSummary = {
  digest: DigestSummary;
  businessDocs: BusinessDocCleanup;
  consentRecheck: ConsentRecheckSummary;
  withdrawalErase: WithdrawalEraseSummary;
};

/** 정산 묶기(매일 0시 30분)는 묶기 결과 그대로 */
export type SettlementBatchSummary = SettlementBatchResult;
