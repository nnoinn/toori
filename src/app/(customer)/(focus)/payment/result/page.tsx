import { Suspense } from 'react';
import type { Metadata } from 'next';

import { Skeleton } from '@/components/ui/skeleton';
import { ensureCustomerPage } from '@/server/auth';

import { PaymentResultView } from './payment-result-view';

export const metadata: Metadata = { title: '결제 결과' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : null;
}

// 결제 뒤 돌아오는 화면 (J11, C-403·C-405·C-406). 주소: /payment/result?paymentId=…(&code=…&message=…) (#121)
// 포트원이 붙여 준 값을 그대로 강규민 confirmPayment에 넘겨야 예약이 확정된다. 확정은 화면이 열린 뒤
// 'use client' 컴포넌트에서 한 번 부른다(#121 강규민 안내: 서버 렌더링 중에는 부르지 않는다).
export default function PaymentResultPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ResultSkeleton />}>
      <ResultContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ResultContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const paymentId = first(params.paymentId);
  const code = first(params.code);
  const message = first(params.message);

  // 로그인이 풀렸으면 다시 로그인하고 같은 결과 화면으로 돌아온다
  const back = new URLSearchParams();
  if (paymentId) back.set('paymentId', paymentId);
  if (code) back.set('code', code);
  if (message) back.set('message', message);
  await ensureCustomerPage(`/payment/result${back.size > 0 ? `?${back}` : ''}`);

  // Next.js는 떠난 화면을 결과 그대로 남겨 둔다(Activity). 결제 번호가 다르면 새로 확인한다(두 번째 결제에 첫 결과가 보이지 않게)
  return (
    <PaymentResultView
      key={`${paymentId ?? ''}:${code ?? ''}`}
      paymentId={paymentId}
      code={code}
      message={message}
    />
  );
}

function ResultSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-16">
      <Skeleton className="size-12 rounded-full" />
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
