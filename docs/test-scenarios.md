# 회귀 테스트 시나리오

언제나 지켜야 하는 동작 목록이다. 코드를 고칠 때마다 자동 테스트가 이 목록의 동작을 다시 확인한다(회귀 테스트). 목록과 기대 결과는 nnoinn이 "우리 규칙이 맞다"고 승인한 것이 기준이다. 규칙이 바뀌면 이 목록과 테스트를 같은 PR에서 바꾼다.

## 읽는 법

- **ID**: 영역-번호. PR·Issue에서 이 ID로 부른다
- **시나리오와 기대**: 기대 결과는 규칙 문서(CLAUDE.md 핵심 비즈니스 규칙, `docs/settlement-examples.md`, 기능 명세 ID)의 숫자와 문장 그대로 쓴다
- **상태**: ✅ 자동 테스트가 지킨다 / ⏳ 자동 테스트 예정(기능이 아직 없거나, 서버 흐름 테스트 ②·브라우저 테스트 ③에서 만든다) / 🖐 손 점검(체크리스트)으로만 본다
- **테스트**: `파일` 뒤에 테스트 이름 일부를 적는다. `tests/scripts/test-scenarios.test.ts`가 PR 검사마다 그 파일과 이름이 정말 있는지 확인한다. 테스트 이름을 바꾸거나 지우면 PR 검사가 실패하니 이 표도 같이 고친다

## 테스트가 틀리지 않게 (11/12)

테스트도 사람과 Claude가 쓴 코드라서 틀릴 수 있다. 아래를 지킨다(로드맵 "테스트가 틀리지 않게").

1. 기댓값은 규칙 문서의 숫자를 그대로 쓴다. 테스트 안에서 코드와 같은 식으로 다시 계산하지 않는다. 돈 계산은 `tests/docs/rule-docs.test.ts`가 CLAUDE.md와 `docs/settlement-examples.md`를 직접 읽어서 코드와 비교한다
2. 새 테스트는 코드를 일부러 틀리게 바꿔서 실패하는 것을 한 번 본다. PR의 "테스트" 칸에 어떻게 틀리게 했는지 적는다(통과만 하는 테스트는 아무것도 지키지 않는다). 핵심 규칙 파일은 매주 돌연변이 테스트가 같은 일을 자동으로 한다(아래)
3. 이 목록은 nnoinn이 읽고 승인한다
4. 손 점검이나 실제 사용에서 버그가 나오면 그 버그를 잡는 테스트를 먼저 더해서 실패하는 것을 보고, 그다음에 고친다
5. 규칙이 바뀌면 이 목록, 규칙 문서, 테스트를 같은 PR에서 바꾼다

PR 검사가 자동으로 막는 것:

- 검사(`expect`)가 하나도 없는 테스트(`vitest.config.mts`의 `requireAssertions`)
- 이 목록의 ✅ 줄이 가리키는 테스트가 없어진 경우(`tests/scripts/test-scenarios.test.ts`)
- 규칙 문서의 돈 계산 숫자와 코드 결과가 다른 경우(`tests/docs/rule-docs.test.ts`)
- `it.only`를 남긴 경우(PR 검사에서는 Vitest가 실패로 본다)

매주 자동으로 보는 것(돌연변이 테스트, 11/12):

- Stryker가 핵심 규칙 파일(`stryker.config.mjs`의 `mutate`)을 조금씩 틀리게 바꿔서(돌연변이: `>=`를 `>`로, 조건을 늘 참으로 등) 테스트가 잡는지 본다. 테스트가 못 잡고 살아남은 변경이 테스트의 빈틈이다
- 한국 시간 일요일 0시에 GitHub Actions "돌연변이 테스트"가 돌고, 실행 요약에 파일별 점수와 테스트가 못 잡은 변경 목록이 남는다. nnoinn의 일요일 주간 점검 때 보고, 지켜야 하는 동작이면 테스트를 더한다(담당 영역이면 담당자에게 알린다)
- 직접 돌리려면 `npm run mutation`(4분쯤), 요약은 `node scripts/mutation-summary.mjs`
- 개발자용 오류 문구(`new Error(...)` 안의 글자)는 빼고 본다. 화면 안내 문구가 살아남는 것은 괜찮을 수 있으니 하나씩 판단한다
- 돈·시간·상태 규칙이 든 새 파일을 만들면 `stryker.config.mjs`의 `mutate`에 더한다

쓰지 않는 것:

- 만들어진 SQL 글자를 비교하는 테스트. 동작이 같아도 조건 순서만 바뀌면 깨지고, 그러면 테스트를 코드에 맞춰 고치는 습관이 생긴다. DB 동작은 실제 DB 테스트(`describeDb`)로 본다
- 가짜(mock)로 바꾼 함수의 결과만 확인하는 테스트. 가짜는 외부 서비스(포트원, 푸시, 카카오)와 시각에만 쓴다
- `it.skip`을 이유 없이 남기는 것. 꼭 필요하면 이유와 다시 켤 조건을 주석으로 적는다

## 1. 가격·할인

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| PRICE-01 | 할인율은 10/20/30/40/50% 중에서 고르고 최저 할인율은 10%다 | S-202 | ✅ | `tests/docs/rule-docs.test.ts` 할인율 선택지와 최저 할인율<br>`src/server/policy/pricing.test.ts` 10/20/30/40/50%이고 가장 낮은 값이 최저 할인율이다 |
| PRICE-02 | 판매가 = 정가 × (1 − 할인율). 100원 단위로 올리지 않고 원 미만은 버린다. 정가 33,500원·30% 할인 → 23,450원 | S-203 | ✅ | `tests/docs/rule-docs.test.ts` 판매가 예시<br>`src/server/policy/pricing.test.ts` 100원 단위로 올리지 않는다<br>`src/server/policy/pricing.test.ts` 원 미만은 버린다 |

