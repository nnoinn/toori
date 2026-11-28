import { expect, type Page, test } from '@playwright/test';
import type postgres from 'postgres';

import { signInAs, withDb } from './support/seed';

// 원장님 예약 상세 → [예약 취소] → 손님과 합의 후 취소 요청(#23 원장님 E2E 3번 흐름, S-410·X-208, #301).
// 시드 원장님 A(샘플 헤어 중앙역점)에는 3시간쯤 뒤에 시작하는 예약이 하나 있다
// (scripts/seed-data.mjs `{ menu: 'cut', at: 3, rate: 20, status: 'reserved', book: 'c' }`, 여성 커트 25,000원 20% → 판매가 20,000원, 손님 샘플 고객 C).
// 원장님 쪽만 본다: 요청까지는 결제사를 부르지 않는다. 손님이 동의해 50% 환불되는 것과 원장님 사정으로 취소(S-409)는
// 가짜 결제사(#613)가 들어온 뒤 4번 흐름에서 본다.
// 날짜·시각은 DB 값으로 정해서, 시드를 넣은 시각(자정 근처 등)에 따라 달라져도 맞는다
const OWNER = 'owner-a';
const OWNER_EMAIL = 'owner-a@seed.test';
const CUSTOMER_EMAIL = 'customer-c@seed.test';
const REASON = '손님이 시술을 원하지 않아요';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const KST_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// 원장님 화면의 폰 배치는 출시 뒤(사이클 9단계)라 PC에서만 본다(#592 3차 폰 크기 실행에서 건너뛴다)
test.skip(
  ({ isMobile }) => isMobile,
  '원장님 화면의 폰 배치는 출시 뒤(사이클 9단계)라 PC에서만 본다',
);

type UpcomingReservation = {
  id: string;
  code: string;
  slotId: string;
  startAt: Date;
  menuName: string;
  salePrice: number;
};

/** 이 테스트가 요청을 보낸 시드 예약 */
let requestedFor: string | null = null;

// 요청과 손님 알림을 로컬 E2E DB에서 지워 시드를 처음 상태로 되돌린다(화면에는 요청 거두기가 없다).
// 실패해서 다시 돌 때(GitHub 검사는 한 번 더 돈다) 같은 예약에 다시 요청할 수 있게 한다.
// 알림은 응답 뒤에 따로 저장되므로(sendAfterResponse) 예약으로 찾아 지운다
test.afterEach(async () => {
  if (!requestedFor) return;
  const reservationId = requestedFor;
  requestedFor = null;
  await withDb(async (sql) => {
    await sql`
      delete from notifications
      where event = 'reservation.agreed_cancel_requested'
        and dedupe_key in (
          select 'reservation.agreed_cancel_requested:customer:' || id
          from agreed_cancel_requests where reservation_id = ${reservationId}
        )`;
    await sql`delete from agreed_cancel_requests where reservation_id = ${reservationId}`;
  });
});

