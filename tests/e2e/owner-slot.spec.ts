import { expect, type Page, test } from '@playwright/test';
import type postgres from 'postgres';

import { signInAs, withDb } from './support/seed';

// 원장님 매물 등록 → 대시보드·예약 현황 → 마감(#23 원장님 E2E 1번 흐름, S-201·S-205·S-206).
// 3탭(① 서비스 ② 시간 ③ 할인율)으로 미리 올린 매물이 게시예정으로 보이고(SLOT-01), 사유를 골라 마감하면
// 사유·시각이 남고 그 시간에 다시 올릴 수 있다(SLOT-07).
// 시드 원장님 A(샘플 헤어 중앙역점, scripts/seed-data.mjs): 메뉴 "여성 커트"(60분), 월요일 휴무, 10:00부터 영업.
// 4일 뒤부터는 계속 쓰는 시험 매물(11·15시)이 있어서, 고른 날의 줄이 그어지지 않은 첫 시각(보통 10:00)을 누른다
const OWNER = 'owner-a';
const OWNER_EMAIL = 'owner-a@seed.test';
const MENU = '여성 커트';
const MENU_MINUTES = 60;
const RATE = '30%';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const MONDAY = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;

// 원장님 화면의 폰 배치는 출시 뒤(사이클 9단계)라 PC에서만 본다(#592 3차 폰 크기 실행에서 건너뛴다)
test.skip(
  ({ isMobile }) => isMobile,
  '원장님 화면의 폰 배치는 출시 뒤(사이클 9단계)라 PC에서만 본다',
);

/** 테스트를 시작한 시각. 이 뒤에 원장님 A가 올린 매물을 끝나면 지운다 */
let startedAt: Date | null = null;

test.beforeEach(() => {
  startedAt = new Date();
});

// 테스트가 올린 매물은 로컬 E2E DB에서 지운다(화면에는 지우기가 없다, S-206). 실패해서 다시 돌 때(GitHub 검사는 한 번 더 돈다)
// 같은 시각에 매물이 남아 겹침에 막히거나 마감 목록에 같은 줄이 둘 생기지 않게 한다. 예약·결제가 없는 매물이라 다른 표가 가리키지 않는다.
// 폰에서 건너뛰면 위 beforeEach는 돌지 않고 이 afterEach만 돌아서, 시작 시각이 없으면 지우지 않는다
test.afterEach(async () => {
  if (!startedAt) return;
  const since = startedAt;
  startedAt = null;
  await withDb(async (sql) => {
    await sql`
      delete from slots
      where shop_id = (${ownerShopId(sql)}) and created_at >= ${since} and window_id is null`;
  });
});

test('매물을 3탭으로 미리 올리면 대시보드·예약 현황에 게시예정으로 보이고, 사유를 골라 마감하면 사유가 남고 그 시간에 다시 올릴 수 있다', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAs(context, OWNER, baseURL!);
  // 시작이 48시간보다 멀어서 게시예정이 되는 날(4일 뒤부터, 휴무인 월요일은 건너뛴다)
  const dateKey = firstOpenDateKey(4);

  // 1. 매물 등록: ① 서비스 → ② 날짜·시각 → ③ 할인율 → [등록하기]
  await page.goto('/owner/slots/new');
  const time = await chooseMenuDateAndFirstTime(page, dateKey);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByText('③ 얼마나 할인할까요?')).toBeVisible();
  await page.getByRole('radiogroup', { name: '할인율' }).getByRole('radio', { name: RATE }).click();
  await page.getByRole('button', { name: '등록하기', exact: true }).click();

  await expect(page.getByText('매물을 올렸어요')).toBeVisible();
  await expect(page.getByText(/^게시예정 상태로 저장했어요\./)).toBeVisible();
  const startAt = new Date(`${dateKey}T${time}:00+09:00`);
  const saved = await slotAt(startAt);
  expect(saved, '올린 매물').toMatchObject({ status: 'scheduled', discountRate: 30 });

  // 2. 대시보드: [예정] 탭의 게시예정 매물에 보인다
  await page.getByRole('link', { name: '대시보드로' }).click();
  await expect(page).toHaveURL(/\/owner$/);
  await page.getByRole('tab', { name: /^예정 \d+$/ }).click();
  await page.getByRole('button', { name: /^게시예정 \d+$/ }).click();
  const row = page
    .getByRole('listitem')
    .filter({ hasText: `${shortDate(dateKey)} ${time}` })
    .filter({ hasText: MENU });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('게시예정');

  // 3. 예약 현황(그 날 하루 보기): 그 시간 칸이 게시예정이고, 누르면 매물 수정으로 간다
  await page.goto(`/owner/schedule?view=day&date=${dateKey}`);
  const block = page.getByRole('link', {
    name: `${time}~${addMinutes(time, MENU_MINUTES)}, ${MENU}, 게시예정`,
  });
  await expect(block).toBeVisible();
  await expect(block).toHaveAttribute('href', `/owner/slots/${saved!.id}/edit`);

  // 4. 대시보드에서 [마감] → 사유(잘못 올림) → [마감하기]
  await page.goto('/owner');
  await page.getByRole('tab', { name: /^예정 \d+$/ }).click();
  await page.getByRole('button', { name: /^게시예정 \d+$/ }).click();
  await row.getByRole('button', { name: '마감', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '매물을 마감할까요?' });
  const close = dialog.getByRole('button', { name: '마감하기', exact: true });
  // 사유를 고르기 전에는 마감할 수 없다
  await expect(close).toBeDisabled();
  // 사유 칩은 글자를 누른다(라디오는 화면 읽기용으로 숨겨 두었다)
  const reasons = dialog.getByRole('group', { name: '마감 사유' });
  await reasons.getByText('잘못 올림', { exact: true }).click();
  await expect(reasons.getByRole('radio', { name: '잘못 올림' })).toBeChecked();
  await close.click();
  await expect(dialog).toBeHidden();

  // 마감 목록에 사유와 함께 보이고, DB에 사유와 시각이 남는다(지우지 않는다)
  await page.getByRole('button', { name: /^마감 \d+$/ }).click();
  await expect(row).toContainText('마감');
  await expect(row).toContainText('잘못 올림');
  const closed = await slotAt(startAt);
  expect(closed).toMatchObject({ id: saved!.id, status: 'closed', closeReason: 'mistake' });
  expect(closed!.closedAt, '마감한 시각').not.toBeNull();

  // 5. 마감한 시간에는 새 매물을 다시 올릴 수 있다(겹침은 게시예정·게시중·예약됨끼리만 본다)
  await page.goto('/owner/slots/new');
  await chooseMenuAndDate(page, dateKey);
  await expect(startTimes(page).getByRole('button', { name: time, exact: true })).toBeEnabled();
});

