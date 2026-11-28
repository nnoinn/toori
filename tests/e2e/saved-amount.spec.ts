import { expect, test } from '@playwright/test';

import { signInAs } from './support/seed';

// 투리로 아낀 금액(C-108). 내 정보 맨 위에 방문 완료 예약의 (정가 − 실제 결제액) 합이 보인다.
// 시드 고객 B에게는 방문 완료 예약이 있다(scripts/seed-data.mjs). 금액 계산은 DB 테스트가 보고, 여기서는 화면에 나오는지 본다
test('내 정보 맨 위에 아낀 금액과 더한 방문 건수가 보인다', async ({ page, context, baseURL }) => {
  await signInAs(context, 'customer-b', baseURL!);
  await page.goto('/me');

  const saved = page.getByRole('region', { name: /로 아낀 금액$/ });
  await expect(saved).toBeVisible();
  await expect(saved).toContainText(/[1-9][\d,]*원/);
  await expect(saved).toContainText(
    /방문을 마친 예약 [1-9]\d*건에서 정가보다 덜 낸 금액을 더했어요/,
  );

  // 맨 위: 이름 입력보다 위에 있다
  const savedBox = await saved.boundingBox();
  const nameBox = await page.getByLabel('이름', { exact: true }).boundingBox();
  expect(savedBox && nameBox).toBeTruthy();
  expect(savedBox!.y).toBeLessThan(nameBox!.y);
});
