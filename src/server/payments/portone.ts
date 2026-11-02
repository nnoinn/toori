// 포트원 V2 결제 조회·취소 (X-201, C-406, W11 ②·W12). 서버에서만 부른다. API 시크릿(PORTONE_API_SECRET)은 서버 환경변수에만 있고 로그에 남기지 않는다.
// 브라우저가 보낸 결과(복귀 주소의 code 등)는 믿지 않고, 결제 확인(confirmPayment)과 웹훅(W13)이 늘 이 조회로 상태와 금액을 본다.
// 문서: https://developers.portone.io (GET /payments/{paymentId}, POST /payments/{paymentId}/cancel, Authorization: PortOne {API 시크릿})

import 'server-only';

import { z } from 'zod';

const PORTONE_API = 'https://api.portone.io';
const TIMEOUT_MS = 10_000;

const cancellationSchema = z.object({
  status: z.string(),
  id: z.string().optional(),
  totalAmount: z.number().optional(),
});

/** 응답 중 결제 확인에 필요한 칸만 읽는다(나머지는 무시). 결제 상태별로 있는 칸이 달라서 대부분 비어 있을 수 있다 */
const paymentSchema = z.object({
  status: z.string(),
  amount: z.object({ total: z.number() }).partial().optional(),
  currency: z.string().optional(),
  paidAt: z.string().optional(),
  method: z.object({ type: z.string() }).partial().optional(),
  failure: z
    .object({ reason: z.string(), pgCode: z.string(), pgMessage: z.string() })
    .partial()
    .optional(),
  cancellations: z.array(cancellationSchema).optional(),
});

export type PortOnePayment = {
  /** READY, PENDING, VIRTUAL_ACCOUNT_ISSUED, PAID, FAILED, PARTIAL_CANCELLED, CANCELLED 등 */
  status: string;
  amountTotal: number | null;
  currency: string | null;
  paidAt: Date | null;
  /** 결제 수단 종류(예: PaymentMethodCard). orders.pay_method에 남긴다 */
  method: string | null;
  /** 실패했을 때 결제사가 알려준 이유(로그·주문 기록용, 화면에 그대로 보여주지 않는다) */
  failureReason: string | null;
  /** 실패했을 때 결제사 코드(failure.pgCode). 예: 고객이 결제창을 닫으면 PAY_PROCESS_CANCELED(토스페이먼츠) */
  failureCode: string | null;
  /** 끝난 취소 내역(status SUCCEEDED만). 취소된 결제에만 있다 */
  cancellations: { id: string | null; amount: number | null }[];
};

export type PortOneLookup =
  | { ok: true; payment: PortOnePayment }
  /** not_found: 포트원에 그 결제가 없다(결제창까지 가지 않았다). unavailable: 키가 없거나 포트원에 묻지 못했다 */
  | { ok: false; reason: 'not_found' | 'unavailable' };

function portOneKeys(): { secret: string; storeId: string } | null {
  const secret = process.env.PORTONE_API_SECRET;
  const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID;
  if (!secret || !storeId) {
    console.error('[portone] PORTONE_API_SECRET·NEXT_PUBLIC_PORTONE_STORE_ID가 없어요(.env.local)');
    return null;
  }
  return { secret, storeId };
}

