// 돌연변이 테스트(Stryker). 핵심 규칙 코드를 일부러 조금씩 틀리게 바꿔서(돌연변이) 테스트가 잡는지 본다.
// 테스트가 못 잡고 "살아남은" 돌연변이가 테스트의 빈틈이다(docs/test-scenarios.md "테스트가 틀리지 않게" ②를 자동으로).
// 느려서 PR마다 돌리지 않고, 일요일 주간 점검 때 GitHub Actions가 돌린다(.github/workflows/mutation.yml).
// 직접 돌리려면 npm run mutation. 결과는 reports/mutation/mutation.html

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.mts' },
  coverageAnalysis: 'perTest',
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
    'src/server/settlements/calc-settlement.ts',
    'src/server/settlements/payout-date.ts',
    'src/server/settlements/settle-rules.ts',
    'src/server/settlements/settlement-view.ts',
    'src/server/settlements/statement-view.ts',
    'src/server/coupons/rules.ts',
    'src/server/disputes/rules.ts',
    'src/server/visits/rules.ts',
    'src/server/slot-windows/rules.ts',
    'src/server/slot-windows/starts.ts',
    'src/server/slot-windows/view.ts',
    'src/features/slot-status/slot-status.ts',
    'src/app/owner/(console)/slots/slot-time.ts',
    'src/app/owner/(console)/slots/window/window-draft.ts',
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
