import { expect, test } from '@playwright/test';

import { openSeedSlotIds } from './support/seed';

// 매물 공유(C-310). PC처럼 공유 창이 없으면 [공유]가 매물 주소를 복사하고,
// 매물 주소에는 할인율·시작 시각이 담긴 미리보기 제목·설명·그림(1200×630)이 붙는다
test('[공유]는 공유 창이 없으면 매물 주소를 복사하고, 매물 주소에는 미리보기 설명과 그림이 붙는다', async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // 폰의 공유 창(navigator.share)이 없는 브라우저로 본다
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  const [slotId] = await openSeedSlotIds();
  expect(slotId, '로그인 없이 볼 수 있는 시드 매물').toBeDefined();

  await page.goto(`/slots/${slotId}`);
  await page.getByRole('button', { name: '공유', exact: true }).click();
  await expect(page.getByText('링크를 복사했어요')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(new URL(`/slots/${slotId}`, page.url()).toString());

  // 링크 미리보기: 설명에 할인율·판매가·시작 시각, 그림은 1200×630 PNG
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    'content',
    /^\d+% 할인 [\d,]+원 · \d+\/\d+\(.\) \d{2}:\d{2} 시작 · /,
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
  const image = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(image, '미리보기 그림 주소').toBeTruthy();
  const response = await request.get(image!);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');
});
