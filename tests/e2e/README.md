# 브라우저 자동 테스트(E2E)

로봇이 실제 브라우저로 고객 화면을 눌러 보는 테스트예요(회귀 테스트 ③, #592). 화면 코드가 바뀌어 핵심 흐름이 깨지면 잡아요.

- 테스트 파일: `tests/e2e/*.spec.ts`(Vitest의 `*.test.ts`와 따로 돌아요)
- 설정: `playwright.config.ts`, 로컬 Supabase 설정은 `supabase/config.toml`
- GitHub 검사: PR마다 "E2E"(`.github/workflows/e2e.yml`). 아직 머지를 막는 필수 검사는 아니에요

## 지금 있는 흐름

같은 흐름을 PC(`pc`, 1280×800)와 고객 폰(`phone`, 375×812, 터치)에서 돌려요. 원장님 화면의 폰 배치는 출시 뒤라 원장님 흐름은 PC에서만 봐요.

| 파일 | 흐름 | 시나리오 |
| --- | --- | --- |
| `browse.spec.ts` | 첫 화면 → 로그인 없이 둘러보기 → 동네 고르기 → 홈 매물 → 매물 상세 → [예약하기]는 로그인 화면으로 | AUTH-22 |
| `hold.spec.ts` | 시드 손님 → [예약하기] → 예약 확인 10분 타이머 → 환불 규정 동의 전에는 결제 불가 → 홈의 결제 중 칩 → [그만두기] → 다시 예약 가능 | HOLD-01·05·09 |
| `logout.spec.ts` | 고객·원장님 로그아웃 → 첫 화면, 뒤로 가기로 로그인한 화면이 다시 보이지 않음 | AUTH-08 |
| `payment.spec.ts` | 결제 → 예약 확정 → 내 예약 → 24시간 넘게 남았을 때 취소 → 결제액의 70% 환불. 결제창을 닫으면 예약 확인으로 돌아가 다시 결제 | FLOW-01 |

한쪽만 돌리려면 `npx playwright test --project=pc`처럼 써요.

## 결제(가짜 결제사)

진짜 포트원으로는 결제하지 않아요(진짜 결제창은 FLOW-06 손 점검).

- **결제창**: `support/portone.ts`의 `useFakePaymentWindow`가 화면에 가짜 `window.PortOne`을 넣어요. 포트원 결제창 도구(`@portone/browser-sdk`)는 `window.PortOne`이 이미 있으면 결제창 스크립트를 받지 않고 그걸 써요. 진짜 스크립트 주소(`cdn.portone.io`)는 막아요. PC는 결제창이 닫히며 결과를 돌려주고, 폰은 결제 페이지에서 돌아오듯 결과 화면 주소로 가요
- **결제 조회·취소**: 앱 서버는 `PORTONE_API_URL`로 가짜 포트원 서버(`setup/fake-portone.mjs`, 127.0.0.1:4010)에 물어요. Playwright가 앱 서버보다 먼저 켜요. 가짜 결제창이 "결제함/닫음"을 이 서버에 넣고, 테스트는 `fakePortOnePayment`로 앱이 보낸 취소를 읽어요
- 가짜 서버의 규칙(취소 가능 잔액 확인 등)과, 앱의 포트원 코드가 가짜의 답을 제대로 읽는지는 `setup/fake-portone.test.ts`(Vitest)가 봐요
- 결제 테스트는 24시간 넘게 남은 시드 매물을 써요(`refundableSeedSlotIds`). 한 번 돌 때마다 매물이 예약·취소되니, 다시 돌리려면 `npm run test:e2e`(시드를 다시 넣어요)로 돌려요

## 안전장치

- E2E는 **로컬 Supabase(127.0.0.1)에서만** 돌아요. Supabase나 DB 주소가 내 컴퓨터가 아니면(공용 개발 DB) 바로 멈춰요(`setup/local-supabase.mjs`)
- 앱 서버에는 로컬 값만 넘기고, `.env.local`의 외부 서비스 키·팀 접속 코드·로컬 스위치(`DEV_FAKE_*`)는 빈 값으로 덮어요. 포트원 값은 가짜 포트원 서버용 가짜 값으로 덮어요
- 이미 켜진 개발 서버(`npm run dev`, 공용 개발 DB)에는 붙지 않아요. 3000번을 쓰는 서버가 있으면 끄고 돌려요
- 진짜 키와 GitHub secret은 쓰지 않아요. 필요한 값은 E2E 전용 가짜 값이에요

## 내 컴퓨터에서 돌리기

Docker Desktop이 필요해요. 설치가 어려우면 GitHub 검사 결과만 봐도 돼요.

1. Docker Desktop 켜기
2. 로컬 Supabase 켜기(처음에는 이미지를 받느라 몇 분 걸려요). 버전은 `setup/local-supabase.mjs`의 `SUPABASE_CLI_VERSION`과 같게 써요

   ```bash
   npx supabase@2.122.1 start
   ```

3. 브라우저 받기(처음 한 번)

   ```bash
   npx playwright install chromium
   ```

4. 돌리기: 마이그레이션·시드 → 빌드 → 실행 → 테스트를 한 번에 해요

   ```bash
   npm run test:e2e
   ```

5. 실패하면 `npx playwright show-report`로 사진과 trace(단계별 화면)를 봐요
6. 끝나면 `npx supabase@2.122.1 stop`

## 테스트를 쓸 때

- 화면 요소는 역할과 글자로 찾아요(`getByRole`, `getByLabel`). 테스트만을 위한 속성은 되도록 더하지 않아요
- PC와 폰은 같은 이름을 쓰게 만들어 두었어요(결제 중 칩·알약은 "결제 중인 매물: …", 알림 종은 "알림"). 자리가 다르면 이름으로 찾아요
- 시드 계정으로 로그인해요(`support/seed.ts`의 `signInAs`). 간편 로그인 화면은 로봇이 누르지 않아요(AUTH-07)
- 시드 고객 A는 시드가 매물 하나를 홀딩해 둬서(한 사람에 하나) 홀딩 흐름에는 B를 써요
- 새 테스트는 코드를 일부러 틀리게 바꿔서 실패하는 것을 한 번 봐요(`docs/test-scenarios.md` 테스트 규칙 ②)
- `docs/test-scenarios.md`의 해당 줄 테스트 칸에 `tests/e2e/파일.spec.ts 테스트 이름 일부`를 적어요