/** ① 서비스를 고르고 [다음] → ② 날짜를 고른다 */
async function chooseMenuAndDate(page: Page, dateKey: string) {
  const menuCard = page
    .locator('[data-slot=card]')
    .filter({ hasText: '① 어떤 서비스를 올릴까요?' });
  await menuCard.getByRole('button', { name: new RegExp(MENU) }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page
    .getByRole('group', { name: '날짜' })
    .getByRole('button', { name: dateLabel(dateKey), exact: true })
    .click();
}

/** ①② 고르기. 고른 날의 첫 시작 시각 중 줄이 그어지지 않은(이미 올린 매물과 겹치지 않는) 것을 누르고 그 시각("10:00")을 돌려준다 */
async function chooseMenuDateAndFirstTime(page: Page, dateKey: string): Promise<string> {
  await chooseMenuAndDate(page, dateKey);
  const first = startTimes(page).locator('button:enabled').first();
  const time = (await first.textContent())?.trim() ?? '';
  expect(time, '고를 수 있는 시작 시각').toMatch(/^\d{2}:\d{2}$/);
  await first.click();
  return time;
}

function startTimes(page: Page) {
  return page.getByRole('region', { name: '시작 시각' });
}

/** 원장님 A 샵 id(조각) */
function ownerShopId(sql: postgres.Sql) {
  return sql`
    select s.id from shops s
    join owners o on o.id = s.owner_id
    join auth.users u on u.id = o.user_id
    where u.email = ${OWNER_EMAIL}`;
}

/** 원장님 A 샵에서 그 시각에 시작하는 매물 중 가장 최근에 올린 것 */
async function slotAt(startAt: Date) {
  return withDb(async (sql) => {
    const [row] = await sql<
      {
        id: string;
        status: string;
        discountRate: number;
        closeReason: string | null;
        closedAt: Date | null;
      }[]
    >`
      select id, status, discount_rate as "discountRate", close_reason as "closeReason", closed_at as "closedAt"
      from slots
      where shop_id = (${ownerShopId(sql)}) and start_at = ${startAt} and window_id is null
      order by created_at desc
      limit 1`;
    return row ?? null;
  });
}

/** 오늘(한국 날짜)로부터 afterDays일 뒤부터 처음으로 휴무(월요일)가 아닌 날 'YYYY-MM-DD' */
function firstOpenDateKey(afterDays: number): string {
  for (let day = afterDays; ; day += 1) {
    const kst = new Date(Date.now() + KST_MS + day * DAY_MS);
    if (kst.getUTCDay() !== MONDAY) return kst.toISOString().slice(0, 10);
  }
}

function partsOf(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { month, day, weekday: WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] };
}

/** 등록 달력의 날짜 이름. 예: "11월 30일(일)" */
function dateLabel(dateKey: string): string {
  const { month, day, weekday } = partsOf(dateKey);
  return `${month}월 ${day}일(${weekday})`;
}

/** 대시보드의 날짜. 예: "11/30(일)" */
function shortDate(dateKey: string): string {
  const { month, day, weekday } = partsOf(dateKey);
  return `${month}/${day}(${weekday})`;
}

/** "10:00" + 60분 → "11:00" */
function addMinutes(time: string, minutes: number): string {
  const [hour, minute] = time.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