## 2. 매물 등록·수정·마감

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| SLOT-01 | 시작이 48시간보다 멀면 예약대기로 저장하고 시작 48시간 전에 게시한다. 딱 48시간이거나 더 가까우면 바로 게시중이다 | S-204·S-205 | ✅ | `src/app/owner/(console)/slots/slot-time.test.ts` 시작 48시간 전이 아직 오지 않았으면<br>`src/app/owner/(console)/slots/slot-time.test.ts` 딱 48시간 남았거나 그보다 가까우면 지금 게시중<br>`src/app/owner/(console)/slots/slot-create-store.db.test.ts` 미리 올리기 |
| SLOT-02 | 시작 시각은 지금 뒤, 14일 안, 30분 단위만 받는다 | S-205·#108 | ✅ | `src/app/owner/(console)/slots/slot-time.test.ts` 14일 정각까지 받고, 넘으면 막는다<br>`src/app/owner/(console)/slots/slot-draft-store.db.test.ts` 지난 시각, 14일 밖, 단위가 안 맞는 시각 |
| SLOT-03 | 같은 샵의 예약대기·게시중·예약됨 매물과 시간이 겹치면 등록할 수 없다. 마감·취소·완료와는 겹쳐도 되고, 끝 시각에 바로 이어지면 겹치지 않는다 | S-209 | ✅ | `src/app/owner/(console)/slots/slot-draft-store.db.test.ts` 예약대기·게시중·예약됨과 겹치면 막고<br>`src/app/owner/(console)/slots/slot-time.test.ts` 끝 시각에 바로 이어지면 겹치지 않는다<br>`src/db/slot-windows.db.test.ts` 한 시술 매물은 예약대기·게시중 시간대와 겹치면 |
| SLOT-04 | 매물은 영업시간 안에서 끝나야 한다. 쉬는 날은 막고, 영업시간을 입력하지 않은 요일은 막지 않는다. 새벽 영업(18:00~02:00), 자정 마감(닫는 시각 00:00), 24시간(여는 시각 = 닫는 시각)을 받는다 | #332 | ✅ | `src/app/owner/(console)/slots/slot-draft-store.db.test.ts` 영업시간을 입력한 요일은 영업시간 안에 끝나야 하고<br>`src/app/owner/(console)/slots/slot-time.test.ts` 다음 날 새벽까지<br>`src/app/owner/(console)/slots/slot-time.test.ts` 자정 마감: 닫는 시각 00:00은 그 날 밤 12시<br>`src/app/owner/(console)/slots/slot-time.test.ts` 24시간: 여는 시각부터 다음 날 같은 시각까지 |
| SLOT-05 | 입점 승인된 샵만 매물을 등록한다. 고객에게는 승인 샵의 매물만 보이고 홀딩된다 | S-102·A-101 | ✅ | `src/server/shops/review-store.test.ts` assertShopApproved는 승인된 샵만 통과시킨다<br>`src/features/map/slot-list/queries.db.test.ts` 승인 샵의 게시중 매물만<br>`src/server/payments/hold-store.db.test.ts` 승인되지 않은 샵의 매물 |
| SLOT-06 | 예약대기·게시중 매물만 수정·마감할 수 있다. 예약됨, 다른 고객이 결제 중, 시작이 지난 매물은 막는다 | S-206 | ✅ | `src/features/slot-status/slot-status.test.ts` 게시중이어도 다른 고객이 홀딩 중이면<br>`src/app/owner/(console)/slots/slot-edit-store.db.test.ts` 예약됨·결제 중·이미 마감·시작 지남 |
| SLOT-07 | 마감은 사유(다른 곳 예약·잘못 올림·기타)와 시각을 남기고, 지우기는 없다. 마감한 시간에는 새 매물을 올릴 수 있다 | S-206 | ✅ | `src/app/owner/(console)/slots/slot-edit-store.db.test.ts` 게시중·예약대기 매물을 사유·시각과 함께 마감하고 |
| SLOT-08 | 게시중 매물은 48시간 밖으로 옮기지 못한다. 예약대기 매물을 옮기면 게시 시각을 새 시작 48시간 전으로 다시 정한다 | S-205 | ✅ | `src/app/owner/(console)/slots/slot-edit-store.db.test.ts` 게시중 매물은 48시간 밖으로 옮기지 못한다<br>`src/app/owner/(console)/slots/slot-edit-store.db.test.ts` 예약대기 매물은 14일 안의 먼 시각으로 옮기면 |

## 3. 매물 상태

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| STATUS-01 | 상태 이름은 예약대기·게시중·예약됨·마감·취소·완료 6가지만 쓴다 | X-301 | ✅ | `src/features/slot-status/slot-status.test.ts` 6개 상태를 화면 이름으로 보여준다 |
| STATUS-02 | 게시 시각 전 예약대기는 예약대기, 팔리지 않고 시작이 지난 게시중은 마감으로 계산한다. DB 조회와 화면 계산이 같은 답을 낸다 | S-401 | ✅ | `src/app/owner/(console)/dashboard/dashboard.test.ts` 시작이 지난 게시중은 마감<br>`src/features/slot-status/slot-status-sql.test.ts` 순수 함수와 같은 답을 내고 |
| STATUS-03 | 노쇼는 매물 상태가 아니다. 방문·노쇼를 처리하면 매물은 완료가 되고, 노쇼 여부는 예약에 남긴다 | S-405 | ✅ | `src/server/visits/visit-store.db.test.ts` 매물은 완료로 한 번에 바꾼다 |
| STATUS-04 | 결제 없이 홀딩이 끝난 시간대 칸(hold_released)은 원장님 대시보드, 운영자 매물 목록, 원장님 매물 수에서 뺀다. 다른 사유로 마감한 매물은 보인다 | #308 ④ | ✅ | `src/app/owner/(console)/dashboard/dashboard-store.db.test.ts` 결제 없이 홀딩이 끝나 마감된 매물(hold_released)은 빼고<br>`src/app/admin/reservations/queries.db.test.ts` 어느 상태로 걸러도 보이지 않고<br>`src/app/admin/users/queries.db.test.ts` 매물 수는 결제 없이 비운 시간대 칸 |

## 4. 고객에게 보이기

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| SHOW-01 | 신규 고객 전용 매물은 그 샵에서 결제·이용 이력이 있는 고객에게 목록과 상세에서 보이지 않고, 홀딩과 결제도 막는다. 판별은 서버가 한다 | C-306·X-104 | ✅ | `src/features/map/slot-list/queries.db.test.ts` 신규 고객 전용 매물은 그 샵 이력이 있는 고객에게 보이지 않는다<br>`src/app/(customer)/(tabs)/slots/[slotId]/queries.db.test.ts` 신규 고객 전용은 그 샵 이력이 있는 고객에게만 null<br>`src/server/payments/hold-store.db.test.ts` 신규 고객 전용 매물은 그 샵 이력이 있으면 NEW_CUSTOMER_ONLY<br>`src/server/payments/checkout.test.ts` 신규 고객 전용은 결제 직전에 다시 확인한다 |
| SHOW-02 | 시작까지 6시간 미만이면 임박·환불 불가로 표시하고, 딱 6시간이면 표시하지 않는다 | C-203·C-308 | ✅ | `src/features/map/slot-list/badges.test.ts` 6시간 미만이면 환불 불가·임박, 딱 6시간이면 없음<br>`src/server/policy/slot-time.test.ts` 딱 6시간 남았으면 임박·환불 불가가 아니다 |
| SHOW-03 | 다른 고객이 홀딩 중인 매물은 목록에 그대로 두고 "결제 중"으로 표시한다. 내 홀딩과 끝난 홀딩은 표시하지 않고, 서버 시각으로 판단한다 | C-404 | ✅ | `src/features/map/slot-list/badges.test.ts` 다른 고객이 홀딩 중이면 결제 중 배지<br>`src/features/map/slot-list/queries.db.test.ts` 배지는 서버 시각으로 |
| SHOW-04 | 매물 상세에는 접힌 "환불 규정" 한 줄만 두고, 규정 문구는 결제 동의 문구와 글자까지 같다 | C-305·C-402 | ✅ | `src/app/(customer)/(tabs)/slots/[slotId]/detail-format.test.ts` 결제 동의 문구(consent-texts.md 3장)와 글자까지 같다 |

