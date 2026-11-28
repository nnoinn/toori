import { expect, test } from '@playwright/test';

import { reservableSeedSlotIds, signInAs, withDb } from './support/seed';

// 관심 매물(C-211). 매물 상세의 [관심 매물]을 누르면 관심 화면 [매물 보기](기본 탭)에 그 매물이 나오고, 다시 누르면 빠진다.
// 테스트가 남긴 관심 매물은 앞뒤로 지운다
const CUSTOMER = 'customer-c';

async function clearSlotInterests() {
  await withDb(async (sql) => {
    await sql`
      delete from slot_interests
      where customer_id in (
        select c.id from customers c join auth.users u on u.id = c.user_id
        where u.email = ${`${CUSTOMER}@seed.test`}
      )`;
  });
}

test.beforeEach(clearSlotInterests);
test.afterEach(clearSlotInterests);

test('매물 상세의 [관심 매물]을 누르면 관심 화면 [매물 보기]에 나오고, 다시 누르면 빠진다', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAs(context, CUSTOMER, baseURL!);
  const [slotId] = await reservableSeedSlotIds();
  expect(slotId, '예약할 수 있는 시드 매물').toBeDefined();

  await page.goto(`/slots/${slotId}`);
  const button = page.getByRole('button', { name: '관심 매물', exact: true });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toBeEnabled();

  // 홈 바로가기 [관심]은 [매물 보기]로 연다
  await page.goto('/home/favorites');
  await expect(page.getByRole('link', { name: '매물 보기', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const open = page.getByRole('list', { name: '지금 예약할 수 있는 관심 매물' });
  await expect(open.locator(`a[href="/slots/${slotId}"]`)).toBeVisible();

  await open.locator(`a[href="/slots/${slotId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/slots/${slotId}$`));
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toBeEnabled();

  await page.goto('/home/favorites');
  await expect(page.getByText('아직 관심 매물이 없어요')).toBeVisible();
});