test('예정 예약에 손님과 합의 후 취소를 요청하면 손님 동의를 기다리고, 손님에게 알림이 가고, 두 번째 요청은 막힌다', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAs(context, OWNER, baseURL!);
  const reservation = await upcomingReservation();
  requestedFor = reservation.id;
  // 시드 판매가(25,000원 20% 할인). 원장님 기준 금액은 판매가 × 50% = 10,000원(CLAUDE.md 합의 후 취소, AGREED-01)
  expect(reservation.salePrice, '시드 판매가').toBe(20000);
  expect(await requestsOf(reservation.id), '요청하기 전').toEqual([]);
  const when = `${kstDateLabel(reservation.startAt)} ${kstTime(reservation.startAt)}`;
  // 예약번호는 끝 4자리로 맞춰 본다(#262)
  const codeTail = reservation.code.slice(-4);

  // 1. 예약 상세의 "예약 취소" 카드 → [예약 취소] → 고르기 창에 그 예약, 두 방법 모두 누를 수 있다(시작 전)
  await page.goto(`/owner/reservations/${reservation.id}`);
  const card = cancelCard(page);
  await card.getByRole('button', { name: '예약 취소', exact: true }).click();
  const chooser = page.getByRole('dialog', { name: '어떻게 취소할까요?' });
  await expect(chooser).toContainText(`${when} ${reservation.menuName}`);
  await expect(chooser).toContainText(codeTail);
  await expect(chooser.getByRole('button', { name: /^원장님 사정으로 취소/ })).toBeEnabled();
  const agreedMethod = chooser.getByRole('button', { name: /^손님과 합의 후 취소/ });
  await expect(agreedMethod).toBeEnabled();

  // 2. 손님과 합의 후 취소 안내: 손님 50% 환불, 원장님 판매가의 50%, 24시간 안에 동의해야 취소
  await agreedMethod.click();
  const guide = page.getByRole('dialog', { name: '손님과 합의 후 취소' });
  await expect(guide).toContainText(
    '결제한 금액의 50%를 환불받아요(사용한 쿠폰은 돌려드리지 않아요)',
  );
  await expect(guide).toContainText('판매가의 50%(10,000원)를 정산받아요');
  await expect(guide).toContainText('패널티는 없어요');
  await expect(guide).toContainText('24시간 안에 동의하지 않으면 요청이 사라져요');

  // 사유를 고르고 손님께 설명했다는 확인에 체크해야 요청할 수 있다
  const submit = guide.getByRole('button', { name: '합의 후 취소 요청하기', exact: true });
  await expect(submit).toBeDisabled();
  await guide.getByText(REASON, { exact: true }).click();
  await expect(guide.getByRole('radio', { name: REASON })).toBeChecked();
  await expect(submit).toBeDisabled();
  await guide
    .getByRole('checkbox', { name: '손님께 50% 환불을 설명했고, 손님도 시술을 받지 않기로 했어요' })
    .check();
  await expect(submit).toBeEnabled();

  // 3. 요청 → "요청을 보냈어요"(기한은 저장한 만료 시각) → [확인]
  await submit.click();
  const sent = page.getByRole('dialog', { name: '요청을 보냈어요' });
  await expect(sent).toBeVisible();
  const [request] = await requestsOf(reservation.id);
  expect(request, '저장한 요청').toMatchObject({
    status: 'requested',
    reason: 'customer_declined',
  });
  expect(request.expiresAt.getTime() - request.requestedAt.getTime(), '답 기한 24시간(X-208)').toBe(
    24 * HOUR_MS,
  );
  const deadline = `${kstDateLabel(request.expiresAt)} ${kstTime(request.expiresAt)}`;
  await expect(sent).toContainText(`${deadline}까지 손님이 동의하면 취소돼요.`);
  await expect(sent).toContainText('내 예약에서 동의해 달라고 말씀해 주세요.');
  await sent.getByRole('button', { name: '확인', exact: true }).click();
  await expect(sent).toBeHidden();

  // 카드에 답을 기다리는 요청: 기한, 요청 시각과 사유
  const status = card.getByRole('status', { name: '합의 후 취소 요청 상태' });
  await expect(status).toContainText('손님 동의를 기다리는 중이에요');
  await expect(status).toContainText(`${deadline}까지`);
  await expect(status).toContainText(
    `요청 ${kstDateLabel(request.requestedAt)} ${kstTime(request.requestedAt)} · 사유: ${REASON}`,
  );

  // 4. [예약 취소]를 다시 열면 합의 후 취소는 잠기고 이유가 보인다(답을 기다리는 요청은 한 번에 하나, #301)
  await card.getByRole('button', { name: '예약 취소', exact: true }).click();
  await expect(chooser).toBeVisible();
  await expect(agreedMethod).toBeDisabled();
  await expect(agreedMethod).toContainText(
    '손님 답을 기다리는 요청이 있어요. 손님이 거절하거나 24시간이 지나면 다시 요청할 수 있어요',
  );
  // 창 오른쪽 위 X도 이름이 "닫기"다(공통 창, 내용 뒤에 붙는다). 먼저 나오는 창 아래 [닫기]를 누른다
  await chooser.getByRole('button', { name: '닫기', exact: true }).first().click();
  await expect(chooser).toBeHidden();

  // 5. DB: 요청은 하나이고 답을 기다린다. 예약·매물은 그대로(손님이 동의해야 취소된다)
  expect(await requestsOf(reservation.id)).toHaveLength(1);
  expect(await reservationState(reservation.id)).toEqual({
    status: 'confirmed',
    slotStatus: 'reserved',
  });
  // 손님 C에게 알림 하나(응답 뒤에 따로 저장되므로 기다린다). 누르면 손님 예약 상세로 간다
  await expect
    .poll(() => customerAlerts(request.id), { message: '손님 알림' })
    .toEqual([
      {
        email: CUSTOMER_EMAIL,
        accountType: 'customer',
        title: '원장님이 합의 후 취소를 요청했어요',
        url: `/reservations/${reservation.id}`,
      },
    ]);
});

