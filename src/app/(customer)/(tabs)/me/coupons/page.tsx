import { Suspense } from 'react';
import type { Metadata } from 'next';
import { cn } from 'cn';

import { BackButton } from '@/components/ui/back-button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/state';
import { formatWon } from '@/lib/format';
import { SITE_NAME } from '@/lib/site';
import { getRequestNow } from '@/lib/request-time';
import { formatKst } from '@/lib/time';
import { ensureCustomerPage } from '@/server/auth';
import type { MyCoupon } from '@/server/coupons';
import { getMyCoupons } from '@/server/coupons/coupons';

import {
  COUPON_SELECT_NOTES,
  MY_COUPON_NOTE,
} from '@/app/(customer)/(focus)/checkout/[slotId]/coupon-texts';

import {
  COUPON_BOX_EMPTY_HELP,
  COUPON_BOX_PATH,
  couponDaysLeft,
  couponLeftText,
} from './coupon-box-rules';

export const metadata: Metadata = { title: '쿠폰함' };

// 쿠폰함 (#480, C-407, 11/20 정찬형 1안). 주소: /me/coupons. 내 정보의 쿠폰 줄을 누르면 열린다.
// 지금 쓸 수 있는 쿠폰만 기한 빠른 순으로(getMyCoupons, 매물 없이). 돌려받은 쿠폰도 다시 쓸 수 있는 쿠폰이라 여기에 보인다.
// 사용한 쿠폰·기한이 지난 쿠폰과 받은 이유는 서버 함수가 생기면 더한다(2안). 폰은 왼쪽 위에 뒤로 가기, PC는 내 정보와 같은 가운데 폭
export default function CouponBoxPage() {
  return (
    <section className="flex flex-1 flex-col gap-4 px-4 py-3 md:mx-auto md:w-full md:max-w-xl md:py-10">
      <div className="flex items-center gap-1 max-md:-ml-2">
        <BackButton fallbackHref="/me" className="md:hidden" />
        <h1 className="text-2xl font-bold max-md:text-xl">쿠폰함</h1>
      </div>
      <Suspense fallback={<CouponBoxSkeleton />}>
        <CouponBoxContent />
      </Suspense>
    </section>
  );
}

async function CouponBoxContent() {
  // 로그인하지 않았으면 로그인 화면, 고객 계정이 없으면 약관 동의(/join)로 보낸다
  await ensureCustomerPage(COUPON_BOX_PATH);
  const [result, now] = await Promise.all([getMyCoupons(), getRequestNow()]);
  if (!result.ok) return <ErrorState description={result.error.message} />;
  const { coupons } = result.data;

  return (
    <>
      {coupons.length === 0 ? (
        <div className="rounded-2xl border bg-card">
          <EmptyState title="쓸 수 있는 쿠폰이 없어요" description={COUPON_BOX_EMPTY_HELP} />
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            쓸 수 있는 쿠폰 <b className="text-foreground">{coupons.length}장</b> · 기한이 빠른 순
          </p>
          <ul className="flex flex-col gap-2.5">
            {coupons.map((coupon) => (
              <li key={coupon.couponId}>
                <CouponCard coupon={coupon} now={now} />
              </li>
            ))}
          </ul>
        </>
      )}
      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        {[MY_COUPON_NOTE, ...COUPON_SELECT_NOTES].map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </>
  );
}

/** 쿠폰 한 장: 왼쪽 금액, 점선, 오른쪽 기한과 남은 날(가까우면 빨간 글씨) */
function CouponCard({ coupon, now }: { coupon: MyCoupon; now: Date }) {
  const left = couponLeftText(couponDaysLeft(coupon.expiresAt, now));
  return (
    <div className="flex overflow-hidden rounded-2xl border bg-card">
      <div className="flex w-28 shrink-0 flex-col items-center justify-center border-r-2 border-dashed px-2 py-4 max-md:w-24">
        <span className="text-xl font-bold max-md:text-lg">{formatWon(coupon.amount)}</span>
        <span className="text-xs text-muted-foreground">할인</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-4">
        <span className="font-semibold">{SITE_NAME} 쿠폰</span>
        <span className="text-sm">
          {formatKst(new Date(coupon.expiresAt))}까지 ·{' '}
          <span
            className={cn(left.soon ? 'font-semibold text-destructive' : 'text-muted-foreground')}
          >
            {left.text}
          </span>
        </span>
      </div>
    </div>
  );
}

function CouponBoxSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-2xl" />
    </div>
  );
}
