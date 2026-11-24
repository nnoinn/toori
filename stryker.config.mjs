// 돌연변이 테스트(Stryker). 핵심 규칙 코드를 일부러 조금씩 틀리게 바꿔서(돌연변이) 테스트가 잡는지 본다.
// 테스트가 못 잡고 "살아남은" 돌연변이가 테스트의 빈틈이다(docs/test-scenarios.md "테스트가 틀리지 않게" ②를 자동으로).
// 느려서 PR마다 돌리지 않고, 일요일 주간 점검 때 GitHub Actions가 돌린다(.github/workflows/mutation.yml).
// 직접 돌리려면 npm run mutation. 결과는 reports/mutation/mutation.html

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.mts' },
  coverageAnalysis: 'perTest',
  // GitHub 실행(4코어·16GB)이 50분쯤 지나 러너와 연결이 끊긴 채 멈췄다(11/21·11/22, "lost communication" = 메모리·CPU 부족).
  // 테스트 러너가 돌수록 메모리가 쌓여서, 동시에 2개만 돌리고 25번 쓰면 새로 띄워 메모리를 비운다
  concurrency: 2,
  maxTestRunnerReuse: 25,
  // 돈·시간·상태 규칙이 든 순수 함수 파일. DB 없이 도는 테스트가 지키는 파일만 고른다.
  // 규칙 파일을 새로 만들면 여기에 더한다
  mutate: [
    'src/server/policy/fees.ts',
    'src/server/policy/holidays.ts',
    'src/server/policy/pricing.ts',
    'src/server/policy/refund.ts',
    'src/server/policy/slot-time.ts',
    'src/server/refunds/calc-refund.ts',
    'src/server/refunds/agreed-cancel-rules.ts',
    'src/server/refunds/void-rules.ts',
    'src/server/settlements/calc-settlement.ts',
    'src/server/settlements/payout-date.ts',
    'src/server/settlements/settle-rules.ts',
    'src/server/settlements/batch-rules.ts',
    'src/server/settlements/settlement-view.ts',
    'src/server/settlements/statement-view.ts',
    'src/server/coupons/rules.ts',
    'src/server/auth/customer-name.ts',
    'src/server/disputes/rules.ts',
    'src/server/visits/rules.ts',
    'src/server/slot-windows/rules.ts',
    'src/server/slot-windows/starts.ts',
    'src/server/slot-windows/view.ts',
    'src/server/payments/amount.ts',
    'src/server/payments/checkout-rules.ts',
    'src/server/payments/webhook-signature.ts',
    'src/server/settlements/preview.ts',
    'src/server/storage/business-doc-rules.ts',
    'src/server/auth/proxy-rules.ts',
    'src/features/slot-status/slot-status.ts',
    'src/app/owner/(console)/slots/slot-time.ts',
    'src/app/owner/(console)/slots/window/window-draft.ts',
    'src/app/owner/(console)/slots/window/window-rates.ts',
    'src/app/owner/(console)/settings/shop/hours-table.ts',
    'src/app/owner/(console)/settings/shop/hours-change.ts',
    // 원장님 화면 규칙(정민석, 11/21): 입력 검사·정산 문구·대시보드·예약 현황·예약 상세·합의 취소·시간대 시간표
    'src/app/owner/business-fields.ts',
    'src/app/owner/korean.ts',
    'src/app/owner/join/owner-join.ts',
    'src/app/owner/(console)/settings/shop/shop-profile.ts',
    'src/app/owner/(console)/settings/menu/menu.ts',
    'src/app/owner/(console)/settings/images/shop-images.ts',
    'src/app/owner/(console)/settlements/settlement-format.ts',
    'src/app/owner/(console)/dashboard/dashboard.ts',
    'src/app/owner/(console)/schedule/schedule.ts',
    'src/app/owner/(console)/reservations/reservation-detail.ts',
    'src/app/owner/(console)/reservations/cancel-request.ts',
    'src/app/owner/(console)/slots/calendar-days.ts',
    'src/app/owner/(console)/slots/slot-edit.ts',
    'src/app/owner/(console)/slots/slot-pricing.ts',
    'src/app/owner/(console)/slots/relist.ts',
    'src/app/owner/(console)/slots/window/window-cells.ts',
    // 11/22: 월별 통계(S-504)·지난 매물로 빠르게 올리기(S-207)·이의제기 안내(S-407)·운영자 사유 한 줄(#499)
    'src/app/owner/(console)/stats/stats.ts',
    'src/app/owner/(console)/slots/slot-presets.ts',
    'src/app/owner/(console)/reservations/reservation-dispute.ts',
    'src/app/owner/(console)/admin-notice-line.ts',
    // 11/25: 원장님 탈퇴·되살리기(#154)·끌어서 순서·게시 멈춤 안내 한 줄·알림함 빈 안내
    'src/app/owner/(console)/account/withdrawal-steps.ts',
    'src/app/owner/restore/restore-rules.ts',
    'src/app/owner/(console)/settings/reorder.ts',
    'src/app/owner/(console)/slots/publish-pause-notice.ts',
    'src/app/owner/(console)/notifications/owner-notifications.ts',
    // 운영자 화면 규칙(강규민). 주소 폴더 [reservationId]는 *로 쓴다
    'src/app/admin/jobs/status.ts',
    'src/app/admin/settlements/hold-panel.ts',
    'src/app/admin/reservations/*/visit-panel.ts',
    // 고객 화면 규칙(정찬형). 주소 폴더 [slotId] 같은 이름은 글롭에서 글자 묶음이 돼서 *로 쓴다
    'src/features/map/slot-list/badges.ts',
    'src/features/map/slot-list/merge.ts',
    'src/features/map/slot-list/window-range.ts',
    'src/features/map/filters.ts',
    'src/features/map/region-groups.ts',
    'src/app/(customer)/(tabs)/slots/*/detail-format.ts',
    'src/app/(customer)/(tabs)/reservations/reservation-tabs.ts',
    'src/app/(customer)/(tabs)/reservations/agreed-cancel-badge.ts',
    'src/app/(customer)/(focus)/checkout/*/phone-save-rules.ts',
    'src/app/(customer)/(focus)/payment/result/result-rules.ts',
    'src/app/(customer)/(focus)/login/login-params.ts',
    'src/app/(customer)/(focus)/join/agreements.ts',
  ],
  // 개발자용 오류 문구는 돌연변이에서 뺀다(stryker/ignore-error-messages.mjs)
  appendPlugins: ['./stryker/ignore-error-messages.mjs'],
  ignorers: ['error-messages'],
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  // 점수로 실패시키지 않는다. 살아남은 돌연변이를 하나씩 보고 테스트를 더한다
  thresholds: { high: 80, low: 60, break: null },
};

export default config;