## 5. 홀딩·결제

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| HOLD-01 | [예약하기]를 누르면 서버 시각으로 10분 홀딩하고, 만료 시각과 서버 시각을 화면에 준다 | C-404·X-304 | ✅ | `tests/docs/rule-docs.test.ts` 홀딩·게시·리마인드 시각<br>`src/server/payments/checkout.test.ts` 트랜잭션 안에서 서버 시각으로 홀딩하고 |
| HOLD-02 | 두 고객이 같은 매물을 동시에 누르면 한 명만 홀딩된다 | X-304 | ✅ | `src/server/payments/hold-concurrency.db.test.ts` 두 고객이 같은 매물을 동시에 누르면 한 명만 홀딩된다 |
| HOLD-03 | 한 고객은 동시에 매물 1개만 홀딩한다 | C-404 | ✅ | `src/server/payments/hold-concurrency.db.test.ts` 한 고객이 두 매물을 동시에 누르면 하나만 홀딩된다<br>`src/server/payments/checkout.test.ts` ALREADY_HOLDING에는 지금 홀딩 중인 매물 id가 붙는다 |
| HOLD-04 | 홀딩은 만료 시각과 같거나 지나면 풀린다. 내 홀딩이 아니거나 끝났으면 결제할 수 없다 | C-404 | ✅ | `src/features/slot-status/slot-status.test.ts` 만료 시각과 같거나 지나면 홀딩이 풀린다<br>`src/server/payments/checkout.test.ts` 내 홀딩이 끝났으면 HOLD_EXPIRED |
| HOLD-05 | 환불 규정 필수 동의 없이는 결제할 수 없고(서버도 막는다), 주문에 동의 문구 버전과 시각을 남긴다 | C-402 | ✅ | `src/server/payments/checkout.test.ts` 필수 동의가 빠지면 CONSENT_REQUIRED<br>`src/server/payments/order-store.db.test.ts` 결제 대기 주문에 금액과 동의 2개의 버전·시각을 남긴다<br>`src/app/(customer)/(focus)/checkout/[slotId]/checkout-texts.test.ts` 필수 동의 2개가 문서 문구와 같다 |
| HOLD-06 | 같은 주문을 동시에 두 번 확인해도 예약은 하나다 | W11 | ✅ | `src/server/payments/confirm-concurrency.db.test.ts` 같은 주문을 동시에 두 번 확인해도 예약은 하나 |
| HOLD-07 | 원장님 모드로는 예약·결제할 수 없다 | X-101 | ✅ | `src/server/auth/require.test.ts` 원장님 모드면 WRONG_MODE |
| HOLD-08 | 예약이 확정되면 고객과 원장님에게 각자의 문구로 알린다 | #131 | ✅ | `src/server/notifications/alerts.test.ts` 고객과 원장님에게 각자의 문구와 주소로 보낸다 |
| HOLD-09 | 지금 내 홀딩(결제 중 막대)은 만료 전인 내 홀딩 하나만 보여 준다. 남의 홀딩, 끝난 홀딩, 예약된 매물은 보이지 않고, 로그인 안 함·원장님 모드·고객 계정 없음은 오류 없이 "없음"이다 | C-404·#363 | ✅ | `src/server/payments/hold-store.db.test.ts` 지금 내 홀딩: 살아 있는 내 홀딩만<br>`src/server/payments/checkout.test.ts` 로그인 안 함·원장님 모드·고객 계정 없음도 오류가 아니라 null |

## 6. 고객 취소·환불

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| CANCEL-01 | 위약금은 서비스 시작까지 남은 시간으로 정한다. 24시간 이상 30%(70% 환불), 6시간 이상 24시간 미만 50%, 6시간 미만 100%(환불 불가). 딱 24시간이면 30%, 딱 6시간이면 50% | X-202 | ✅ | `tests/docs/rule-docs.test.ts` 고객 취소 위약금 경계<br>`src/server/policy/values.test.ts` 24시간 이상 30%, 6시간 이상 50%, 그 미만 100%<br>`src/app/(customer)/(tabs)/slots/[slotId]/detail-format.test.ts` 위 구간이다(딱 6시간 남으면 50% 환불) |
| CANCEL-02 | 환불 = 실제 결제액 − 위약금. 위약금은 원 미만을 버려서 손님이 표시한 비율 이상을 돌려받는다. 23,457원 → 위약금 7,037원·환불 16,420원, 23,455원 → 위약금 7,036원·환불 16,419원 | 정산 예시 2장 | ✅ | `tests/docs/rule-docs.test.ts` 고객 취소 위약금은 원 미만을 버리고<br>`src/server/refunds/calc-refund.test.ts` 원 미만이 생기면 위약금을 버려서 |
| CANCEL-03 | 30시간 전 취소(10% 할인, 45,000원 결제): 31,500원 환불, 원장님 기준 금액 13,500원. 쿠폰 3,000원을 썼으면(42,000원 결제) 쿠폰은 돌려주지 않고 29,400원 환불, 원장님 기준 금액은 그대로 13,500원 | 정산 예시 3장·C-407 | ✅ | `tests/docs/rule-docs.test.ts` 3장·4장 고객 취소 표<br>`src/server/refunds/calc-refund.test.ts` 쿠폰 3,000원을 쓴 결제(42,000원)는 결제액 기준 환불 |
| CANCEL-04 | 6시간 미만이나 시작 뒤에는 화면뿐 아니라 서버도 취소를 막는다 | X-202 | ✅ | `src/server/refunds/cancel.test.ts` 6시간 미만·시작 뒤면 NOT_REFUNDABLE(서버도 막는다) |
| CANCEL-05 | 취소를 두 번 눌러도 환불은 한 번이고, 결과를 모르면 정리 작업이 마무리한다 | W14 | ✅ | `src/server/refunds/cancel.test.ts` 다른 요청이 같은 취소를 시작했으면(두 번 누름)<br>`src/server/payments/confirm-concurrency.db.test.ts` 자동 취소를 동시에 두 번 기록해도 환불 기록은 한 줄이다 |
| CANCEL-06 | 고객이 취소하면 원장님에게 재등록을 묻고(시작 전일 때만), 같은 조건의 새 매물을 바로 게시한다. 취소된 매물은 '취소'로 남고, 같은 매물로 두 번 재등록하지 못한다 | S-400·S-408 | ✅ | `src/server/notifications/alerts.test.ts` 고객 취소: 시작 전이면 원장님에게만 재등록 화면으로<br>`src/app/owner/(console)/slots/relist.test.ts` 취소됐고 시작 전이고 아직 재등록하지 않은 매물만<br>`src/app/owner/(console)/slots/relist-store.db.test.ts` 같은 매물로 두 번 재등록하지 못한다 |

