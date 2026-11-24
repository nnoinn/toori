import { expect, test } from '@playwright/test';

import { holderOf, releaseHoldsOf, reservableSeedSlotIds, signInAs } from './support/seed';

// 손님 홀딩(C-404 10분 홀딩, C-402 환불 규정 필수 동의, #401·#564 결제 중 칩). 결제는 2차(가짜 결제사)에서 누른다(#592)
// 시드 고객 A는 시드가 다른 매물 하나를 홀딩해 둬서(한 사람에 하나) B로 한다
const CUSTOMER = 'customer-b';

test.afterEach(async () => {
  await releaseHoldsOf(CUSTOMER);
});

test('[예약하기]를 누르면 10분 홀딩하고, 환불 규정에 동의하기 전에는 결제할 수 없고, 결제 중 칩의 [그만두기]로 풀면 다시 예약할 수 있다', async ({
  page,
  context,
  baseURL,
}) => {
  await signInAs(context, CUSTOMER, baseURL!);
  const [slotId] = await reservableSeedSlotIds();
  expect(slotId, '예약할 수 있는 시드 매물').toBeDefined();

  // 1. 매물 상세 [예약하기] → 예약 확인 화면, 서버에 내 홀딩
  await page.goto(`/slots/${slotId}`);
  await page.getByRole('button', { name: '예약하기', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/checkout/${slotId}$`));
  const heading = page.getByRole('heading', { name: '예약 확인' });
  await expect(heading).toBeVisible();
  expect(await holderOf(slotId)).toBe(CUSTOMER);

  // 2. 화면 오른쪽 위에 10분 타이머(서버 시각 기준)
  const timer = page.getByLabel('결제 가능 남은 시간');
  await expect(timer).toHaveText(/^(10:00|09:[0-5]\d)$/);
  const timerBox = await timer.boundingBox();
  const headingBox = await heading.boundingBox();
  const viewport = page.viewportSize();
  expect(timerBox && headingBox && viewport).toBeTruthy();
  expect(timerBox!.y + timerBox!.height, '타이머는 제목보다 위').toBeLessThanOrEqual(headingBox!.y);
  expect(timerBox!.x, '타이머는 오른쪽').toBeGreaterThan(viewport!.width / 2);

  // 3. 환불 규정에 동의하기 전에는 결제할 수 없다(C-402). 예약자 정보 제공 동의만으로는 안 된다
  const pay = page.getByRole('button', { name: /결제하기$/ });
  await expect(pay).toBeDisabled();
  await page
    .getByRole('checkbox', { name: /^\(필수\) 예약자 정보를 .+에 제공하는 데 동의해요$/ })
    .check();
  await expect(pay).toBeDisabled();
  await page.getByRole('checkbox', { name: '(필수) 환불 규정을 확인했고 동의해요' }).check();
  await expect(pay).toBeEnabled();

  // 4. 홈으로 돌아가면 결제 중 칩(남은 시간). PC는 위쪽 메뉴의 칩, 폰은 화면 위 가운데 알약이다(#564, 같은 이름)
  await page.goto('/home');
  const chip = page.getByRole('button', { name: /^결제 중인 매물: / });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('결제 중');
  await expect(chip).toContainText(/(10:00|09:[0-5]\d)/);

  // 5. 칩 → [그만두기] → 한 번 더 묻는 창의 [그만두기] → 칩이 사라지고 홀딩이 풀린다
  // (PC는 칩 아래 상자, 폰은 화면 가운데 창에 [그만두기]가 있다, #566)
  await chip.click();
  await page.getByRole('button', { name: '그만두기', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '결제를 그만둘까요?' });
  await confirm.getByRole('button', { name: '그만두기', exact: true }).click();
  await expect(chip).toBeHidden();
  await expect.poll(() => holderOf(slotId)).toBeNull();

  // 6. 다시 [예약하기]를 누를 수 있다
  await page.goto(`/slots/${slotId}`);
  await expect(page.getByRole('button', { name: '예약하기', exact: true })).toBeEnabled();
});
