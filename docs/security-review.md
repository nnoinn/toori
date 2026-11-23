# 권한·개인정보 점검표 (사이클 계획 2단계 "통합 검증", 11/22 시작)

손님은 본인 예약만, 원장님은 본인 샵·예약만, 운영자는 전체 데이터에 접근한다(X-102). 서버 코드가 이 규칙을 모두 지키는지 이 문서 한 곳에 적고, 빠진 곳은 테스트와 함께 고친다. 2단계는 이 표의 모든 줄이 ✅가 되면 끝난다(docs/roadmap.md "사이클 계획").

## 적는 법

- 서버 함수(`'use server'` 파일의 `export async function`)와 API 경로(`src/app/api/**/route.ts`)마다 한 줄씩 적는다. 화면 폴더의 조회 함수(`queries.ts`처럼 페이지가 부르는 것)도 적는다
- 열
  - **함수**: 이름과 파일
  - **누가**: 역할을 확인하는 코드(`requireCustomer`, `requireShopOwner`, `requireAdmin`, 서명·비밀값 확인 등). 누구나 부를 수 있게 둔 것이면 "누구나"와 이유
  - **어떤 데이터만**: 본인·본인 샵을 어디서 정하는지. 세션에서 정하면 "세션", 입력으로 받은 id를 쓰면 그 id가 본인 것인지 어디서 확인하는지
  - **테스트**: 남의 데이터로 부르면 막히는지 보는 테스트의 파일과 이름(예: 다른 손님 예약 id → `RESERVATION_NOT_FOUND`)
  - **상태**: ✅(막는 코드와 테스트가 모두 있음) / 고칠 것(무엇이 빠졌는지)
- 입력으로 받은 id(예약·매물·샵·쿠폰 id)로 남의 데이터를 읽거나 바꿀 수 있으면 안 된다. 그런 줄은 막는 테스트를 하나씩 둔다
- 고친 것은 PR 하나에 묶지 말고 영역별로 작게 올린다. 이 표도 같은 PR에서 고친다

## 1. 공통 서버 코드·API·운영자 화면 — 강규민

`src/server/**`(28개 파일, 함수 76개), `src/app/api/**`(경로 8개), `src/app/admin/**`(4개 파일, 함수 8개). 돈이 오가는 것(결제 확인·취소·환불·무효·정산·쿠폰)부터, 그다음 홀딩·이의제기·알림·나머지 순서로 본다. API는 웹훅 서명, 예약 작업(cron) 비밀값, 로그인 콜백을 본다.

진행(11/23 강규민): ① 돈이 오가는 함수(결제·홀딩·고객 취소·합의 후 취소·원장님 사정 취소·무효·결제 꼬인 건·정산 내역·정산서·정산 보류·쿠폰)와 웹훅·결제 정리·정산 묶기 API는 아래 줄로 확인했다. 다음은 ② 시간대·매물 운영자 처리·방문·이의제기, ③ 계정·로그인·업로드·입점 심사·알림·운영자 화면 조회와 나머지 API.

