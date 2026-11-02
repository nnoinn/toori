import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarX2, ClipboardCheck, Lock } from 'lucide-react';
import { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { SlotBadges } from '@/components/ui/slot-badge';
import { EmptyState, LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { formatWon } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { formatKst } from '@/lib/time';
import { ensureOwnerPage } from '@/server/auth';
import { canRecordVisit } from '@/server/visits/rules';

import { formatMinutes, serviceTypeLabel } from '../../settings/menu/menu';
import { timeLabel } from '../../slots/new/slot-time';
import {
  CANCEL_ACTOR_LABELS,
  maskPhone,
  RESERVATION_VIEW_LABELS,
  type ReservationView,
  reservationView,
  showsFullPhone,
} from '../reservation-detail';
import { type OwnerReservation, selectOwnerReservation } from '../reservation-detail-store';
import { VisitActions } from './visit-actions';

export const metadata: Metadata = { title: '예약 상세' };

type Params = Promise<{ reservationId: string }>;

/** 상태 배지 색. 대시보드 매물 상태 배지와 맞춘다(예정 = 예약됨, 끝난 것은 흐리게) */
const VIEW_STYLE: Record<ReservationView, string> = {
  upcoming: 'bg-accent text-accent-foreground',
  needsVisit: 'bg-warning/25 text-warning-foreground',
  visited: 'border-border bg-background text-muted-foreground',
  noShow: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
};

// 원장님 예약 상세 (O11, S-403). 주소: /owner/reservations/[reservationId]
// 예약번호·예약자(닉네임·휴대폰)·서비스·시간·결제 금액(판매가). 그 샵 원장님만 본다. PC 기준
// 시작이 지났고 처리하지 않은 예약은 [방문 완료]·[노쇼](O14, S-405). 원장님 사정으로 취소는 O18(P1)에서 넣는다.
export default function OwnerReservationPage({ params }: { params: Params }) {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">예약 상세</h1>
      <Suspense fallback={<LoadingCards count={2} />}>
        <ReservationContent params={params} />
      </Suspense>
    </main>
  );
}

async function ReservationContent({ params }: { params: Params }) {
  const { reservationId } = await params;
  const validId = z.uuid().safeParse(reservationId).success;
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(validId ? `/owner/reservations/${reservationId}` : '/owner');
  const reservation = await selectOwnerReservation(getDb(), auth.shopId, reservationId);
  if (!reservation) return <NotFound />;

  const now = await getRequestNow();
  const view = reservationView(reservation, now);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">예약번호</p>
            <p className="text-2xl font-bold tracking-wider tabular-nums">{reservation.code}</p>
            <p className="text-sm">
              {formatKst(reservation.startAt)} ~ {timeLabel(reservation.endAt)}
            </p>
          </div>
          <Badge className={VIEW_STYLE[view]}>{RESERVATION_VIEW_LABELS[view]}</Badge>
        </CardHeader>
        {view === 'cancelled' ? null : (
          <CardContent>
            <ViewNotice view={view} />
          </CardContent>
        )}
        <VisitActions
          reservationId={reservation.id}
          canRecord={canRecordVisit(reservation, now)}
          summary={`${formatKst(reservation.startAt)} ${reservation.menuName} · 예약번호 ${reservation.code}`}
        />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <BookerCard reservation={reservation} />
        <ServiceCard reservation={reservation} />
      </div>

      <HistoryCard reservation={reservation} />

      <div>
        <Button asChild variant="outline">
          <Link href="/owner">대시보드로</Link>
        </Button>
      </div>
    </div>
  );
}

/** 시작 전에는 다른 채널에서 시간 막기(D16), 시작이 지났으면 방문·노쇼 처리 안내, 처리한 뒤에는 바꿀 수 없다는 안내 */
function ViewNotice({ view }: { view: Exclude<ReservationView, 'cancelled'> }) {
  if (view === 'visited' || view === 'noShow') {
    // 처리한 뒤 원장님은 바꿀 수 없고 운영자가 고친다(A-104, #130)
    return (
      <div className="flex gap-2 rounded-lg bg-muted p-3 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold">처리한 예약은 바꿀 수 없어요</p>
          <p className="text-muted-foreground">잘못 처리했으면 운영자에게 문의해 주세요.</p>
        </div>
      </div>
    );
  }
  if (view === 'upcoming') {
    return (
      <div className="flex gap-2 rounded-lg bg-muted p-3 text-sm">
        <CalendarX2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="flex flex-col gap-0.5">
          <p className="font-semibold">다른 예약 채널에서도 이 시간을 막아 두세요</p>
          <p className="text-muted-foreground">
            전화나 다른 예약 앱으로 같은 시간에 예약을 받으면 겹칠 수 있어요.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2 rounded-lg bg-warning/15 p-3 text-sm">
      <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden />
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold">서비스 시작이 지났어요</p>
        <p className="text-muted-foreground">
          고객이 왔으면 방문 완료, 오지 않았으면 노쇼로 처리해 주세요. 처리해야 정산이 진행돼요.
        </p>
      </div>
    </div>
  );
}

function BookerCard({ reservation }: { reservation: OwnerReservation }) {
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

function ServiceCard({ reservation }: { reservation: OwnerReservation }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>서비스</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground">
            {serviceTypeLabel(reservation.serviceType)} ·{' '}
            {formatMinutes(reservation.durationMinutes)}
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
          판매가 기준이에요. 고객이 쿠폰을 써도 정산은 이 금액으로 해요.
        </p>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ reservation }: { reservation: OwnerReservation }) {
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

function NotFound() {
  return (
    <Card>
      <EmptyState
        title="예약을 찾을 수 없어요"
        description="주소를 다시 확인하거나 대시보드에서 예약을 골라 주세요"
        action={
          <Button asChild variant="outline">
            <Link href="/owner">대시보드로</Link>
          </Button>
        }
      />
    </Card>
  );
}