export async function getPortOnePayment(paymentId: string): Promise<PortOneLookup> {
  const keys = portOneKeys();
  if (!keys) return { ok: false, reason: 'unavailable' };
  const { secret, storeId } = keys;

  const url = `${PORTONE_API}/payments/${encodeURIComponent(paymentId)}?storeId=${encodeURIComponent(storeId)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `PortOne ${secret}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[portone] 결제 조회 요청 실패:', error instanceof Error ? error.name : error);
    return { ok: false, reason: 'unavailable' };
  }

  const body: unknown = await response.json().catch(() => null);
  if (response.status === 404) return { ok: false, reason: 'not_found' };
  const parsed = paymentSchema.safeParse(body);
  if (!response.ok || !parsed.success) {
    const type = (body as { type?: unknown } | null)?.type;
    console.error(
      '[portone] 결제 조회 실패:',
      response.status,
      typeof type === 'string' ? type : '',
    );
    return { ok: false, reason: 'unavailable' };
  }

  const payment = parsed.data;
  const paidAt = payment.paidAt ? new Date(payment.paidAt) : null;
  return {
    ok: true,
    payment: {
      status: payment.status,
      amountTotal: payment.amount?.total ?? null,
      currency: payment.currency ?? null,
      paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
      method: payment.method?.type ?? null,
      failureReason: payment.failure?.reason ?? payment.failure?.pgMessage ?? null,
      failureCode: payment.failure?.pgCode ?? null,
      cancellations: (payment.cancellations ?? [])
        .filter((cancellation) => cancellation.status === 'SUCCEEDED')
        .map((cancellation) => ({
          id: cancellation.id ?? null,
          amount: cancellation.totalAmount ?? null,
        })),
    },
  };
}

export type PortOneCancel =
  /** 취소가 끝났다. amount는 실제로 돌려준 금액(모르면 null) */
  | { ok: true; cancellationId: string | null; amount: number | null }
  /** pending: 결제사가 취소를 처리 중. unavailable: 키가 없거나, 포트원에 묻지 못했거나, 취소를 거절했다. 둘 다 나중에 다시 부른다 */
  | { ok: false; reason: 'pending' | 'unavailable' };

/**
 * 결제 전액을 취소한다. 이미 취소된 결제면 포트원의 취소 내역을 읽어 끝난 것으로 돌려줘서, 같은 결제로 여러 번 불러도 된다
 */
export async function cancelPortOnePayment(
  paymentId: string,
  reason: string,
): Promise<PortOneCancel> {
  const keys = portOneKeys();
  if (!keys) return { ok: false, reason: 'unavailable' };
  const { secret, storeId } = keys;

  let response: Response;
  try {
    response = await fetch(`${PORTONE_API}/payments/${encodeURIComponent(paymentId)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `PortOne ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, reason }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[portone] 결제 취소 요청 실패:', error instanceof Error ? error.name : error);
    return { ok: false, reason: 'unavailable' };
  }

  const body: unknown = await response.json().catch(() => null);
  const type = (body as { type?: unknown } | null)?.type;
  if (type === 'PAYMENT_ALREADY_CANCELLED') return readFinishedCancel(paymentId);

  const parsed = z.object({ cancellation: cancellationSchema }).safeParse(body);
  if (!response.ok || !parsed.success) {
    console.error(
      '[portone] 결제 취소 실패:',
      response.status,
      typeof type === 'string' ? type : '',
    );
    return { ok: false, reason: 'unavailable' };
  }

  const { cancellation } = parsed.data;
  if (cancellation.status === 'SUCCEEDED') {
    return {
      ok: true,
      cancellationId: cancellation.id ?? null,
      amount: cancellation.totalAmount ?? null,
    };
  }
  if (cancellation.status === 'REQUESTED') return { ok: false, reason: 'pending' };
  console.error('[portone] 결제사가 취소를 거절했어요:', cancellation.status);
  return { ok: false, reason: 'unavailable' };
}

/** 이미 취소된 결제의 취소 내역을 읽는다(앞선 요청이 취소한 뒤 기록하지 못했을 때) */
async function readFinishedCancel(paymentId: string): Promise<PortOneCancel> {
  const lookup = await getPortOnePayment(paymentId);
  if (!lookup.ok) return { ok: false, reason: 'unavailable' };
  // 전액 취소라 끝난 취소는 한 건이다
  const finished = lookup.payment.cancellations.at(-1);
  return { ok: true, cancellationId: finished?.id ?? null, amount: finished?.amount ?? null };
}
