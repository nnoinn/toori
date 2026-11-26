// E2E 도우미(#592 2차): 포트원 결제창 대신하기와 가짜 포트원 서버 읽기.
//
// 결제창: @portone/browser-sdk는 화면에 window.PortOne이 이미 있으면 결제창 스크립트(cdn.portone.io)를 받지 않고 그걸 쓴다.
// 그래서 화면이 열리기 전에 가짜 window.PortOne을 넣고, 진짜 스크립트 주소는 막는다. 가짜 결제창은 결과를 가짜 포트원 서버에
// 넣은 뒤 진짜처럼 돌아간다: PC는 결제창이 닫히며 결과를 돌려주고(checkout-view.tsx가 결과 화면으로 보낸다),
// 폰은 결제 페이지에서 돌아오듯 결과 화면 주소(redirectUrl)로 바로 간다.
// 그다음은 진짜와 같다: 결과 화면이 서버로 결제를 확인하고, 서버가 가짜 포트원 서버에 묻는다(PORTONE_API_URL).

import type { Page } from '@playwright/test';

import { CLOSED_WINDOW_CODE, FAKE_PORTONE, type FakePayment } from '../setup/fake-portone.mjs';

/** 결제창을 열 때 앱이 넘기는 값 중 테스트가 보는 것(payment-window.ts toPortOneRequest) */
export type PaymentWindowRequest = {
  storeId: string;
  channelKey: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  currency: string;
  redirectUrl: string;
  payMethod: string;
};

/** 결제창에서 결제를 마쳤다(paid) / 결제하지 않고 닫았다(closed) */
export type PaymentWindowOutcome = 'paid' | 'closed';

const EXPOSED = '__e2ePaymentWindow';

/** 가짜 포트원 서버에 결제창 결과를 넣는다 */
async function putPayment(paymentId: string, outcome: PaymentWindowOutcome, amount: number) {
  const response = await fetch(
    `${FAKE_PORTONE.url}/__e2e/payments/${encodeURIComponent(paymentId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, amount }),
    },
  );
  if (!response.ok) throw new Error(`가짜 포트원에 결제를 넣지 못했어요: ${response.status}`);
}

/**
 * 이 화면의 포트원 결제창을 가짜로 바꾼다. 화면을 열기 전에 부른다.
 * outcome: 결제창을 열 때마다 결과를 고른다(처음엔 닫고 다음엔 결제 등). 돌려준 requests에 결제창 요청이 쌓인다
 */
export async function useFakePaymentWindow(
  page: Page,
  { mobile, outcome }: { mobile: boolean; outcome: () => PaymentWindowOutcome },
) {
  const requests: PaymentWindowRequest[] = [];
  // 진짜 결제창 스크립트로는 나가지 않는다
  await page.route('https://cdn.portone.io/**', (route) => route.abort());
  await page.exposeFunction(EXPOSED, async (request: PaymentWindowRequest) => {
    requests.push(request);
    const result = outcome();
    await putPayment(request.paymentId, result, request.totalAmount);
    // 닫으면 결제사가 준 코드를 같이 돌려준다(진짜 결제창과 같다)
    return result === 'closed' ? { code: CLOSED_WINDOW_CODE, message: '결제를 취소했어요' } : {};
  });
  await page.addInitScript(
    ({ isMobile, exposed }) => {
      type Result = { code?: string; message?: string };
      const w = window as unknown as Record<string, unknown>;
      w.PortOne = {
        requestPayment: async (request: { paymentId: string; redirectUrl: string }) => {
          const openWindow = w[exposed] as (request: unknown) => Promise<Result>;
          const result = await openWindow(request);
          if (isMobile) {
            // 폰: 결제 페이지에서 돌아오듯 결과 화면으로 간다(결과는 주소에 붙는다)
            const url = new URL(request.redirectUrl);
            url.searchParams.set('paymentId', request.paymentId);
            if (result.code) url.searchParams.set('code', result.code);
            if (result.message) url.searchParams.set('message', result.message);
            window.location.assign(url.toString());
            return undefined;
          }
          // PC: 화면 위 결제창이 닫히며 결과를 돌려준다
          return {
            transactionType: 'PAYMENT',
            paymentId: request.paymentId,
            txId: `e2e-tx-${request.paymentId}`,
            ...result,
          };
        },
      };
    },
    { isMobile: mobile, exposed: EXPOSED },
  );
  return { requests };
}

/** 가짜 포트원 서버에 있는 결제(취소 내역 포함). 없으면 null */
export async function fakePortOnePayment(paymentId: string): Promise<FakePayment | null> {
  const response = await fetch(
    `${FAKE_PORTONE.url}/__e2e/payments/${encodeURIComponent(paymentId)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`가짜 포트원 결제를 읽지 못했어요: ${response.status}`);
  return (await response.json()) as FakePayment;
}
