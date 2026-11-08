// 원장님 예약 상세의 카드들 (O11, S-403). 서버에서 그리는 부품이라 상태가 없다.
// 안내 상자(ViewNotice), 예약자(BookerCard), 서비스(ServiceCard), 기록(HistoryCard).
// 예약을 읽고 배치하는 것은 page.tsx가 맡는다.

import { CalendarX2, ClipboardCheck, Lock } from 'lucide-react';
import { cn } from 'cn';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { SlotBadges } from '@/components/ui/slot-badge';
import { formatDuration, formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';

import { maskPhone } from '@/lib/phone';
import { serviceTypeLabel } from '@/server/policy';

import { CANCEL_ACTOR_LABELS, type ReservationView, showsFullPhone } from '../reservation-detail';
import type { OwnerReservation } from '../reservation-detail-store';

/** 시작 전에는 다른 채널에서 시간 막기(D16), 시작이 지났으면 방문·노쇼 처리 안내, 처리한 뒤에는 바꿀 수 없다는 안내 */
export function ViewNotice({ view }: { view: Exclude<ReservationView, 'cancelled'> }) {
  if (view === 'visited' || view === 'noShow') {
    // 처리한 뒤 원장님은 바꿀 수 없고 운영자가 고친다(A-104, #130)
    return (
      <NoticeBox icon={Lock} title="처리한 예약은 바꿀 수 없어요">
        잘못 처리했으면 운영자에게 문의해 주세요.
      </NoticeBox>
    );
  }
  if (view === 'upcoming') {
    return (
      <NoticeBox icon={CalendarX2} title="다른 예약 채널에서도 이 시간을 막아 두세요">
        전화나 다른 예약 앱으로 같은 시간에 예약을 받으면 겹칠 수 있어요.
      </NoticeBox>
    );
  }
  return (
    <NoticeBox icon={ClipboardCheck} title="서비스 시작이 지났어요" warning>
      고객이 왔으면 방문 완료, 오지 않았으면 노쇼로 처리해 주세요. 처리해야 정산이 진행돼요.
    </NoticeBox>
  );
}

/** 아이콘 + 굵은 제목 + 흐린 설명 상자. warning이면 처리할 일이 있다는 뜻으로 노란 바탕 */
function NoticeBox({
  icon: Icon,
  title,
  warning = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  warning?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn('flex gap-2 rounded-lg p-3 text-sm', warning ? 'bg-warning/15' : 'bg-muted')}
    >
      <Icon
        className={cn('mt-0.5 size-4 shrink-0', warning && 'text-warning-foreground')}
        aria-hidden
      />
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

/**
 * 예약자 닉네임·휴대폰. 휴대폰은 이용이 끝날 때까지만 다 보여주고(동의 문구 3-1),
 * 방문·노쇼를 처리했거나 취소된 예약은 가운데를 가린다(#21 Q11). 번호를 받기 전에 만든 시드 예약처럼 번호가 없으면 "없음"
 */
export function BookerCard({ reservation }: { reservation: OwnerReservation }) {
  const full = showsFullPhone(reservation);
  const phone = reservation.customerPhone;
  return (
    <Card>
      <CardHeader>
        <CardTitle>예약자</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">닉네임</dt>
          <dd className="font-medium">{reservation.customerNickname}</dd>
          <dt className="text-muted-foreground">휴대폰</dt>
          <dd className="font-medium tabular-nums">
            {phone === null ? (
              <span className="text-muted-foreground">없음</span>
            ) : full ? (
              <a href={`tel:${phone}`} className="underline-offset-4 hover:underline">
                {phone}
              </a>
            ) : (
              maskPhone(phone)
            )}
          </dd>
        </dl>
        {phone !== null && !full ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {reservation.status === 'cancelled'
              ? '취소된 예약이라 연락처를 가렸어요.'
              : '방문·노쇼를 처리한 예약이라 연락처를 가렸어요.'}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** 서비스와 결제 금액. 정산은 판매가 기준이라 고객이 쿠폰을 써도 판매가를 결제 금액으로 보여준다 */
export function ServiceCard({ reservation }: { reservation: OwnerReservation }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>서비스</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">
            {serviceTypeLabel(reservation.serviceType)} ·{' '}
            {formatDuration(reservation.durationMinutes)}
          </span>
          <span className="font-medium">{reservation.menuName}</span>
          <SlotBadges kinds={reservation.newCustomerOnly ? ['newCustomerOnly'] : []} />
        </div>
        <Price
          listPrice={reservation.listPrice}
          salePrice={reservation.salePrice}
          discountRate={reservation.discountRate}
          size="sm"
        />
        <div className="flex items-baseline justify-between rounded-lg bg-muted p-3">
          <span>결제 금액</span>
          <span className="text-base font-bold tabular-nums">
            {formatWon(reservation.salePrice)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          판매가 기준이에요. 고객이 쿠폰을 써도 정산은 이 금액을 기준으로 계산해요.
        </p>
      </CardContent>
    </Card>
  );
}

/** 예약 확정·방문 처리·취소 시각. 있는 기록만 보여준다 */
export function HistoryCard({ reservation }: { reservation: OwnerReservation }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>기록</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">예약 확정</dt>
          <dd>{formatKst(reservation.createdAt)}</dd>
          {reservation.visitRecordedAt ? (
            <>
              <dt className="text-muted-foreground">
                {reservation.visitResult === 'no_show' ? '노쇼 처리' : '방문 완료 처리'}
              </dt>
              <dd>{formatKst(reservation.visitRecordedAt)}</dd>
            </>
          ) : null}
          {reservation.cancelledAt ? (
            <>
              <dt className="text-muted-foreground">취소</dt>
              <dd>
                {formatKst(reservation.cancelledAt)}
                {reservation.cancelActor
                  ? ` · ${CANCEL_ACTOR_LABELS[reservation.cancelActor]}`
                  : null}
              </dd>
            </>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}
