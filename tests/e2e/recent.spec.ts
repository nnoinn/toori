import { expect, test } from '@playwright/test';

import { reservableSeedSlotIds } from './support/seed';

// 최근 본 매물(C-212). 로그인 없이 매물 상세를 열면 이 기기에 남고, 오른쪽 아래 버튼을 누르면 본 순서(최근 것부터)대로 보인다.
// 기록은 브라우저 저장소에만 있어서 테스트마다 새 브라우저로 시작한다(Playwright 기본)
test('매물 상세를 열면 최근 본 매물에 남고, 버튼을 누르면 본 순서대로 보이고, 모두 지우면 버튼이 사라진다', async ({
  page,
}) => {
  const [first, second] = await reservableSeedSlotIds();
  expect(second, '예약할 수 있는 시드 매물 두 개').toBeDefined();

  const recentButton = page.getByRole('button', { name: /^최근 본 매물/ });
  for (const slotId of [first, second]) {
    await page.goto(`/slots/${slotId}`);
    await expect(page.getByRole('button', { name: '예약하기', exact: true })).toBeVisible();
    // 매물 상세에서는 버튼을 두지 않는다(폰의 아래 예약 바와 겹쳐서)
    await expect(recentButton).toHaveCount(0);
  }

  await page.goto('/home');
  await page.getByRole('button', { name: '최근 본 매물 2개' }).click();
  const links = page.getByRole('list', { name: '최근 본 매물' }).getByRole('link');
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute('href', `/slots/${second}`);
  await expect(links.nth(1)).toHaveAttribute('href', `/slots/${first}`);

  // 줄을 누르면 그 매물 상세로 간다
  await links.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/slots/${first}$`));

  // 모두 지우면 버튼이 사라진다
  await page.goto('/home');
  await page.getByRole('button', { name: /^최근 본 매물 \d+개$/ }).click();
  await page.getByRole('button', { name: '모두 지우기' }).click();
  await expect(recentButton).toHaveCount(0);
});
