import { expect, test } from '@playwright/test';

import { onboardingSeenOf, setOnboardingSeen, signInAs } from './support/seed';

// 첫 로그인 안내(C-107). 고객 계정으로 처음 들어오면 한 번 저절로 열리고, 닫으면 계정에 본 시각을 남겨 다시 열리지 않는다.
// 내 정보의 [안내 다시 보기]로 다시 볼 수 있다. 4장을 [다음]으로 넘기고 마지막 장의 [시작하기]로 닫는다. 다시 열면 첫 장부터다
// 다른 테스트는 signInAs가 안내를 본 것으로 해 둔다
test('내 정보의 [안내 다시 보기]로 안내 4장을 넘겨 보고, 닫았다 다시 열면 첫 장부터다', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAs(context, 'customer-c', baseURL!);
  await page.goto('/me');

  const replay = page.getByRole('button', { name: '안내 다시 보기' });
  await replay.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('1 / 4')).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText('빈 시간을 할인해서 예약해요');
  await expect(dialog.getByRole('button', { name: '이전' })).toHaveCount(0);

  for (const step of [2, 3, 4]) {
    await dialog.getByRole('button', { name: '다음', exact: true }).click();
    await expect(dialog.getByText(`${step} / 4`)).toBeVisible();
    if (step === 3) {
      // 결제 직후에도 무료 취소가 되지 않는다는 장(결제 동의와 같은 문장, C-402)
      await expect(dialog.getByRole('heading')).toHaveText('결제 직후에도 무료 취소가 되지 않아요');
      await expect(dialog.getByText('6시간 미만·노쇼: 환불 없음')).toBeVisible();
    }
  }
  await expect(dialog.getByRole('button', { name: '다음', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '시작하기' }).click();
  await expect(dialog).toBeHidden();

  await replay.click();
  await expect(page.getByRole('dialog').getByText('1 / 4')).toBeVisible();
});

test('고객 계정으로 처음 들어오면 안내가 저절로 열리고, 닫으면 다음부터는 열리지 않는다', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAs(context, 'customer-c', baseURL!, { onboardingSeen: false });
  try {
    await page.goto('/home');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('1 / 4')).toBeVisible();
    await dialog.getByRole('button', { name: '닫기' }).click();
    await expect(dialog).toBeHidden();
    // 계정에 본 시각이 남는다(다른 기기에서도 다시 뜨지 않는다)
    await expect.poll(() => onboardingSeenOf('customer-c')).toBe(true);

    await page.goto('/reservations');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await setOnboardingSeen('customer-c', true);
  }
});
