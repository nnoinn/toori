import { expect, test } from '@playwright/test';

import { openSeedSlotIds } from './support/seed';

// 로그인 없이 둘러보기(#215, C-102·C-301). 첫 화면 → 둘러보기 → 동네 고르기 → 홈 매물 → 매물 상세 → [예약하기]는 로그인 화면으로
test('로그인 없이 둘러보다가 [예약하기]를 누르면 고객 로그인 화면으로 가고, 로그인 뒤 돌아올 곳은 그 매물이다', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: '로그인 없이 둘러보기' }).click();
  await expect(page).toHaveURL(/\/home$/);

  // 처음 들어온 고객은 동네부터 고른다(C-102). 시드 샵이 있는 안산시 단원구
  await page.getByRole('button', { name: '동네 고르기' }).click();
  await page
    .getByRole('region', { name: '지금 영업하는 동네' })
    .getByRole('button', { name: '안산시 단원구' })
    .click();

  // 홈의 매물 중 지금 누구도 결제하고 있지 않은 매물 하나를 연다
  const cards = page.locator('main a[href^="/slots/"]');
  await expect(cards.first()).toBeVisible();
  const open = new Set(await openSeedSlotIds());
  const hrefs = await cards.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  const slotId = hrefs
    .map((href) => href?.match(/^\/slots\/([0-9a-f-]{36})/)?.[1])
    .find((id) => id !== undefined && open.has(id));
  expect(slotId, '홈에 결제 중이 아닌 시드 매물').toBeDefined();

  await cards
    .and(page.locator(`[href^="/slots/${slotId}"]`))
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/slots/${slotId}`));

  await page.getByRole('button', { name: '예약하기', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?/);
  const params = new URL(page.url()).searchParams;
  expect(params.get('mode')).toBe('customer');
  expect(params.get('next')).toBe(`/slots/${slotId}`);
});
