import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatWon } from '@/lib/format';
import { formatKstDateTime } from '@/lib/time';

import {
  COUPON_STATE_LABELS,
  type CouponState,
  type CustomerCouponView,
  usableCouponSummary,
} from '../../coupon-format';
import { accountHistoryHref } from '@/components/ui/account-history-query';

const STATE_BADGE: Record<CouponState, 'default' | 'secondary' | 'outline'> = {
  usable: 'default',
  used: 'secondary',
  expired: 'outline',
};

/** 예약번호. 누르면 운영자 예약 상세 */
function ReservationLink({ reservationId, code }: { reservationId: string; code: string }) {
  return (
    <Link href={`/admin/reservations/${reservationId}`} className="hover:underline">
      {code}
    </Link>
  );
}

/**
 * 고객 상세의 '쿠폰' 칸(A-102, C-407). 받은 쿠폰 전부를 최근에 받은 것부터 보여 준다.
 * 손님이 "쿠폰이 어디 갔어요?"라고 물으면 받은 이유·기한·쓴 예약·돌려받은 기록을 한 곳에서 보고 답한다. 보기만 한다
 */
export function CouponCard({
  customerId,
  coupons,
}: {
  customerId: string;
  coupons: CustomerCouponView[];
}) {
  const summary = usableCouponSummary(coupons);
  return (
    <Card>
      <CardHeader>
        <CardTitle>쿠폰</CardTitle>
        <CardAction>
          <Link
            href={accountHistoryHref(`/admin/users/customers/${customerId}/history`, {
              category: 'coupon',
            })}
            className="text-sm text-muted-foreground hover:underline"
          >
            쿠폰 이력
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {coupons.length === 0 ? (
          <p className="text-muted-foreground">받은 쿠폰이 없어요</p>
        ) : (
          <>
            <p>
              쓸 수 있는 쿠폰 <b>{summary.count}장</b> · 모두 {formatWon(summary.total)}
            </p>
            <ul className="flex flex-col divide-y">
              {coupons.map((coupon) => (
                <CouponItem key={coupon.couponId} coupon={coupon} />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CouponItem({ coupon }: { coupon: CustomerCouponView }) {
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{formatWon(coupon.amount)}</span>
        <Badge variant={STATE_BADGE[coupon.state]}>{COUPON_STATE_LABELS[coupon.state]}</Badge>
        <span>
          {coupon.reasonLabel}
          {coupon.source ? (
            <>
              {' · 예약 '}
              <ReservationLink {...coupon.source} />
            </>
          ) : null}
        </span>
      </p>
      <p className="text-muted-foreground">
        {formatKstDateTime(coupon.issuedAt)} 받음 · {formatKstDateTime(coupon.expiresAt)}까지
      </p>
      {coupon.usedOn ? (
        <p>
          {coupon.usedAt ? `${formatKstDateTime(coupon.usedAt)} ` : null}예약{' '}
          <ReservationLink {...coupon.usedOn} />에 사용
        </p>
      ) : null}
      {coupon.returns.map((use) => (
        <p key={use.reservationId} className="text-muted-foreground">
          예약 <ReservationLink reservationId={use.reservationId} code={use.code} />에 썼다가{' '}
          {use.label}
        </p>
      ))}
    </li>
  );
}
