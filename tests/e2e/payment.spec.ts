import { expect, type Page, test } from '@playwright/test';

import { fakePortOnePayment, useFakePaymentWindow } from './support/portone';
import { holderOf, refundableSeedSlotIds, releaseHoldsOf, signInAs } from './support/seed';

// 결제(가짜 결제사, #592 2차). 결제창은 support/portone.ts의 가짜, 결제 조회·취소는 가짜 포트원 서버(setup/fake-portone.mjs)다.
// FLOW-01의 화면 버전: 홀딩 → 결제 → 예약 확정 → 내 예약 → 24시간 넘게 남았을 때 취소 → 결제액의 70% 환불(X-202, C-503)
// 시드 고객 A는 시드가 다른 매물 하나를 홀딩해 둬서(한 사람에 하나) B로 한다
const CUSTOMER = 'customer-b';

test.afterEach(async () => {
  await releaseHoldsOf(CUSTOMER);
});

/** 예약 확인 화면의 필수 동의 2개(C-402) */
async function agree(page: Page) {
  await page
    .getByRole('checkbox', { name: /^\(필수\) 예약자 정보를 .+에 제공하는 데 동의해요$/ })
    .check();
  await page.getByRole('checkbox', { name: '(필수) 환불 규정을 확인했고 동의해요' }).check();
}

/** 매물 상세 [예약하기] → 예약 확인 화면에서 필수 동의 */
async function holdAndAgree(page: Page, slotId: string) {
  await page.goto(`/slots/${slotId}`);
  await page.getByRole('button', { name: '예약하기', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/checkout/${slotId}$`));
  await agree(page);
}

/** 화면의 금액 표기(src/lib/format.ts formatWon과 같은 모양) */
function won(amount: number) {
  return `${amount.toLocaleString('ko-KR')}원`;
}

test('결제하면 예약이 확정되고 내 예약에 보이며, 24시간 넘게 남았을 때 취소하면 결제액의 70%를 돌려받는다', async ({
  page,
  context,
  baseURL,
  isMobile,
}) => {
  await signInAs(context, CUSTOMER, baseURL!);
  const paymentWindow = await useFakePaymentWindow(page, {
    mobile: isMobile,
    outcome: () => 'paid',
  });
  const [slotId] = await refundableSeedSlotIds();
  expect(slotId, '24시간 넘게 남은 시드 매물').toBeDefined();

  // 1. 홀딩 → 동의 → [결제하기] → 결제창(가짜)에서 결제
  await holdAndAgree(page, slotId);
  await page.getByRole('button', { name: /결제하기$/ }).click();

  // 2. 결과 화면이 서버로 결제를 확인하고(서버는 가짜 포트원에 묻는다) 예약을 확정한다
  await expect(page.getByRole('heading', { name: '예약이 확정됐어요' })).toBeVisible();
  expect(paymentWindow.requests).toHaveLength(1);
  const [{ paymentId, totalAmount }] = paymentWindow.requests;
  expect(await holderOf(slotId), '예약되면 홀딩은 끝난다').toBeNull();

  // 3. 내 예약 목록에 이 예약이 있다
  const detail = page.getByRole('link', { name: '예약 상세 보기' });
  const detailHref = await detail.getAttribute('href');
  expect(detailHref).toMatch(/^\/reservations\/[^/]+$/);
  await page.goto('/reservations');
  await expect(page.locator(`a[href="${detailHref}"]`).first()).toBeVisible();

  // 4. 예약 상세 [예약 취소] → 확인 창: 24시간 이상 남아 위약금 30%, 돌려받을 금액은 결제액의 70%(CLAUDE.md 고객 취소 위약금)
  const refund = (totalAmount * 70) / 100;
  expect(Number.isInteger(refund), '시드 가격은 10원 단위라 70%가 원 단위로 떨어진다').toBe(true);
  await page.goto(detailHref!);
  await page.getByRole('button', { name: '예약 취소', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '예약을 취소할까요?' });
  await expect(dialog.getByText('위약금(30%)')).toBeVisible();
  await expect(dialog.getByText(won(refund), { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '예약 취소하기' }).click();
  await expect(page.getByRole('dialog', { name: '예약을 취소했어요' })).toBeVisible();

  // 5. 포트원(가짜)이 받은 취소도 결제액의 70% 한 번이다
  await expect
    .poll(async () =>
      (await fakePortOnePayment(paymentId))?.cancellations.map((c) => c.totalAmount),
    )
    .toEqual([refund]);
});

test('결제창을 닫으면 예약 확인으로 돌아가 남은 시간 안에 다시 결제할 수 있다', async ({
  page,
  context,
  baseURL,
  isMobile,
}) => {
  await signInAs(context, CUSTOMER, baseURL!);
  // 처음엔 결제창을 닫고, 다시 열면 결제한다
  const outcomes: ('closed' | 'paid')[] = ['closed', 'paid'];
  const paymentWindow = await useFakePaymentWindow(page, {
    mobile: isMobile,
    outcome: () => outcomes.shift() ?? 'paid',
  });
  const [slotId] = await refundableSeedSlotIds();
  expect(slotId, '24시간 넘게 남은 시드 매물').toBeDefined();

  await holdAndAgree(page, slotId);
  await page.getByRole('button', { name: /결제하기$/ }).click();

  // 1. 결제창을 닫음 → 예약하지 못했어요 + [예약 확인으로 돌아가기](홀딩은 그대로, D12)
  await expect(page.getByRole('heading', { name: '예약하지 못했어요' })).toBeVisible();
  expect(await holderOf(slotId), '닫아도 홀딩은 남는다').toBe(CUSTOMER);
  await page.getByRole('link', { name: '예약 확인으로 돌아가기' }).click();
  await expect(page).toHaveURL(new RegExp(`/checkout/${slotId}$`));

  // 2. 다시 동의하고 결제 → 예약 확정. 결제창은 두 번 열렸고 결제 번호는 매번 새로 받는다
  await agree(page);
  await page.getByRole('button', { name: /결제하기$/ }).click();
  await expect(page.getByRole('heading', { name: '예약이 확정됐어요' })).toBeVisible();
  expect(paymentWindow.requests).toHaveLength(2);
  const [first, second] = paymentWindow.requests;
  expect(second.paymentId).not.toBe(first.paymentId);
  expect((await fakePortOnePayment(first.paymentId))?.status, '닫은 결제').toBe('FAILED');
});