## 7. 합의 후 취소

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| AGREED-01 | 손님 환불 = 실제 결제액 × 50%, 원장님 기준 금액 = 판매가 × 50%. 쿠폰은 돌려주지 않고 패널티·보상 쿠폰은 없다. 45,000원 결제 → 22,500원 환불, 쿠폰을 쓴 42,000원 결제 → 21,000원 환불, 원장님 정산은 둘 다 21,758원 | X-208·정산 예시 3장 | ✅ | `tests/docs/rule-docs.test.ts` 3장 합의 후 취소 표<br>`src/server/refunds/agreed-cancel-rules.test.ts` 쿠폰을 썼으면 손님 환불은 실제 결제액 기준 |
| AGREED-02 | 원장님이 요청하면 손님에게 알리고, 손님이 앱에서 동의해야 취소된다. 거절하거나 24시간 안에 답하지 않으면 예약은 그대로다 | S-410·C-506 | ✅ | `src/server/refunds/agreed-cancel.test.ts` 새 요청(24시간)을 저장하고 고객에게 알린다<br>`src/server/refunds/agreed-cancel.test.ts` 동의하지 않으면 거절로 바꾸고 원장님에게 알린다(예약은 그대로)<br>`src/server/refunds/agreed-cancel.test.ts` 만료 시각 뒤에는 막는다(저장 전이라도) |
| AGREED-03 | 답을 기다리는 요청은 한 번에 하나이고, 거절되거나 24시간이 지나면 다시 요청할 수 있다(횟수 제한 없음) | #301 | ✅ | `src/server/refunds/agreed-cancel.test.ts` 답을 기다리는 요청이 이미 있으면(unique) ALREADY_REQUESTED<br>`src/server/refunds/agreed-cancel.test.ts` 거절된 요청 뒤에는 다시 요청할 수 있다 |
| AGREED-04 | 예정 예약일 때만 요청한다(서비스 시작 뒤 포함, 방문·노쇼 처리 전) | X-208 | ✅ | `src/server/refunds/agreed-cancel-rules.test.ts` 예정 예약이고 방문·노쇼 처리 전일 때만 |
| AGREED-05 | 동의했는데 환불이 안 되면 요청은 다시 답 기다림으로 돌아간다. 손님 직접 취소와 겹쳐도 환불은 한 번이다 | #346·#348 | ✅ | `src/server/refunds/agreed-cancel.test.ts` 결제사가 거절했고 돌아간 돈이 없으면<br>`src/server/refunds/agreed-cancel.test.ts` 손님 직접 취소 환불이 먼저 들어와 있으면 RESERVATION_CHANGED(환불은 한 번)<br>`src/server/refunds/agreed-cancel-store.db.test.ts` 진행 중 기록 지우기와 요청 되돌리기를 한 번에 |
| AGREED-07 | 결제액이 홀수라 50%에 원 미만이 생기면 고객 취소처럼 손님 쪽으로 맞춘다(위약금 쪽에서 버림). 23,457원 → 위약금 11,728원, 손님 환불 11,729원 | 11/12 nnoinn·정산 예시 3장 | ✅ | `tests/docs/rule-docs.test.ts` 합의 후 취소 원 미만은 고객 취소처럼 손님 쪽으로<br>`src/server/refunds/agreed-cancel-rules.test.ts` 원 미만은 고객 취소처럼 손님 쪽으로 맞춘다 |
| AGREED-06 | 정산 줄을 만들 때 합의 후 취소의 기준 금액은 판매가 × 50%다(판매가 45,000원 → 22,500원, 원장님 정산 21,758원) | X-208·W20·정산 예시 3장 | ✅ | `src/server/settlements/calc-settlement.test.ts` 합의 후 취소는 판매가 × 50% |

## 8. 원장님 귀책 취소 (P1, 준비 중)

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| OWNER-01 | 남은 시간과 상관없이 결제액 100%를 환불하고, 원장님 기준 금액은 0이다 | X-207 | ✅ | `src/server/refunds/calc-refund.test.ts` 남은 시간과 상관없이 결제액 전액 환불, 원장님 기준 금액 0 |
| OWNER-02 | 고객에게 3,000원 쿠폰(90일)을 주고 쓴 쿠폰은 돌려준다. 원장님 패널티 5,000원은 아직 지급하지 않은 정산금에서 먼저 빼고, 모자라면 다음 정산에서 뺀다 | X-207 | ⏳ | `tests/docs/rule-docs.test.ts` 원장님 귀책 취소의 쿠폰·패널티와 쿠폰 유효기간<br>`src/server/settlements/calc-settlement.test.ts` 모자라면 오래된 것부터 떼고 |

## 9. 방문·노쇼

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| VISIT-01 | 방문 완료·노쇼는 서비스 시작 시각부터 누를 수 있다(딱 시작 시각 포함) | S-405 | ✅ | `src/server/visits/rules.test.ts` 예약됨이고 시작 시각이 되면 처리할 수 있다(딱 시작 시각 포함) |
| VISIT-02 | 처리한 뒤에는 원장님이 바꿀 수 없고, 방문 완료와 노쇼를 동시에 눌러도 하나만 처리된다 | S-405 | ✅ | `src/server/visits/rules.test.ts` 이용 완료이거나 방문 결과가 있으면 ALREADY_RECORDED<br>`src/server/visits/visit-concurrency.db.test.ts` 방문 완료와 노쇼를 동시에 눌러도 하나만 처리되고 |
| VISIT-03 | 노쇼는 위약금 100%이고 결제 금액은 정산 대상이다(판매가 기준, 이용 완료와 같은 계산) | S-406 | ✅ | `src/server/settlements/calc-settlement.test.ts` 노쇼는 이용 완료와 같은 계산(판매가 기준, 위약금 100%) |
| VISIT-04 | 노쇼로 처리되면 고객에게 알린다(잘못 처리됐으면 이의제기할 수 있게) | #130 | ✅ | `src/server/notifications/alerts.test.ts` 노쇼: 고객에게 그 예약 상세로 |

