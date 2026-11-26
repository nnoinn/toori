// 브라우저 자동 테스트(E2E, #592 2차)의 가짜 포트원 서버.
// 앱 서버는 환경변수 PORTONE_API_URL(src/server/payments/portone.ts, 내 컴퓨터 주소만 받는다)로 결제 조회·취소를 여기로 보낸다.
// 테스트는 결제창 대신 "결제를 마쳤다"를 여기에 넣고(PUT /__e2e/payments/:id), 앱이 보낸 취소를 읽는다(GET /__e2e/payments/:id).
// 포트원 V2 API 중 앱이 쓰는 두 개만 흉내 낸다: GET /payments/{paymentId}, POST /payments/{paymentId}/cancel.
// 규칙은 tests/flows/fakes.ts의 fakePortOne과 같다(취소 가능 잔액이 맞지 않으면 거절해서 두 번 환불되지 않는다).
// Playwright가 설정 파일과 함께 이 파일을 CommonJS로 바꿔 읽으므로 import.meta를 쓰지 않는다(서버 켜기는 fake-portone-server.mjs)

/** E2E 전용 가짜 값(진짜 포트원 키가 아니다). 앱 서버 환경변수(local-supabase.mjs e2eAppEnv)와 가짜 서버가 같이 쓴다 */
export const FAKE_PORTONE = {
  port: 4010,
  url: 'http://127.0.0.1:4010',
  storeId: 'store-e2e-fake',
  channelKey: 'channel-key-e2e-fake',
  secret: 'e2e-fake-portone-secret',
};

/** 고객이 결제창을 닫았을 때 결제사(토스페이먼츠)가 주는 코드. 앱은 이 코드면 "결제 취소"로 본다(checkout.ts) */
export const CLOSED_WINDOW_CODE = 'PAY_PROCESS_CANCELED';

/** @typedef {{ status: 'SUCCEEDED', id: string, totalAmount: number, reason: string, cancelledAt: string }} FakeCancellation */
/**
 * @typedef {{
 *   status: 'PAID' | 'FAILED' | 'PARTIAL_CANCELLED' | 'CANCELLED',
 *   amount: { total: number },
 *   currency: 'KRW',
 *   paidAt?: string,
 *   method?: { type: string },
 *   failure?: { reason: string, pgCode: string, pgMessage: string },
 *   cancellations: FakeCancellation[],
 * }} FakePayment
 */

/** @typedef {{ status: number, body: unknown }} FakeResponse */

/** 가짜 포트원의 결제 기록(결제 번호 → 결제). 서버 하나가 테스트 내내 같은 기록을 쓴다 */
export function createFakePortOneState() {
  return { /** @type {Map<string, FakePayment>} */ payments: new Map(), cancelCount: 0 };
}

/**
 * 테스트가 결제창에서 결제를 마쳤다(paid)거나 결제창을 닫았다(closed)고 넣는다.
 * 닫으면 진짜 포트원처럼 FAILED와 결제사 코드(PAY_PROCESS_CANCELED)를 남긴다(11/1 실제 테스트 결제에서 확인, checkout.ts)
 * @param {ReturnType<typeof createFakePortOneState>} state
 * @param {string} paymentId
 * @param {{ outcome: 'paid' | 'closed', amount: number, now?: Date }} input
 */
export function recordPaymentWindow(state, paymentId, { outcome, amount, now = new Date() }) {
  /** @type {FakePayment} */
  const payment =
    outcome === 'paid'
      ? {
          status: 'PAID',
          amount: { total: amount },
          currency: 'KRW',
          paidAt: now.toISOString(),
          method: { type: 'PaymentMethodCard' },
          cancellations: [],
        }
      : {
          status: 'FAILED',
          amount: { total: amount },
          currency: 'KRW',
          failure: {
            reason: '고객이 결제창을 닫았어요',
            pgCode: CLOSED_WINDOW_CODE,
            pgMessage: '결제를 취소했어요',
          },
          cancellations: [],
        };
  state.payments.set(paymentId, payment);
  return payment;
}

/** @param {number} status @param {string} type @returns {FakeResponse} */
function fail(status, type) {
  return { status, body: { type, message: `가짜 포트원: ${type}` } };
}

/** 앱 서버가 보낸 API 시크릿과 상점 아이디가 E2E 가짜 값인지 */
function authorized(headers, storeId) {
  return (
    headers.authorization === `PortOne ${FAKE_PORTONE.secret}` && storeId === FAKE_PORTONE.storeId
  );
}

