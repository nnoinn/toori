import { expect, type Page, test } from '@playwright/test';
import type postgres from 'postgres';

import { signInAs, withDb } from './support/seed';

// 원장님 예약 현황 → 예약 상세 → 방문 처리(#23 원장님 E2E 2번 흐름, S-402·S-403·S-405).
// 시드 원장님 A(샘플 헤어 중앙역점)에는 시작이 2시간쯤 지났는데 방문·노쇼를 처리하지 않은 예약이 하나 있다
// (scripts/seed-data.mjs `{ menu: 'cut', at: -2, status: 'reserved', book: 'b' }`, 예약자 샘플 이두리).
// [노쇼]는 확인 창을 열었다 닫기만 하고(노쇼는 고객 알림이 가서 처리하지 않는다), [방문 완료]로 처리한다.
// 날짜·시각은 DB의 시작 시각으로 정해서, 시드를 넣은 시각(자정 근처 등)에 따라 달라져도 맞는다
const OWNER = 'owner-a';
const OWNER_EMAIL = 'owner-a@seed.test';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const KST_MS = 9 * 60 * 60 * 1000;

// 원장님 화면의 폰 배치는 출시 뒤(사이클 9단계)라 PC에서만 본다(#592 3차 폰 크기 실행에서 건너뛴다)
test.skip(
  ({ isMobile }) => isMobile,
  '원장님 화면의 폰 배치는 출시 뒤(사이클 9단계)라 PC에서만 본다',
);

type PendingReservation = {
  id: string;
  code: string;
  slotId: string;
  startAt: Date;
  menuName: string;
  customerName: string;
  customerPhone: string;
};

/** 이 테스트가 처리한 시드 예약. 끝나면 처음 상태로 되돌린다 */
let pending: PendingReservation | null = null;

// 처리한 시드 예약을 로컬 E2E DB에서 처리 전으로 되돌린다(화면에는 되돌리기가 없다, #130).
// 실패해서 다시 돌 때(GitHub 검사는 한 번 더 돈다) 같은 예약을 다시 "처리 필요"로 쓴다. 방문 완료는 알림·정산 기록을 따로 남기지 않는다
test.afterEach(async () => {
  if (!pending) return;
  const { id, slotId } = pending;
  pending = null;
  await withDb(async (sql) => {
    await sql`
      update reservations
      set status = 'confirmed', visit_result = null, visit_recorded_at = null, visit_recorded_by = null
      where id = ${id}`;
    await sql`update slots set status = 'reserved' where id = ${slotId}`;
  });
});