## 10. 쿠폰

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| COUPON-01 | 결제 1건에 1장이고, 쓴 쿠폰은 다시 쓸 수 없다 | C-407 | ✅ | `src/server/coupons/coupon-store.db.test.ts` 사용 처리는 아직 안 쓴 쿠폰만 한 번 바꾼다 |
| COUPON-02 | 유효기간은 90일이다. 쓸 수 있는 쿠폰만 고를 수 있다(쓴 것·기한 지난 것·남의 쿠폰 제외) | C-407 | ✅ | `src/server/coupons/coupon-store.db.test.ts` 쓸 수 있는 쿠폰만 기한 빠른 순으로 읽는다<br>`src/server/coupons/rules.test.ts` 내 쿠폰이 아니면 NOT_FOUND |
| COUPON-03 | 쓸 수 있는 쿠폰이 여러 장이면 할인이 가장 큰 쿠폰을 골라 둔 채로 예약 확인을 연다(같으면 기한 빠른 순). 다른 쿠폰이나 '쓰지 않음'으로 바꿀 수 있다 | #300 | ✅ | `src/server/coupons/rules.test.ts` 할인 큰 순, 같으면 기한 빠른 순. 첫 번째가 기본 쿠폰 |
| COUPON-04 | 쿠폰 선택·결제 동의·취소 화면에 "쿠폰을 쓴 예약을 취소하면 쿠폰은 돌려드리지 않고, 환불은 실제 결제한 금액 기준"을 보여 준다 | C-407·C-402 | ✅ | `src/app/(customer)/(focus)/checkout/[slotId]/coupon-texts.test.ts` 취소하면 돌려주지 않음<br>`src/app/(customer)/(tabs)/reservations/[reservationId]/cancel-texts.test.ts` 쿠폰 안내는 동의 문구와 같다 |
| COUPON-05 | 원장님 정산은 쿠폰과 상관없이 판매가 기준이다(원장님은 쿠폰 때문에 손해도 이득도 없다) | C-407·X-205 | ✅ | `src/server/settlements/calc-settlement.test.ts` 원장님 정산은 쿠폰과 상관없이 같다(판매가 기준)<br>`tests/docs/rule-docs.test.ts` 3장·4장 이용 완료 표 |

## 11. 이의제기

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| DISPUTE-01 | 접수 기한은 서비스 시작 뒤 영업일 기준 48시간(토·일·공휴일 제외)이다. 방문·노쇼 처리나 취소가 시작보다 늦으면 그때부터 센다 | C-507 | ✅ | `src/server/disputes/rules.test.ts` 처리가 시작보다 늦으면 처리 시각부터 영업일 48시간<br>`src/server/disputes/rules.test.ts` 노쇼를 며칠 늦게 눌러도 그때부터 센다<br>`src/server/policy/holidays.test.ts` 공휴일 하루가 끼면 그만큼 늦어진다 |
| DISPUTE-02 | 한 예약에 한 번만 받고, 시작 전에는 받지 않는다. 고를 수 있는 종류는 예약 상태에 따라 다르다 | #299 | ✅ | `src/server/disputes/dispute.test.ts` 시작 전이면 NOT_OPEN_YET, 이미 접수했으면 ALREADY_SUBMITTED<br>`src/server/disputes/rules.test.ts` 노쇼 예약: 노쇼 이의와 환불 예외<br>`src/db/disputes.db.test.ts` 앱으로 접수한 예약을 카카오톡 채널 건으로 또 등록할 수 없다 |
| DISPUTE-03 | 이의제기 중(확인 중 `open`)인 거래는 결론이 날 때까지 정산하지 않는다. 보류 칸은 따로 없고, 결론을 기록하면(`resolved`) 보류가 저절로 풀린다 | X-206·A-104·#350 | ⏳ | |
| DISPUTE-04 | 카카오톡 채널로 받은 건은 접수 기한 안에 받은 것만 운영자가 채널에서 받은 시각으로 등록하고(등록한 운영자를 남긴다), 기한이 지난 문의는 등록하지 않고 일반 문의로 응대한다. 결론을 기록하면 정산 보류가 풀린다 | A-104·#350 | ✅ | `src/server/disputes/admin.test.ts` 받은 시각이 기한 안이면 고객을 가리지 않고<br>`src/server/disputes/admin.test.ts` 뒤에 받은 문의는 RECEIVED_AFTER_DEADLINE과 기한을 주고<br>`src/server/disputes/admin-store.db.test.ts` 카카오톡 채널 건은 받은 시각·등록한 운영자와 함께 확인 중으로 저장하고<br>`src/server/disputes/admin-store.db.test.ts` 노쇼 취소 결론: 같은 트랜잭션에서 예약을 방문으로 바꾸고 |
| DISPUTE-05 | 돈이 오가는 결론(환불 예외·무효·원장님 귀책 취소로 바꿈)은 처리 기능이 생길 때까지 고를 수 없다(화면은 "준비 중"). 그동안 이의제기는 확인 중으로 남아 정산 보류도 그대로다 | #350 | ✅ | `src/server/disputes/rules.test.ts` 은 처리 기능이 생길 때까지 OUTCOME_NOT_READY<br>`src/server/disputes/admin.test.ts` 돈이 오가는 결론은 OUTCOME_NOT_READY |
| DISPUTE-06 | 카카오톡 채널 건은 등록한 운영자가 꼭 있고 앱 접수는 비어 있다. 결론이면 결론 종류가 꼭 있고 확인 중이면 비어 있다(DB가 막는다) | #350 | ✅ | `src/db/disputes.db.test.ts` 카카오톡 채널 건은 등록한 운영자가 꼭 있고, 앱 접수는 비어 있어야 한다<br>`src/db/disputes.db.test.ts` 결론 종류 6개는 모두 저장된다 |
| DISPUTE-07 | 이의제기 내용은 빈칸(공백만 있는 것 포함)만 막고, 화면에 보이지 않는 상한 5,000자까지 받는다(글자 수는 보여주지 않는다). 화면과 서버가 같은 정책 값을 쓴다 | 11/12 점검 7-4, 11/13 nnoinn | ✅ | `src/server/disputes/rules.test.ts` 앞뒤 공백을 뺀 내용이 빈칸이면 DISPUTE_CONTENT_REQUIRED<br>`src/server/disputes/rules.test.ts` 안전 상한 5,000자까지 받고 넘으면 DISPUTE_CONTENT_TOO_LONG<br>`src/server/disputes/dispute.test.ts` 내용은 한 글자부터 5,000자까지 받고<br>`tests/docs/rule-docs.test.ts` 이의제기 내용의 화면에 보이지 않는 안전 상한 |