| 함수 | 누가 | 어떤 데이터만 | 테스트 | 상태 |
| --- | --- | --- | --- | --- |
| `holdSlot`·`releaseHold`(`src/server/payments/checkout.ts`, [예약하기]·홀딩 풀기) | `requireCustomer` | 세션 고객으로 홀딩한다. 매물은 공개 매물이라 누구나 고를 수 있고, 다른 고객이 홀딩 중이면 막는다. 풀기는 내 홀딩만 | `src/server/payments/checkout.test.ts` 로그인·고객 모드 실패는 그대로 돌려준다<br>`src/server/payments/checkout.test.ts` 다른 고객의 홀딩은 풀지 않는다 | ✅ |
| `getMyActiveHold`·`getMyHold`(같은 파일, 결제 중 표시·예약 확인 화면) | `requireCustomer` | 세션 고객의 홀딩만. 남의 홀딩이면 null이라 누가 홀딩했는지 주지 않는다 | `src/server/payments/checkout.test.ts` 로그인 안 함·원장님 모드·고객 계정 없음도 오류가 아니라 null이고 DB를 읽지 않는다<br>`src/server/payments/checkout.test.ts` 다른 고객 홀딩 → null | ✅ |
| `previewCheckoutAmount`·`startPayment`(같은 파일, 금액 미리보기·결제 대기 주문) | `requireCustomer` | 세션 고객이 홀딩한 매물만(남의 홀딩은 `NOT_HOLDER`). 쿠폰 id는 세션 고객의 쿠폰만(남의 쿠폰은 `NOT_FOUND`). 금액은 서버가 정한다 | `src/server/payments/checkout.test.ts` previewCheckoutAmount: 내 홀딩이 아니면 NOT_HOLDER<br>`src/server/payments/checkout.test.ts` 홀딩한 적이 없거나 다른 고객이 홀딩했으면 NOT_HOLDER<br>`src/server/payments/checkout.test.ts` 쿠폰 실패 코드: 남의 쿠폰·모양이 틀린 id는 NOT_FOUND | ✅ |
| `confirmPayment`(같은 파일, 결제 결과 화면) | `requireCustomer` | 결제 번호는 세션 고객의 주문만. 남의 주문이면 포트원에 묻지도 않는다 | `src/server/payments/checkout.test.ts` 내 주문이 아니거나 모르는 결제 번호면 포트원에 묻지 않고 PAYMENT_NOT_FOUND | ✅ |
| `previewRefund`·`cancelReservation`(`src/server/refunds/cancel.ts`, 고객 예약 취소) | `requireCustomer` | 예약 id는 세션 고객의 예약만(남의 예약은 `RESERVATION_NOT_FOUND`) | `src/server/refunds/cancel.test.ts` 없거나 남의 예약이면 RESERVATION_NOT_FOUND<br>`src/server/refunds/cancel.test.ts` 없거나 남의 예약, 이미 취소된 예약<br>`src/server/refunds/cancel.test.ts` 로그인·고객 모드 실패는 그대로 돌려준다 | ✅ |
| `getAgreedCancelStatus`·`requestAgreedCancel`(`src/server/refunds/agreed-cancel.ts`, 원장님 합의 후 취소 요청) | `requireOwner` | 예약 id는 세션 원장님 샵의 예약만(남의 샵은 `RESERVATION_NOT_FOUND`) | `src/server/refunds/agreed-cancel.test.ts` 내 샵 예약이 아니면 RESERVATION_NOT_FOUND, 원장님이 아니면 그 실패<br>`src/server/refunds/agreed-cancel.test.ts` 예정 예약이 아니면 NOT_REQUESTABLE, 남의 샵 예약이면 RESERVATION_NOT_FOUND | ✅ |
| `getAgreedCancelRequest`·`respondAgreedCancel`(같은 파일, 고객 요청 카드·답) | `requireCustomer` | 세션 고객의 예약에 온 요청만(남의 것은 `REQUEST_NOT_FOUND`) | `src/server/refunds/agreed-cancel.test.ts` 요청 없음·만료 시각 지남·거절·예약 바뀜이면 null, 내 예약이 아니면 REQUEST_NOT_FOUND<br>`src/server/refunds/agreed-cancel.test.ts` 남의 예약 요청이거나 모양이 틀리면 REQUEST_NOT_FOUND | ✅ |
| `previewOwnerFaultCancel`·`cancelByOwnerFault`(`src/server/refunds/owner-fault-cancel.ts`, 원장님 사정 취소 S-409) | `requireOwner` | 예약 id는 세션 원장님 샵의 예약만 | `src/server/refunds/owner-fault-cancel.test.ts` 없거나 남의 샵 예약·모양이 틀린 id는 RESERVATION_NOT_FOUND | ✅ |
| `cancelByOwnerFaultAsAdmin`(`src/server/refunds/admin-owner-fault-cancel.ts`, 운영자가 대신 하는 원장님 사정 취소) | `requireAdmin` | 운영자는 전체(X-102). 사유 필수, 처리 기록을 남긴다 | `src/server/refunds/admin-owner-fault-cancel.test.ts` 운영자가 아니면 그 실패, 없거나 모양이 틀린 예약은 RESERVATION_NOT_FOUND | ✅ |
| `previewVoidReservation`·`voidReservation`(`src/server/refunds/void-reservation.ts`, 예약 무효 A-108) | `requireAdmin` | 운영자는 전체. 사유 필수, 처리 기록을 남긴다 | `src/server/refunds/void-reservation.test.ts` 운영자가 아니면 그 실패, 모양이 틀린 id·없는 예약은 RESERVATION_NOT_FOUND<br>`src/server/refunds/void-reservation.test.ts` 운영자가 아니면 아무것도 하지 않는다 | ✅ |
| `retryStuckOrder`·`retryStuckCancel`·`checkRefundReview`(`src/server/admin/payment-issues.ts`, 결제·환불 확인 #373 ①) | `requireAdmin` | 운영자는 전체. 사유 필수, 처리 기록을 남긴다 | `src/server/admin/payment-issues.test.ts` 운영자가 아니면 그 실패를 그대로 돌려주고 아무것도 하지 않는다<br>`src/server/admin/payment-issues.test.ts` 진행 중 취소 다시 시도·환불 금액 확인함도 운영자가 아니면 | ✅ |
| `holdReservationSettlement`·`holdShopSettlement`·`releaseSettlementHold`(`src/server/settlements/holds.ts`, 정산 보류 #373 ②) | `requireAdmin` | 운영자는 전체. 사유·원장님에게 보여 줄 사유 코드 필수, 처리 기록을 남긴다 | `src/server/settlements/holds.test.ts` 운영자가 아니면 그 실패, 모양이 틀린 id는 RESERVATION_NOT_FOUND<br>`src/server/settlements/holds.test.ts` 샵 전체 보류도 운영자가 아니면<br>`src/server/settlements/holds.test.ts` 메모를 다듬어 운영자·시각과 함께 풀고(로그인 안 함이면 UNAUTHENTICATED) | ✅ |
| `getSettlementItems`(`src/server/settlements/get-settlement-items.ts`, 원장님 정산 내역 S-502)·`getSettlementStatements`·`getSettlementStatement`(`get-settlement-statements.ts`, 정산서 S-501) | `requireShopOwner(입력 샵 id)` | 세션 원장님의 샵만. 다른 샵 id면 `FORBIDDEN`이고 읽지 않으며, 그 뒤로는 확인된 샵 id로만 읽는다 | `src/server/settlements/owner-access.test.ts` 원장님 A가 다른 샵 B의 id로 부르면 세 함수 모두 FORBIDDEN이고 아무것도 읽지 않는다<br>`src/server/settlements/owner-access.test.ts` 로그인하지 않았거나 고객 모드면<br>`src/server/settlements/owner-access.test.ts` 내 샵이면 세 함수 모두 내 샵 id로만 읽는다 | ✅ |
| `getMyCoupons`(`src/server/coupons/coupons.ts`, 쿠폰함·예약 확인 쿠폰 고르기) | `requireCustomer` | 세션 고객의 쿠폰만. 매물을 주면 세션 고객이 홀딩한 매물만(남의 홀딩은 `NOT_HOLDER`) | `src/server/coupons/coupons.test.ts` 홀딩하지 않았거나 다른 고객이 홀딩했으면 NOT_HOLDER<br>`src/server/coupons/coupons.test.ts` 로그인·고객 모드 실패는 그대로 | ✅ |
| `POST /api/webhooks/portone`(포트원 웹훅) | 누구나 부를 수 있는 주소. 포트원 서명을 확인한다 | 서명이 맞을 때만 그 결제를 포트원에 다시 물어 처리한다 | `src/app/api/webhooks/portone/route.test.ts` 서명이 틀리면 처리하지 않고 400 | ✅ |
| `POST /api/cron/payments-sweep`·`/api/cron/settlement-batch`(결제 정리 10분마다·목요일 정산 묶기) | 예약 작업 비밀값(`Authorization: Bearer CRON_SECRET`, `src/server/cron/auth.ts`) | 비밀값이 없거나 다르면 401이고 아무것도 하지 않는다 | `src/app/api/cron/payments-sweep/route.test.ts` 헤더 없음·값이 다름·길이가 다름·Bearer 없이 값만 → 401이고 정리하지 않는다<br>`src/app/api/cron/payments-sweep/route.test.ts` 서버에 CRON_SECRET이 없으면 모두 거절한다<br>`src/app/api/cron/settlement-batch/route.test.ts` 헤더 없음·값이 다름 → 401이고 묶지 않는다 | ✅ |
| `selectAdminWindows`(`src/app/admin/reservations/window-queries.ts`, 매물·예약 [시간대 매물] 탭, #567) | 운영자: 페이지가 `ensureAdminPage`로 확인(운영자 모드의 관리자만) | 운영자는 전체(X-102). 입력은 상태 거르기와 검색어뿐이고 읽기만 한다. 강제 마감은 `forceCloseWindow`(`requireAdmin`)를 쓴다 | `src/server/auth/pages.test.ts` 관리자가 아니면 404를 보여준다, 운영자 모드로 들어온 관리자면 | ✅ |
| `selectShopSlotControl`(`src/app/admin/shops/slot-control-queries.ts`, 샵 상세 '매물 관리' 칸, #373 ④·#567 3번) | 운영자: 페이지가 `ensureAdminPage`로 확인(운영자 모드의 관리자만) | 운영자는 전체(X-102). 입력은 주소의 샵 id이고 읽기만 한다. 강제 마감·게시 멈춤은 `forceCloseSlot`·`forceCloseWindow`·`pauseShopPublishing`(`requireAdmin`)을 쓴다 | `src/server/auth/pages.test.ts` 관리자가 아니면 404를 보여준다, 운영자 모드로 들어온 관리자면 | ✅ |

## 2. 고객 화면 서버 코드 — 정찬형

`src/app/(customer)/**`의 서버 함수(4개 파일, 함수 5개)와 페이지가 부르는 조회 함수. 내 예약·결제 결과·쿠폰함처럼 id가 주소에 들어가는 화면은 남의 id로 열면 404인지 본다.

| 함수 | 누가 | 어떤 데이터만 | 테스트 | 상태 |
| --- | --- | --- | --- | --- |
| `loadCompletedReservation` (`(focus)/payment/result/actions.ts`, 예약 완료 화면) | `requireCustomer`(`getMyReservationDetail` 안) | 세션 고객. 예약 id는 `selectMyReservationDetail`이 고객 id로 걸러서 남의 예약·모양이 틀린 id는 `NOT_FOUND` | `src/app/(customer)/customer-access.db.test.ts` 다른 손님의 예약 id로 내 예약 상세·예약 완료 화면을 열면 찾을 수 없다 | ✅ |
| `setFavorite` (`(tabs)/home/favorites/actions.ts`) | `requireCustomer` | 세션 고객. 입력에 계정 id를 넣어도 버린다. 샵 id는 승인된 샵만(`customerVisibleShop`) | `src/app/(customer)/customer-access.db.test.ts` 입력에 다른 손님의 계정 id를 넣어도 내 계정만 바뀐다<br>`src/app/(customer)/(tabs)/home/favorites/store.db.test.ts` 승인되지 않은 샵은 찜하지 못하고 | ✅ |
| `watchListArea` (`(tabs)/home/list/actions.ts`) | `getInterestAreas`·`setInterestAreas`(1장, 안에서 `requireCustomer`) | 세션 고객의 관심 동네만. 동네 코드는 동네 목록에 있는지 `setInterestAreas`가 본다 | `src/app/(customer)/(tabs)/home/list/actions.test.ts` 관심 동네를 읽지 못하면(로그인 안 함 등) 저장하지 않고<br>`src/server/notifications/interest-store.db.test.ts` 다른 고객의 관심 동네는 건드리지 않는다 | ✅ |
| `updateMyProfile` (`(tabs)/me/actions.ts`) | `requireCustomer` | 세션 고객. 입력에 계정 id를 넣어도 버린다 | `src/app/(customer)/customer-access.db.test.ts` 입력에 다른 손님의 계정 id를 넣어도 내 계정만 바뀐다<br>`src/app/(customer)/customer-access.db.test.ts` 로그인하지 않았거나 원장님 모드면 | ✅ |
| `updateMyPhone` (`(tabs)/me/actions.ts`, 예약 확인 화면) | `requireCustomer` | 세션 고객(입력은 번호 하나) | `src/app/(customer)/customer-access.db.test.ts` 입력에 다른 손님의 계정 id를 넣어도 내 계정만 바뀐다<br>`src/app/(customer)/(tabs)/me/actions.test.ts` 고객으로 로그인하지 않았으면 저장하지 않는다 | ✅ |
| `getMyReservations`·`getMyReservationDetail` (`(tabs)/reservations/queries.ts`, 내 예약 목록·상세 `/reservations/[id]`) | `requireCustomer` | 세션 고객. 예약 id는 고객 id로 거른다. 남의 예약·모양이 틀린 id는 `NOT_FOUND`이고 상세 화면은 404 | `src/app/(customer)/customer-access.db.test.ts` 다른 손님의 예약 id로 내 예약 상세·예약 완료 화면을 열면 찾을 수 없다<br>`src/app/(customer)/(tabs)/reservations/queries.db.test.ts` 상세는 본인 예약만 열리고<br>`src/app/(customer)/(tabs)/reservations/queries.db.test.ts` 본인 예약만, 탭별로 | ✅ |
| 내 예약 상세가 같이 부르는 `previewRefund`·`getDisputeStatus`·`getAgreedCancelRequest`(1장) | `requireCustomer` | 내 예약만. 남의 예약이면 `RESERVATION_NOT_FOUND`·`REQUEST_NOT_FOUND` | `src/server/refunds/cancel.test.ts` 없거나 남의 예약이면 RESERVATION_NOT_FOUND<br>`src/server/disputes/dispute.test.ts` id 모양이 틀리거나 내 예약이 아니면 RESERVATION_NOT_FOUND<br>`src/server/refunds/agreed-cancel.test.ts` 내 예약이 아니면 REQUEST_NOT_FOUND | ✅ |
| 예약 확인 화면 `/checkout/[slotId]`: `getMyHold`·`previewCheckoutAmount`(1장)와 예약자 이름·연락처 조회(`page.tsx`) | `ensureCustomerPage`, `requireCustomer` | 세션 고객. 남의 홀딩이면 `getMyHold`가 null이라 "결제 가능 시간이 끝났어요" 안내만 보이고(남의 홀딩 정보는 주지 않는다), 금액 미리보기는 `NOT_HOLDER`. 예약자 이름·연락처는 세션 고객 줄만 읽는다 | `src/app/(customer)/customer-access.db.test.ts` 다른 손님이 결제 중인 매물로 예약 확인 화면을 열면<br>`src/server/payments/checkout.test.ts` previewCheckoutAmount: 내 홀딩이 아니면 NOT_HOLDER | ✅ |
| `selectSlotDetail` (`(tabs)/slots/[slotId]/queries.ts`, 매물 상세 `/slots/[id]`) | 누구나(로그인 없이 둘러보는 공개 매물) | 승인 샵의 게시 뒤 매물만, 게시 전·없는 매물은 404. 신규 고객 전용은 그 샵 이력이 있는 고객에게 404(C-306). 홀딩은 "나/다른 고객"만 알리고 누가 홀딩했는지는 주지 않는다 | `src/app/(customer)/(tabs)/slots/[slotId]/queries.db.test.ts` 승인되지 않은 샵, 게시 전 매물, 없는 매물은 null(404)<br>`src/app/(customer)/(tabs)/slots/[slotId]/queries.db.test.ts` 신규 고객 전용은 그 샵 이력이 있는 고객에게만 null | ✅ |
| `loadHomeMap`·`loadHomeSlots`·`loadRegionSlots` (`src/features/map/slot-list/actions.ts`, 지도·목록·로비) | 누구나(로그인 없이 둘러보기) | 승인 샵의 게시중 매물만. 고객으로 들어왔으면 세션 고객 기준으로 신규 고객 전용을 거르고 결제 중 배지를 정한다 | `src/features/map/slot-list/queries.db.test.ts` 승인 샵의 게시중 매물만<br>`src/features/map/slot-list/queries.db.test.ts` 신규 고객 전용 매물은 그 샵 이력이 있는 고객에게 보이지 않는다 | ✅ |
| `selectRegion`·`saveMyLocation` (`src/features/map/location-actions.ts`) | 누구나 | 이 브라우저 쿠키만 바꾸고 계정 데이터는 읽지 않는다. 내 위치는 위치 이용 기록을 남긴다(위치정보법) | `src/features/map/location-actions.test.ts` 위치 이용 기록을 1번 남기고<br>`src/features/map/location-actions.test.ts` 목록에 없는 동네는 거절한다 | ✅ |
| `selectFavoriteSlots` (`src/features/map/slot-list/queries.ts`)·`countFavoriteShops`·`isFavoriteShop` (`(tabs)/home/favorites/store.ts`), 찜한 샵 매물·로비·매물 상세 하트 | `ensureCustomerPage`·`getCurrentAccount`(페이지) | 세션 고객의 찜만 | `src/features/map/slot-list/queries.db.test.ts` 찜한 샵 매물: 내가 찜한 샵의 보이는 매물만<br>`src/app/(customer)/(tabs)/home/favorites/store.db.test.ts` 본인 찜만 바뀐다 | ✅ |
| `selectMyNoShows` (`(tabs)/me/no-show-history.ts`, 내 정보) | `ensureCustomerPage`(페이지) | 세션 고객 | `src/app/(customer)/(tabs)/me/no-show-history.db.test.ts` 본인 노쇼만 세고 | ✅ |

페이지가 같이 부르는 나머지 공통 서버 함수는 1장(강규민) 표에서 본다: 쿠폰함·예약 확인의 `getMyCoupons`, 시간대 상세 `/windows/[id]`의 `getSlotWindow`, 알림함, 관심 동네·선택 동의(`getInterestAreas`·`getOptionalConsents`).

## 3. 원장님 화면 서버 코드 — 정민석

`src/app/owner/**`의 서버 함수(9개 파일, 함수 21개)와 페이지가 부르는 조회 함수. 다른 샵의 매물·예약·정산 id로 부르면 막히는지 본다.

| 함수 | 누가 | 어떤 데이터만 | 테스트 | 상태 |
| --- | --- | --- | --- | --- |

## 4. 개인정보가 보이는 곳 — 현동훈

이름·휴대폰·이메일·계좌번호·사업자등록번호·주소가 어디에 보이고 남는지 본다. 화면(가림, [번호 보기]), 화면 코드(HTML)에 실리는 값, 알림 문구, 운영자 기록·열람 기록, 서버 로그, 스크린샷 규칙.

| 정보 | 보이는 곳 | 누가 보나 | 가림·기록 | 상태 |
| --- | --- | --- | --- | --- |
| 고객 이름·휴대폰 | 원장님 예약 상세·대시보드 | 그 샵 원장님 | 예약한 샵에만 이름·휴대폰을 주고 닉네임은 주지 않는다(#375). 원장님이 다른 샵 예약을 볼 수 없는지는 3장 | ✅(권한은 3장) |
| 고객 휴대폰·이메일 | 운영자 회원 목록·상세 | 운영자 | 목록·상세 모두 가리고 [번호 보기]로만 전체를 받아 온다. 누를 때마다 열람 기록(contact_reveal), 화면 코드에는 싣지 않는다(#547, AUTH-11) | ✅ |
| 원장님 휴대폰 | 운영자 입점 심사·회원 목록 | 운영자 | 가리고 [번호 보기]로만(#547) | ✅ |
| 샵 전화번호 | 고객 매물 상세·내 예약 | 누구나 | 가게의 공개 번호다(원장님 개인 번호와 따로 받는다) | ✅ |
| 사업자등록번호·대표자 이름·등록증 | 운영자 입점 심사, 원장님 매장 설정 | 운영자, 그 원장님 | 등록증은 비공개 버킷에 두고 정해진 시간만 열리는 주소로 연다(`BUSINESS_DOC_URL_TTL_SECONDS`). 운영자 사업자 정보 수정 기록에는 이전 값을 남기지 않는다 | ✅ |
| 정산 계좌번호 | 원장님 정산 계좌, 운영자 샵 상세·정산 | 그 원장님, 운영자 | 암호화해 저장하고(`account-crypto`) 화면에는 끝 4자리만 보인다. 계좌 변경 기록도 끝 4자리만 | ✅ |
| 알림 문구(기기 잠금 화면) | 웹 푸시, 알림함 | 기기 주인 | 원장님 알림에 손님 이름·휴대폰을 넣지 않는다 | ✅ |
| 서버 로그 | Vercel 로그 | 팀 | 오류는 이름만 남기고 입력값·개인정보를 남기지 않는다 | ✅ |
| 운영자 열람 기록의 검색어 | `admin_access_logs.query` | 운영자 | 운영자가 넣은 검색어(이름·번호일 수 있다)를 그대로 남긴다. 누가 무엇을 찾았는지 남기려는 의도(#269)라 두되, 1년 보관한 뒤 지운다(11/22 결정, 접속기록 최소 보관 1년). 지우는 정리 작업은 출시 전에 만든다(로드맵) | 고칠 것(정리 작업) |
| 운영자 처리 기록의 메모 | `admin_actions.memo` | 운영자 | 운영자가 쓰는 사유다. 입력 칸 예시는 개인정보 없이 쓴다(예: "11/14 통화, 손님과 합의가 안 돼 전액 환불 요청") | ✅ |
| 위치 | 지도·내 주변 | 고객 | 위치를 쓸 때마다 위치 이용 기록을 남긴다(`location_use_logs`, 위치정보법) | ✅ |
| PR 스크린샷 | GitHub(공개 레포) | 누구나 | 시드 계정으로만 찍고, 올리기 전에 진짜 이메일·번호·계좌가 없는지 본다(CLAUDE.md) | ✅ |
