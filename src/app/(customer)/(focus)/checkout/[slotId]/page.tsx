import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { isUuid } from '@/lib/uuid';

import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import { customers } from '@/db/schema';
import { selectSlotDetail } from '@/app/(customer)/(tabs)/slots/[slotId]/queries';
import { getRequestNow } from '@/lib/request-time';
import { ensureCustomerPage } from '@/server/auth';
import { getMyCoupons } from '@/server/coupons/coupons';
import { getMyHold, previewCheckoutAmount } from '@/server/payments/checkout';

import { CheckoutView, HoldEnded } from './checkout-view';

export const metadata: Metadata = { title: '예약 확인' };

type Params = Promise<{ slotId: string }>;

// 예약 확인 (J10, C-401·C-402·C-404). 주소: /checkout/[slotId] (#121, 10/28 nnoinn 확인)
// 상세에서 '예약하기'로 10분 홀딩을 건 고객만 결제까지 간다. 내 홀딩이 아니거나 끝났으면 안내하고 상세로 보낸다.
// 금액·홀딩 만료 시각은 강규민 getMyHold(서버 계산)를 그대로 쓴다.
// 쿠폰이 있으면 서버가 정한 기본 쿠폰(할인이 가장 큰 쿠폰)을 골라 둔 금액으로 연다(C-407, 11/10 #300).
export default function CheckoutPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <CheckoutContent params={params} />
    </Suspense>
  );
}

async function CheckoutContent({ params }: { params: Params }) {
  const { slotId } = await params;
  if (!isUuid(slotId)) notFound();
  const { customerId } = await ensureCustomerPage(`/checkout/${slotId}`);

  const now = await getRequestNow();
  const [hold, slot, [customer], coupons] = await Promise.all([
    getMyHold(slotId),
    selectSlotDetail(getDb(), { slotId, customerId, now }),
    getDb()
      .select({ phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1),
    getMyCoupons({ slotId }),
  ]);
  if (!hold.ok || !hold.data || !slot) return <HoldEnded slotId={slotId} />;
  const myHold = hold.data;
  // 쿠폰을 읽지 못했거나 기본 쿠폰 금액을 받지 못하면 쿠폰 없이 연다(쿠폰 칸에서 다시 고를 수 있다)
  const couponList = coupons.ok ? coupons.data.coupons : [];
  const defaultCouponId = coupons.ok ? coupons.data.defaultCouponId : null;
  const preview = defaultCouponId
    ? await previewCheckoutAmount({ slotId, couponId: defaultCouponId })
    : null;
  const initialCoupon =
    preview?.ok && defaultCouponId
      ? { couponId: defaultCouponId, amount: preview.data }
      : {
          couponId: null,
          amount: { salePrice: myHold.salePrice, couponAmount: 0, amount: myHold.amount },
        };

  // Next.js는 떠난 화면을 체크·입력 상태 그대로 남겨 둔다(Activity). 새 홀딩이면 새 화면으로 시작한다.
  // 같은 홀딩으로 돌아오면('결제 이어서 하기') 체크한 동의는 그대로 둔다
  return (
    <CheckoutView
      key={hold.data.holdExpiresAt}
      slot={slot}
      hold={myHold}
      phone={customer?.phone ?? null}
      coupons={couponList}
      initialCoupon={initialCoupon}
    />
  );
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