## 12. 정산

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| SETTLE-01 | 오픈 기간은 플랫폼 수수료 0%, 결제 수수료는 판매가 × N%(VAT 별도)다. 원장님 정산은 정산 예시 3장 표와 같다(10% 할인 43,515원, 50% 할인 24,175원) | X-205 | ✅ | `tests/docs/rule-docs.test.ts` 3장·4장 이용 완료 표<br>`src/server/settlements/calc-settlement.test.ts` settlement-examples.md 표 숫자 |
| SETTLE-02 | 법인 전환 뒤 할인율별 수수료(10%→10% … 50%→6%)로 바꾸면 정산 예시 4장 표와 같다. 바꾸는 값은 `PLATFORM_FEE_MODE` 하나다 | X-205 | ✅ | `tests/docs/rule-docs.test.ts` 3장·4장 이용 완료 표<br>`src/server/policy/fees.test.ts` 지금은 오픈 기간 방식(launch)이다 |
| SETTLE-03 | 고객 취소 정산의 기준 금액은 판매가 × 위약금 비율(원 미만 버림)이고, 정산 예시 3장·4장 취소 표와 같다(오픈 기간 13,055원) | X-205 | ✅ | `tests/docs/rule-docs.test.ts` 3장·4장 고객 취소 표<br>`src/server/settlements/calc-settlement.test.ts` 고객 취소는 판매가 × 위약금 비율 |
| SETTLE-04 | 원장님 귀책 패널티는 오래된 것부터 떼고, 남은 금액은 다음 정산으로 넘긴다 | X-207 | ✅ | `src/server/settlements/calc-settlement.test.ts` 모자라면 오래된 것부터 떼고, 남은 금액은 다음 정산으로 넘긴다 |
| SETTLE-05 | 정산은 매주 목요일(공휴일이면 다음 영업일) 새벽에, 그날 0시(한국 시간)까지 이의제기 접수 기한이 지났고 이의제기 중이 아닌 거래를 샵 하나 × 지급일 하나로 묶는다. 비율은 그날의 정책값을 쓰고, 패널티를 떼고 0원이면 지급 요청 없이 지급 완료(0원)로 끝내며 원장님 정산 내역에 이유가 보인다 | X-206·#353 | ⏳ | |
| SETTLE-06 | 정산 계좌번호는 암호화해서 저장하고, 화면에는 은행·뒷자리·예금주만 보인다 | S-107 | ✅ | `src/server/payouts/account-crypto.test.ts` 풀면 원래 번호가 나오고, 암호문에는 번호가 보이지 않는다<br>`src/app/owner/(console)/settings/payout/payout-store.db.test.ts` 화면용 조회는 은행·뒷자리·예금주만 돌려준다 |
| SETTLE-07 | 지급일은 매주 목요일이고 공휴일이면 다음 영업일이다. 이의제기 접수 기한이 지급일 0시까지 지난 거래가 그날 지급에 들어가서 원장님은 보통 서비스 뒤 4~8일 안에 받는다(일요일 15시 → 4일 뒤 목요일, 금요일 15시 → 6일 뒤 목요일, 수요일 18시 → 8일 뒤 목요일). 방문·노쇼 처리가 늦으면 처리한 때부터 세고, 이의제기 중이면 보류한다 | X-206·기술 가이드 7장 "정산 주기"·#353 | ✅ | `src/server/settlements/settle-rules.test.ts` 기술 가이드 예시<br>`src/server/settlements/settle-rules.test.ts` 방문 처리가 늦으면 처리한 때부터 센다<br>`src/server/settlements/settle-rules.test.ts` 확인 중 이의제기가 있으면 보류하고 지급일이 없다<br>`src/server/settlements/payout-date.test.ts` 목요일이 공휴일이면 다음 영업일(금요일)에 지급하고 |
| SETTLE-08 | 거래 하나에 정산 줄 하나다. 묶기 작업이 두 번 돌아도 같은 거래로 정산 줄을 두 번 만들 수 없다(DB가 막는다) | #353 | ✅ | `src/db/settlement-items.db.test.ts` 같은 거래로 정산 줄을 두 번 만들 수 없다 |

## 13. 알림

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| NOTI-01 | 예약 리마인드는 시작 2시간 전과 15분 전에 한 번씩 보낸다. 리마인드 때가 지난 뒤 확정된 예약에는 그 리마인드를 보내지 않는다 | C-602 | ✅ | `tests/docs/rule-docs.test.ts` 홀딩·게시·리마인드 시각<br>`src/server/notifications/reminder-store.db.test.ts` 15분 전 구간에 들면 2시간 전 리마인드는 고르지 않는다<br>`src/server/notifications/reminder-store.db.test.ts` 리마인드 때가 지난 뒤 확정된 예약과 이미 보낸 리마인드는 뺀다 |
| NOTI-02 | 관심 동네·찜한 샵 새 매물 알림은 하루 한 번 오후 1시에 지난 24시간 매물을 모아 보내고, 밤 9시~아침 8시에는 보내지 않는다 | C-601·C-209 | ✅ | `src/server/notifications/digest.test.ts` 밤 시간에는 아무것도 읽지 않고 보내지 않는다<br>`src/server/notifications/digest.test.ts` 24시간 안에 게시된 매물을 모아 하루 한 번<br>`src/server/policy/values.test.ts` 관심 지역 알림 시각은 야간 금지 시간이 아니다 |
| NOTI-03 | 그 알림은 따로 동의한 고객에게만 보낸다(이벤트·혜택 광고성 동의와 따로 받는다) | 11/8 | ✅ | `src/server/notifications/digest-store.db.test.ts` 동의·알림 기기·관심 동네나 찜이 있고 오늘 아직 받지 않은 고객만 고른다<br>`src/server/auth/account-store.test.ts` 관심 동네·찜한 샵 알림만 고르면 광고성(marketing) 기록은 남기지 않는다 |
| NOTI-04 | 한 기기에서 고객·원장님 알림을 모두 켤 수 있고, 지금 들어와 있는 계정과 상관없이 켜 둔 계정의 알림을 모두 받는다 | 11/1 | ✅ | `src/server/notifications/notify.test.ts` 켜 둔 기기마다 보내고 기록을 남긴다<br>`src/server/notifications/subscription-store.db.test.ts` 두 계정 모두 지운다 |
| NOTI-05 | 푸시 알림을 켠 기기가 없어도 알림은 모두 기록되어 그 계정의 알림함(최근 90일)에 남는다. 켠 기기가 없으면 소리·배너 없이 쌓이기만 한다 | #371, 11/13 nnoinn | ⏳ | |
| NOTI-06 | 알림이 생기면 투리를 보고 있는 화면에 기본으로 화면 위 가운데 안내(5초)가 뜬다(푸시 알림을 켰는지와 상관없이, 켜지 않은 기기도 1분 안에). 크롬 계열은 그때 기기 알림을 띄우지 않는다 | #371, 11/13 nnoinn | ⏳ | |
| NOTI-07 | 알림함과 안 읽은 수에는 지금 계정(고객/원장님)의 알림만 보인다 | #371, X-102 | ⏳ | |

