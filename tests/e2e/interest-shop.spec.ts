import { expect, test } from '@playwright/test';

import { reservableSeedSlotIds, signInAs, withDb } from './support/seed';

// 관심 샵(C-211, 예전 이름 찜). 매물 상세의 [관심 샵]을 누르면 관심 샵 화면에 그 샵이 나오고, 다시 누르면 빠진다.
// 시드 고객 C는 관심 샵이 없다(시드가 지운다). 테스트가 남긴 관심 샵은 끝나면 지운다
const CUSTOMER = 'customer-c';

async function clearFavorites() {
  await withDb(async (sql) => {
    await sql`
      delete from favorites
      where customer_id in (
        select c.id from customers c join auth.users u on u.id = c.user_id
        where u.email = ${`${CUSTOMER}@seed.test`}
      )`;
  });
}

test.beforeEach(clearFavorites);
test.afterEach(clearFavorites);

test('매물 상세의 [관심 샵]을 누르면 관심 샵 화면에 그 샵이 나오고, 다시 누르면 빠진다', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAs(context, CUSTOMER, baseURL!);
  const [slotId] = await reservableSeedSlotIds();
  expect(slotId, '예약할 수 있는 시드 매물').toBeDefined();
  const shopName = await withDb(async (sql) => {
    const [row] = await sql<{ name: string }[]>`
      select sh.name from slots s join shops sh on sh.id = s.shop_id where s.id = ${slotId}`;
    return row.name;
  });

  // 홈 바로가기 이름도 '관심'이다
  await page.goto('/home');
  await expect(
    page.getByRole('navigation', { name: '바로가기' }).getByRole('link', { name: '관심' }),
  ).toBeVisible();

  await page.goto(`/slots/${slotId}`);
  const button = page.getByRole('button', { name: '관심 샵', exact: true });
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toBeEnabled();

  await page.goto('/home/favorites?tab=shops');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('관심');
  const list = page.getByRole('region', { name: '관심 샵' });
  await expect(list.getByRole('region', { name: shopName })).toBeVisible();

  await page.goto(`/slots/${slotId}`);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(button).toBeEnabled();

  await page.goto('/home/favorites?tab=shops');
  await expect(page.getByText('아직 관심 샵이 없어요')).toBeVisible();
});
