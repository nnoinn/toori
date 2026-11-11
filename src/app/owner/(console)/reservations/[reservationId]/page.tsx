import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { isUuid } from '@/lib/uuid';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ReservationCode } from '@/components/ui/reservation-code';
import { EmptyState, LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { formatKst, formatKstTime } from '@/lib/time';
import { ensureOwnerPage } from '@/server/auth';
import { getAgreedCancelStatus } from '@/server/refunds/agreed-cancel';
import { canRecordVisit } from '@/server/visits/rules';

import { OwnerPage } from '../../owner-page';
import { RESERVATION_VIEW_STYLE } from '../../status-style';
import { RESERVATION_VIEW_LABELS, reservationView, visitSummary } from '../reservation-detail';
import { selectOwnerReservation } from '../reservation-detail-store';
import { ReservationCancelCard } from './cancel-card';
import { BookerCard, HistoryCard, ServiceCard, ViewNotice } from './reservation-cards';
import { VisitActions } from './visit-actions';

export const metadata: Metadata = { title: '예약 상세' };

type Params = Promise<{ reservationId: string }>;

// 원장님 예약 상세 (O11, S-403). 주소: /owner/reservations/[reservationId]
// 예약번호·예약자(닉네임·휴대폰)·서비스·시간·결제 금액(판매가). 그 샵 원장님만 본다. PC 기준
// 시작이 지났고 처리하지 않은 예약은 [방문 완료]·[노쇼](O14, S-405).
// 예정 예약(시작 뒤 포함, 방문·노쇼 처리 전)은 [예약 취소] 카드(S-410 손님과 합의 후 취소, cancel-card.tsx).
// 원장님 사정으로 취소(S-409)는 처리 함수(X-207)가 생기면 그 창에서 연다.
// 이 파일은 예약을 읽고 배치하고, 카드와 안내 상자는 reservation-cards.tsx가 그린다.
export default function OwnerReservationPage({ params }: { params: Params }) {
  return (
    <OwnerPage title="예약 상세" width="wide" backHref="/owner">
      <Suspense fallback={<LoadingCards count={2} />}>
        <ReservationContent params={params} />
      </Suspense>
    </OwnerPage>
  );
}

/** 그 샵 예약을 읽어 상태(예정·방문 처리 필요·방문 완료·노쇼·취소)를 서버 시각으로 정하고 카드를 놓는다 */
async function ReservationContent({ params }: { params: Params }) {
  const { reservationId } = await params;
  const validId = isUuid(reservationId);
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(validId ? `/owner/reservations/${reservationId}` : '/owner');
  const reservation = await selectOwnerReservation(getDb(), auth.shopId, reservationId);
  if (!reservation) return <NotFound />;

  const now = await getRequestNow();
  const view = reservationView(reservation, now);
  // 합의 후 취소 요청 상태(가장 최근 요청)와 요청할 수 있는지. 읽지 못하면 카드에 안내를 보여준다
  const agreedCancel = await getAgreedCancelStatus(reservation.id);
  const summary = visitSummary(reservation);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">예약번호</p>
            {/* 끝 4자리를 굵게: 손님이 보여 주는 번호를 끝 4자리로 맞춰 본다(#262). 예전 8자리 번호는 그대로 */}
            <ReservationCode
              code={reservation.code}
              emphasizeTail
              className="text-2xl font-bold tracking-wider"
            />
            <p className="text-sm">
              {formatKst(reservation.startAt)} ~ {formatKstTime(reservation.endAt)}
            </p>
          </div>
          <Badge className={RESERVATION_VIEW_STYLE[view]}>{RESERVATION_VIEW_LABELS[view]}</Badge>
        </CardHeader>
        {view === 'cancelled' ? null : (
          <CardContent>
            <ViewNotice view={view} />
          </CardContent>
        )}
        <VisitActions
          reservationId={reservation.id}
          canRecord={canRecordVisit(reservation, now)}
          summary={summary}
        />
      </Card>

      <ReservationCancelCard
        reservationId={reservation.id}
        summary={summary}
        canCancel={view === 'upcoming' || view === 'needsVisit'}
        agreedCancel={agreedCancel.ok ? agreedCancel.data : null}
      />

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

/** 없는 예약, 다른 샵 예약, 모양이 틀린 주소는 모두 이 안내다. 그래서 다른 샵에 그 예약이 있는지 드러나지 않는다 */
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