## 14. 계정·권한·개인정보

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| AUTH-01 | 고객 계정을 만들 때 휴대폰 번호가 필수다(문자 인증은 하지 않는다) | C-104 | ✅ | `src/server/auth/customer-account.test.ts` PHONE_REQUIRED이고 저장하지 않는다 |
| AUTH-02 | 같은 로그인 정보 아래 고객 계정과 원장님 계정을 따로 만들고, 어느 계정으로 들어왔는지는 로그인 때 고른 모드로 서버가 판단한다 | X-101 | ✅ | `src/server/auth/current-account.test.ts` 같은 로그인 정보의 고객 계정도 같이 읽는다<br>`src/server/auth/require.test.ts` 고객 모드면 WRONG_MODE |
| AUTH-03 | 고객은 본인 예약만, 원장님은 본인 샵·예약만, 관리자는 전체를 본다 | X-102 | ✅ | `src/server/refunds/cancel.test.ts` 없거나 남의 예약이면 RESERVATION_NOT_FOUND<br>`src/server/auth/require.test.ts` 다른 샵이면 FORBIDDEN<br>`src/server/auth/require.test.ts` 관리자면 계정 종류와 상관없이 통과한다 |
| AUTH-04 | 원장님은 다른 샵의 메뉴·사진·예약을 보거나 바꿀 수 없다 | X-102 | ✅ | `src/app/owner/(console)/settings/menu/menu-store.db.test.ts` 다른 샵의 메뉴는 고치거나 숨기거나 옮길 수 없다<br>`src/app/owner/(console)/settings/images/shop-images-store.db.test.ts` 다른 샵 사진은 지우거나 옮기거나 메뉴를 바꿀 수 없다<br>`src/app/owner/(console)/reservations/reservation-detail-store.db.test.ts` 다른 샵 예약, 없는 id, 모양이 틀린 id는 null |
| AUTH-05 | 운영자가 개인정보가 보이는 화면을 볼 때마다 열람 기록을 남기고, 기록을 못 남기면 화면이 개인정보를 보여 주지 않는다 | #269 | ✅ | `src/server/admin/access-log.test.ts` 기록을 넣지 못하면 오류를 던진다 |
| AUTH-06 | 팀 접속 코드가 켜져 있으면 코드를 넣기 전에는 모든 화면이 잠금 화면으로 간다. 코드를 바꾸면 전에 받은 입장은 통하지 않는다 | #303 | ✅ | `src/lib/site-lock.test.ts` 입장하지 않았으면 화면 요청을 잠금 화면으로 보내고<br>`src/proxy.test.ts` 코드를 바꾸면 전에 받은 쿠키로는 들어오지 못한다 |
| AUTH-07 | 카카오·구글 간편 로그인으로 실제로 들어가고 나온다(외부 로그인 화면이라 로봇이 누르지 않는다) | C-101 | 🖐 | |
| AUTH-08 | 로그아웃하면 고객·원장님 모두 첫 화면(/, 로그인과 로그인 없이 둘러보기)이 새로 열리고, 뒤로 가기로 로그인한 화면이 다시 보이지 않는다 | 11/12 점검 9-1 | ⏳ | |
| AUTH-09 | 운영자 화면은 운영자 입구(/admin/login)에서 운영자로 로그인해야 열린다. 고객·원장님으로 로그인해 있어도 열리지 않고, 운영자 권한이 없으면 운영자 로그인을 거절한다. 운영자 함수도 운영자 모드에서만 통과한다(AUTH-03의 "관리자"가 이렇게 바뀐다) | #372, 11/13 nnoinn | ⏳ | |
| AUTH-10 | 운영자가 데이터를 바꾸면 같은 트랜잭션에서 처리 기록(누가·언제·무엇을·사유)이 남고, 처리 기록과 열람 기록은 앱에서 고치거나 지울 수 없다 | #372·#373 | ⏳ | |
| AUTH-11 | 운영자 회원 상세에서도 휴대폰 번호·이메일은 가려서 보여주고, [번호 보기]를 누를 때만 서버에서 받아 보여준다. 누른 것도 열람 기록에 남는다 | 11/12 점검 8-2, 11/13 nnoinn | ⏳ | |
| AUTH-12 | 고객 계정을 만들 때 이름이 필수다(앞뒤 공백 빼고 1~30자). 예약한 샵에는 예약자 이름과 휴대폰 번호만 보인다(닉네임은 주지 않는다) | #375, 11/13 nnoinn | ⏳ | |
| AUTH-13 | 원장님은 자기 계정 이력만 보고, 운영자는 원장님·고객 계정 이력을 모두 본다. 운영자가 이력을 보면 열람 기록에 남는다 | #374, 11/13 nnoinn | ⏳ | |

