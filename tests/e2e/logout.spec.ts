import { expect, test } from '@playwright/test';

import { signInAs } from './support/seed';

// 로그아웃(AUTH-08, 11/12 점검 9-1). 고객·원장님 모두 첫 화면(/)을 새로 열고, 지금 화면은 방문 기록에서 빼서
// 뒤로 가기로 로그인한 화면이 다시 보이지 않는다(src/components/ui/use-sign-out.ts)
test('고객 로그아웃: 첫 화면이 열리고, 뒤로 가기로 내 정보가 다시 보이지 않는다', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAs(context, 'customer-c', baseURL!);
  await page.goto('/home');
  // 로그인한 고객의 PC 위쪽 메뉴에는 알림 종(누르면 최근 알림 상자)이 있다
  const bell = page.getByRole('banner').getByRole('button', { name: /^알림/ });
  await expect(bell).toBeVisible();
  await page.getByRole('link', { name: '내 정보' }).click();
  await expect(page).toHaveURL(/\/me$/);

  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(page.getByRole('link', { name: '로그인 없이 둘러보기' })).toBeVisible();

  // 뒤로 가기: 내 정보는 기록에서 빠져서 그 앞 화면(홈)이 로그아웃된 모습으로 열린다
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  await page.waitForLoadState('networkidle');
  await expect(bell).toHaveCount(0);
  // 내 정보는 다시 로그인해야 열린다
  await page.goto('/me');
  await expect(page).toHaveURL(/\/login\?/);
});

test('원장님 로그아웃: 첫 화면이 열리고, 뒤로 가기로 원장님 화면이 다시 보이지 않는다', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAs(context, 'owner-a', baseURL!);
  await page.goto('/owner');
  await page.goto('/owner/account');
  await page.getByRole('main').getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(page.getByRole('link', { name: '로그인 없이 둘러보기' })).toBeVisible();

  // 뒤로 가기: 내 계정은 기록에서 빠졌고, 그 앞 원장님 화면은 로그인해야 열리므로 로그인 화면으로 간다
  await page.goBack();
  await expect(page).toHaveURL(/\/login\?/);
});
