import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import { customers } from '@/db/schema';
import { selectSlotDetail } from '@/app/(customer)/(tabs)/slots/[slotId]/queries';
import { getRequestNow } from '@/lib/request-time';
import { ensureCustomerPage } from '@/server/auth';
import { getMyHold } from '@/server/payments/checkout';

import { CheckoutView, HoldEnded } from './checkout-view';

export const metadata: Metadata = { title: '예약 확인' };

type Params = Promise<{ slotId: string }>;

// 예약 확인 (J10, C-401·C-402·C-404). 주소: /checkout/[slotId] (#121, 10/28 nnoinn 확인)
// 상세에서 '예약하기'로 10분 홀딩을 건 고객만 결제까지 간다. 내 홀딩이 아니거나 끝났으면 안내하고 상세로 보낸다.
// 금액·홀딩 만료 시각은 강규민 getMyHold(서버 계산)를 그대로 쓴다.
export default function CheckoutPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CheckoutContent params={params} />
    </Suspense>
  );
}

async function CheckoutContent({ params }: { params: Params }) {
  const { slotId } = await params;
  if (!z.uuid().safeParse(slotId).success) notFound();
  const { customerId } = await ensureCustomerPage(`/checkout/${slotId}`);

  const now = await getRequestNow();
  const [hold, slot, [customer]] = await Promise.all([
    getMyHold(slotId),
    selectSlotDetail(getDb(), { slotId, customerId, now }),
    getDb()
      .select({ phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1),
  ]);
  if (!hold.ok || !hold.data || !slot) return <HoldEnded slotId={slotId} />;

  return <CheckoutView slot={slot} hold={hold.data} phone={customer?.phone ?? null} />;
}

function CheckoutSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