## 15. 시간대 매물 (#308, 진행 중)

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| WINDOW-01 | 시작 시각은 30분마다 고르고, 끝이 시간대를 넘지 않으며, 지난 시각은 뺀다 | #308 | ✅ | `src/server/slot-windows/starts.test.ts` 시작은 30분마다 16:00까지 |
| WINDOW-02 | 시간대는 30분 단위, 지금 뒤·14일 안이고, 같은 샵의 예약대기·게시중·예약됨 매물과 겹치지 않아야 한다 | #308 | ✅ | `src/server/slot-windows/rules.test.ts` 시작·끝은 30분 단위, 시작은 지금 뒤·14일 안<br>`src/db/slot-windows.db.test.ts` 시간대는 예약대기·게시중·예약됨 매물과 겹치면 막힌다 |
| WINDOW-03 | 등록은 켠 묶음마다 시간대 한 줄과 올릴 때 서비스 값(이름·정가·소요 시간·할인가)을 한 번에 저장한다. 확인 뒤 같은 샵의 매물·시간대가 같은 시간을 먼저 차지하면 "같은 시간에 이미 올린 매물이나 시간대가 있어요"로 막는다. 마감은 사유·시각을 남기고, 이미 마감했거나 끝난 시간대는 막는다(#344의 "진짜 버전 전에는 저장한 것처럼 성공하지 않는다"를 진짜 버전으로 바꿈) | #308 ① | ✅ | `src/server/slot-windows/owner-store.db.test.ts` 묶음마다 시간대 한 줄과 올릴 때 서비스 값을 저장하고<br>`src/server/slot-windows/owner-store.db.test.ts` 같은 샵의 예약대기·게시중·예약됨 매물이나 시간대와 겹치면<br>`src/server/slot-windows/windows.test.ts` 확인 뒤 다른 요청이 같은 시간을 먼저 저장해서 DB가 막으면 WINDOW_OVERLAP<br>`src/server/slot-windows/owner-store.db.test.ts` 마감: 내 샵의 끝나지 않은 시간대만 |
| WINDOW-04 | [예약하기]로 시간대 안에 매물 한 칸을 만들어 10분 홀딩한다(올릴 때 서비스 값, 한 사람 한 개, 신규 고객 전용). 결제 없이 끝난 칸은 마감(hold_released)으로 닫는다: 손님이 [취소]하면 바로, 다른 손님이 그 시간을 고르면 그때, 나머지는 10분마다 결제 정리 작업이. 결제 대기 주문이 있으면(결제는 했는데 확인이 늦는 경우) 결과가 나올 때까지 닫지 않고 그 시간을 막는다 | #308 ③ | ✅ | `src/server/slot-windows/hold-store.db.test.ts` 고른 서비스·시작 시각으로 시간대 안에 매물 한 칸을 만들어 10분 홀딩한다<br>`src/server/slot-windows/hold-store.db.test.ts` 같은 서비스·시각을 다시 누르면 그 홀딩 그대로<br>`src/server/slot-windows/hold-store.db.test.ts` 결제 없이 홀딩이 끝난 칸은 다른 손님이 고를 때 마감<br>`src/server/slot-windows/hold-store.db.test.ts` 결제 정리 작업: 결제 없이 홀딩이 끝난 시간대 칸만 닫고<br>`src/server/payments/hold-store.db.test.ts` 시간대 안에서 만든 칸은 풀면 홀딩만 비우지 않고<br>`src/server/slot-windows/windows.test.ts` 확인 뒤 다른 손님이 같은 시간을 먼저 홀딩해서 DB가 막으면 |
| WINDOW-05 | 고객 목록·상세에는 게시 시각이 지났고 끝나지 않은 예약대기·게시중 시간대만 보인다(승인된 샵). 서비스마다 그 샵의 예약됨·결제 중인 시간을 뺀 시작 가능 시각을 주고, 남은 시간에 들어가는 서비스가 없으면 목록·상세에서 내린다. 필터를 걸면 카드 요약(서비스 수·첫 서비스·할인율·최저가·가장 빠른 시작)은 필터에 맞는 서비스로만 계산한다. 신규 고객 전용 시간대는 그 샵에 이력이 있는 고객에게 보이지 않는다 | #308 ②·C-306 | ✅ | `src/server/slot-windows/store.db.test.ts` 고객에게 보이는 시간대: 게시 시각이 지났고 끝나지 않은 예약대기·게시중 시간대만<br>`src/server/slot-windows/store.db.test.ts` 신규 고객 전용 시간대는 그 샵에 확정·이용 완료 예약이 있는 고객에게 보이지 않는다<br>`src/server/slot-windows/queries.db.test.ts` 예약됨·결제 중 매물을 뺀 시작 가능 시각으로 카드와 상세를 만들고<br>`src/server/slot-windows/view.test.ts` 남은 시간에 들어가는 서비스가 없으면<br>`src/server/slot-windows/view.test.ts` 필터를 걸면 요약은 필터에 맞는 서비스로만 계산한다 |
| WINDOW-06 | 원장님이 시간대를 마감할 때 그 안에서 손님이 결제 중이면 그 칸만 남기고 나머지를 바로 닫는다. 남긴 칸은 마감 화면에서 바로 알리고, 결제하면 예약으로 남으며(원장님 새 예약 알림에 "마감 전에 결제를 시작한 손님"), 결제 없이 끝나면 그 칸도 닫고 원장님에게 알린다 | #308, 11/13 nnoinn | ⏳ | |
| WINDOW-07 | 원장님 ② 서비스: 소요 시간이 켜진 가장 긴 묶음보다 긴 서비스는 고를 수 없고, 딱 같으면 고를 수 있다. 짧은 묶음에만 안 들어가는 서비스는 고를 수 있다(그 묶음에서는 고객에게 보이지 않는다) | #308 | ✅ | `src/app/owner/(console)/slots/window/window-draft.test.ts` 소요 시간이 가장 긴 묶음보다 길면 고를 수 없고<br>`src/app/owner/(console)/slots/window/window-draft.test.ts` 짧은 묶음에만 안 들어가는 서비스는 고를 수 있고 |
| WINDOW-08 | 손님이 결제 중인 시간대 칸(아직 예약 전)과 결제 없이 비운 칸은 원장님이 올린 매물이 아니라서 운영자 매물 목록·원장님 매물 수에서 빼고(`ownerListedSlot`), 결제가 끝난 칸은 예약으로 보인다. 원장님 대시보드·예약 현황도 같은 조건을 쓴다 | #308 ③·11/11 결정 ④ | ✅ | `src/server/slots/visibility.db.test.ts` 원장님이 올린 매물과 결제가 끝난 시간대 칸만 보이고<br>`src/app/admin/reservations/queries.db.test.ts` 손님이 결제 중인 시간대 칸 |

## 16. 한 바퀴 흐름 (서버 흐름 ②·브라우저 ③에서 자동으로)

여러 기능이 이어지는 흐름이다. 지금은 손 점검 체크리스트로 보고, 서버 흐름 테스트(②, 실제 서버 함수를 테스트 DB에서 차례로)와 브라우저 테스트(③, 결제사는 가짜)로 옮긴다.

| ID | 시나리오와 기대 | 근거 | 상태 | 테스트 |
| --- | --- | --- | --- | --- |
| FLOW-01 | 손님: 목록 → 상세 → [예약하기] 10분 홀딩 → 결제 → 예약 확정 알림(손님·원장님) → 내 예약 → 30시간 전 취소 → 70% 환불, 원장님에게 재등록 안내 | C-404·X-202 | ⏳ | |
| FLOW-02 | 원장님: 가입·입점 신청 → 운영자 승인 → 매물 등록(예약대기·게시중) → 대시보드 → 예약 → 시작 뒤 방문·노쇼 처리 → 매물 완료 | S-101·A-101·S-405 | ⏳ | |
| FLOW-03 | 합의 후 취소: 원장님 요청 → 손님 알림 → 동의 → 결제액 50% 환불·예약 취소, 거절과 24시간 만료는 예약 그대로 | X-208 | ⏳ | |
| FLOW-04 | 홀딩 경쟁: 두 손님이 같은 매물을 누르면 한 명만 홀딩되고, 다른 손님에게는 "결제 중"이 보이며, 10분이 지나면 다른 손님이 홀딩할 수 있다 | X-304 | ⏳ | |
| FLOW-05 | 이의제기 → 정산 보류 → 운영자 결론 → 보류 해제 → 목요일 정산에 들어간다 | A-104·X-206 | ⏳ | |
| FLOW-06 | 실제 포트원 테스트 결제창으로 결제하고 환불까지 확인한다(결제사 화면이라 로봇이 누르지 않는다) | W11·W14 | 🖐 | |
| FLOW-07 | 웹 푸시가 실제 기기(PC·폰)에 뜨고, 누르면 맞는 화면이 열린다 | W16 | 🖐 | |