/** 이미 돌려준 금액을 뺀 취소 가능 잔액 */
function cancellableAmount(payment) {
  return payment.amount.total - payment.cancellations.reduce((sum, c) => sum + c.totalAmount, 0);
}

/**
 * 요청 하나를 처리한다(네트워크 없이 단위 테스트할 수 있게 http 서버와 나눴다).
 * @param {ReturnType<typeof createFakePortOneState>} state
 * @param {{ method: string, url: string, headers: Record<string, string | undefined>, body: unknown }} request
 * @returns {FakeResponse}
 */
export function handleFakePortOne(state, { method, url, headers, body }) {
  const { pathname, searchParams } = new URL(url, FAKE_PORTONE.url);
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (method === 'GET' && pathname === '/health') return { status: 200, body: { ok: true } };

  // 테스트가 쓰는 칸: 결제창 결과 넣기, 결제 기록(취소 내역) 읽기
  if (parts[0] === '__e2e' && parts[1] === 'payments' && parts.length === 3) {
    const paymentId = parts[2];
    if (method === 'PUT') {
      const input = /** @type {{ outcome?: unknown, amount?: unknown }} */ (body ?? {});
      if (
        (input.outcome !== 'paid' && input.outcome !== 'closed') ||
        typeof input.amount !== 'number'
      ) {
        return fail(400, 'INVALID_REQUEST');
      }
      return {
        status: 200,
        body: recordPaymentWindow(state, paymentId, {
          outcome: input.outcome,
          amount: input.amount,
        }),
      };
    }
    if (method === 'GET') {
      const payment = state.payments.get(paymentId);
      return payment ? { status: 200, body: payment } : fail(404, 'PAYMENT_NOT_FOUND');
    }
  }

  if (parts[0] !== 'payments' || !parts[1]) return fail(404, 'NOT_FOUND');
  const paymentId = parts[1];

  // 결제 조회: GET /payments/{paymentId}?storeId=
  if (method === 'GET' && parts.length === 2) {
    if (!authorized(headers, searchParams.get('storeId'))) return fail(401, 'UNAUTHORIZED');
    const payment = state.payments.get(paymentId);
    return payment ? { status: 200, body: payment } : fail(404, 'PAYMENT_NOT_FOUND');
  }

  // 결제 취소: POST /payments/{paymentId}/cancel { storeId, reason, amount?, currentCancellableAmount? }
  if (method === 'POST' && parts.length === 3 && parts[2] === 'cancel') {
    const input =
      /** @type {{ storeId?: string, reason?: string, amount?: number, currentCancellableAmount?: number }} */ (
        body ?? {}
      );
    if (!authorized(headers, input.storeId)) return fail(401, 'UNAUTHORIZED');
    const payment = state.payments.get(paymentId);
    if (!payment) return fail(404, 'PAYMENT_NOT_FOUND');
    if (payment.status === 'CANCELLED') return fail(409, 'PAYMENT_ALREADY_CANCELLED');
    if (payment.status === 'FAILED') return fail(409, 'PAYMENT_NOT_PAID');
    const left = cancellableAmount(payment);
    // 부분 취소: 앱이 아는 잔액이 지금 잔액과 다르면 거절한다(앞선 요청이 이미 돌려줬으면 두 번 환불되지 않는다)
    if (input.amount !== undefined && input.currentCancellableAmount !== left) {
      return fail(409, 'CANCELLABLE_AMOUNT_CONSISTENCY_BROKEN');
    }
    const amount = input.amount ?? left;
    if (!Number.isInteger(amount) || amount <= 0 || amount > left) {
      return fail(400, 'CANCEL_AMOUNT_EXCEEDS_CANCELLABLE_AMOUNT');
    }
    state.cancelCount += 1;
    /** @type {FakeCancellation} */
    const cancellation = {
      status: 'SUCCEEDED',
      id: `e2e-cancel-${state.cancelCount}`,
      totalAmount: amount,
      reason: input.reason ?? '',
      cancelledAt: new Date().toISOString(),
    };
    payment.cancellations.push(cancellation);
    payment.status = amount === left ? 'CANCELLED' : 'PARTIAL_CANCELLED';
    return { status: 200, body: { cancellation } };
  }

  return fail(404, 'NOT_FOUND');
}