/** 예약 상세의 "예약 취소" 카드 */
function cancelCard(page: Page) {
  return page
    .locator('[data-slot=card]')
    .filter({ has: page.locator('[data-slot=card-title]', { hasText: /^예약 취소$/ }) });
}

/** 원장님 A 샵 id(조각) */
function ownerShopId(sql: postgres.Sql) {
  return sql`
    select s.id from shops s
    join owners o on o.id = s.owner_id
    join auth.users u on u.id = o.user_id
    where u.email = ${OWNER_EMAIL}`;
}

/** 원장님 A 샵에서 아직 시작하지 않은 예정 예약. 시드에는 하나만 있다 */
async function upcomingReservation(): Promise<UpcomingReservation> {
  const rows = await withDb(
    (sql) => sql<UpcomingReservation[]>`
      select r.id, r.code, r.slot_id as "slotId", s.start_at as "startAt", s.menu_name as "menuName",
        s.sale_price as "salePrice"
      from reservations r
      join slots s on s.id = r.slot_id
      where s.shop_id = (${ownerShopId(sql)})
        and r.status = 'confirmed' and r.visit_result is null and s.start_at > now()`,
  );
  expect(rows, '시드의 시작 전 예정 예약').toHaveLength(1);
  return rows[0];
}

/** 그 예약의 합의 후 취소 요청 */
function requestsOf(reservationId: string) {
  return withDb(
    (sql) => sql<
      { id: string; status: string; reason: string; requestedAt: Date; expiresAt: Date }[]
    >`
      select id, status, reason, requested_at as "requestedAt", expires_at as "expiresAt"
      from agreed_cancel_requests where reservation_id = ${reservationId}`,
  );
}

/** 예약 상태와 매물 상태 */
async function reservationState(reservationId: string) {
  return withDb(async (sql) => {
    const [row] = await sql<{ status: string; slotStatus: string }[]>`
      select r.status, s.status as "slotStatus"
      from reservations r
      join slots s on s.id = r.slot_id
      where r.id = ${reservationId}`;
    return row;
  });
}

/** 그 요청으로 손님에게 간 알림(받는 사람 이메일·계정 종류·제목·주소) */
function customerAlerts(requestId: string) {
  return withDb(
    (sql) => sql<{ email: string; accountType: string; title: string; url: string }[]>`
      select u.email, n.account_type as "accountType", n.payload->>'title' as title,
        n.payload->>'url' as url
      from notifications n
      join auth.users u on u.id = n.user_id
      where n.dedupe_key = ${`reservation.agreed_cancel_requested:customer:${requestId}`}`,
  );
}

/** 화면의 한국 날짜. 예: "11/28(토)" */
function kstDateLabel(date: Date): string {
  const kst = new Date(date.getTime() + KST_MS);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}(${WEEKDAYS[kst.getUTCDay()]})`;
}

/** 한국 시각 "13:00" */
function kstTime(date: Date): string {
  return new Date(date.getTime() + KST_MS).toISOString().slice(11, 16);
}