test('시작이 지난 예약을 예약 현황에서 열어 방문 완료로 처리하면 처리 필요에서 빠지고, 매물은 완료가 되고 연락처를 가린다', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAs(context, OWNER, baseURL!);
  pending = await pendingReservation();
  const reservation = pending;
  const day = kstDateKey(reservation.startAt);
  const time = kstTime(reservation.startAt);
  // 예약번호는 끝 4자리로 맞춰 본다(#262)
  const codeTail = reservation.code.slice(-4);

  // 1. 대시보드 맨 위 "처리 필요"에 그 예약이 있다
  await page.goto('/owner');
  await expect(needsVisitRow(page, day, time, codeTail)).toHaveCount(1);

  // 2. 예약 현황(그 날 하루 보기): 그 시간 칸이 "방문 처리 필요"이고, 누르면 예약 상세로 간다
  await page.goto(`/owner/schedule?view=day&date=${day}`);
  const block = scheduleBlock(page, reservation, time, '방문 처리 필요');
  await expect(block).toBeVisible();
  await block.click();
  await expect(page).toHaveURL(new RegExp(`/owner/reservations/${reservation.id}$`));

  // 3. 예약 상세: 방문 처리 필요, 처리 안내, 예약자 연락처 전체(이용이 끝날 때까지만 다 보여준다)
  const header = headerCard(page);
  await expect(header.locator('[data-slot=badge]')).toHaveText('방문 처리 필요');
  await expect(header.getByText('서비스 시작이 지났어요')).toBeVisible();
  await expect(phoneLink(page, reservation.customerPhone)).toHaveAttribute(
    'href',
    `tel:${reservation.customerPhone}`,
  );

  // 4. [노쇼] → 확인 창에 결과 안내 → [취소]: 창이 닫히고 아무것도 바뀌지 않는다
  await header.getByRole('button', { name: '노쇼', exact: true }).click();
  const noShow = page.getByRole('dialog', { name: '노쇼로 처리할까요?' });
  await expect(noShow).toContainText('결제 금액은 고객에게 환불되지 않고 정산에 들어가요.');
  await expect(noShow).toContainText('처리하면 바꿀 수 없어요.');
  await noShow.getByRole('button', { name: '취소', exact: true }).click();
  await expect(noShow).toBeHidden();
  expect(await visitState(reservation.id), '노쇼 창을 닫은 뒤').toEqual({
    status: 'confirmed',
    visitResult: null,
    visitRecordedAt: null,
    slotStatus: 'reserved',
  });

  // 5. [방문 완료] → 확인 창에 그 예약(시각·서비스·예약번호) → [방문 완료로 처리]
  await header.getByRole('button', { name: '방문 완료', exact: true }).click();
  const visit = page.getByRole('dialog', { name: '방문 완료로 처리할까요?' });
  await expect(visit).toContainText(`${time} ${reservation.menuName}`);
  await expect(visit).toContainText(codeTail);
  await visit.getByRole('button', { name: '방문 완료로 처리', exact: true }).click();
  await expect(visit).toBeHidden();

  // 화면이 새로 고쳐져 방문 완료로 보이고, 버튼이 사라지고, 연락처 가운데를 가린다(#21 Q11)
  await expect(header.locator('[data-slot=badge]')).toHaveText('방문 완료');
  await expect(header.getByText('처리한 예약은 바꿀 수 없어요')).toBeVisible();
  await expect(header.getByRole('button', { name: /^(방문 완료|노쇼)$/ })).toHaveCount(0);
  await expect(phoneLink(page, reservation.customerPhone)).toHaveCount(0);
  await expect(
    page.getByText(maskedPhone(reservation.customerPhone), { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('방문·노쇼를 처리한 예약이라 연락처를 가렸어요.')).toBeVisible();

  // DB: 예약은 이용 완료·방문이고 처리한 시각·사람이 남는다. 매물은 완료(노쇼 여부는 매물이 아니라 예약에 남긴다)
  const recorded = await visitState(reservation.id);
  expect(recorded).toMatchObject({
    status: 'completed',
    visitResult: 'visited',
    slotStatus: 'completed',
  });
  expect(recorded.visitRecordedAt, '처리한 시각').not.toBeNull();

  // 6. 예약 현황 칸은 방문 완료가 되고, 대시보드 "처리 필요"에서 빠진다
  await page.goto(`/owner/schedule?view=day&date=${day}`);
  await expect(scheduleBlock(page, reservation, time, '방문 완료')).toBeVisible();
  await page.goto('/owner');
  // 대시보드가 다 그려진 뒤에 없는지 본다
  await expect(page.getByRole('tab', { name: /^예정 \d+$/ })).toBeVisible();
  await expect(needsVisitRow(page, day, time, codeTail)).toHaveCount(0);
});

/** 대시보드 맨 위 "처리 필요" 카드에서 그 예약 줄(날짜·시각과 예약번호 끝 4자리) */
function needsVisitRow(page: Page, day: string, time: string, codeTail: string) {
  return page
    .locator('[data-slot=card]')
    .filter({ has: page.locator('[data-slot=card-title]', { hasText: /^처리 필요 \d+건$/ }) })
    .getByRole('listitem')
    .filter({ hasText: `${shortDate(day)} ${time}` })
    .filter({ hasText: codeTail });
}

/** 예약 현황 칸. 이름은 "13:00~14:00, 여성 커트, 예약자 샘플 이두리, 방문 처리 필요" 모양이다(끝 시각은 보지 않는다) */
function scheduleBlock(page: Page, reservation: PendingReservation, time: string, state: string) {
  const name = new RegExp(
    `^${time}~[^,]+, ${escapeRegExp(reservation.menuName)}, 예약자 ${escapeRegExp(reservation.customerName)}, ${state}$`,
  );
  return page.getByRole('link', { name });
}

/** 예약 상세 맨 위 카드(예약번호·상태 배지·안내·방문 처리 버튼) */
function headerCard(page: Page) {
  return page
    .locator('[data-slot=card]')
    .filter({ has: page.locator('[data-slot=card-header]', { hasText: '예약번호' }) });
}

/** 예약자 칸의 전화 걸기 링크(연락처를 다 보여줄 때만 있다) */
function phoneLink(page: Page, phone: string) {
  return page.getByRole('link', { name: phone, exact: true });
}

/** 원장님 A 샵 id(조각) */
function ownerShopId(sql: postgres.Sql) {
  return sql`
    select s.id from shops s
    join owners o on o.id = s.owner_id
    join auth.users u on u.id = o.user_id
    where u.email = ${OWNER_EMAIL}`;
}

/** 원장님 A 샵에서 시작이 지났는데 방문·노쇼를 처리하지 않은 예약. 시드에는 하나만 있다 */
async function pendingReservation(): Promise<PendingReservation> {
  const rows = await withDb(
    (sql) => sql<PendingReservation[]>`
      select r.id, r.code, r.slot_id as "slotId", s.start_at as "startAt", s.menu_name as "menuName",
        c.name as "customerName", c.phone as "customerPhone"
      from reservations r
      join slots s on s.id = r.slot_id
      join customers c on c.id = r.customer_id
      where s.shop_id = (${ownerShopId(sql)})
        and r.status = 'confirmed' and r.visit_result is null and s.start_at < now()`,
  );
  expect(rows, '시드의 시작이 지난 처리 전 예약').toHaveLength(1);
  expect(rows[0].customerPhone, '예약자 휴대폰').toMatch(/^010-\d{4}-\d{4}$/);
  return rows[0];
}

/** 예약 상태·방문 결과·처리한 시각과 매물 상태 */
async function visitState(reservationId: string) {
  return withDb(async (sql) => {
    const [row] = await sql<
      {
        status: string;
        visitResult: string | null;
        visitRecordedAt: Date | null;
        slotStatus: string;
      }[]
    >`
      select r.status, r.visit_result as "visitResult", r.visit_recorded_at as "visitRecordedAt",
        s.status as "slotStatus"
      from reservations r
      join slots s on s.id = r.slot_id
      where r.id = ${reservationId}`;
    return row;
  });
}

/** 한국 날짜 'YYYY-MM-DD' */
function kstDateKey(date: Date): string {
  return new Date(date.getTime() + KST_MS).toISOString().slice(0, 10);
}

/** 한국 시각 "13:00" */
function kstTime(date: Date): string {
  return new Date(date.getTime() + KST_MS).toISOString().slice(11, 16);
}

/** 대시보드의 날짜. 예: "11/26(목)" */
function shortDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}/${day}(${weekday})`;
}

/** "010-0001-0002" → "010-****-0002"(가운데를 가린 모양) */
function maskedPhone(phone: string): string {
  const [head, middle, tail] = phone.split('-');
  return [head, '*'.repeat(middle.length), tail].join('-');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
