import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Clock, Info, MapPin, Navigation, Phone } from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { formatReservationCode } from '@/components/ui/reservation-code';
import { ErrorState, LoadingCards } from '@/components/ui/state';
import { formatWon } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { formatKst } from '@/lib/time';
import { ensureCustomerPage } from '@/server/auth';
import { getDisputeStatus } from '@/server/disputes/dispute';
import { getAgreedCancelRequest } from '@/server/refunds/agreed-cancel';
import { previewRefund } from '@/server/refunds/cancel';
import { REFUND_ERRORS } from '@/server/refunds/errors';

import { formatDuration, kakaoDirectionsLink } from '../../slots/[slotId]/detail-format';
import { NO_SHOW_DISPUTE_NOTE, noShowRefundNote } from '../no-show-texts';
import { getMyReservationDetail } from '../queries';
import { isVisitPending, showsCancelSection, showsCheckInCard } from '../reservation-tabs';
import { AgreedCancelCard } from './agreed-cancel-card';
import { CancelReservation } from './cancel-reservation';
import { CheckInCard } from './check-in-card';
import { DetailCard } from './detail-card';
import { DisputeSection } from './dispute-section';
import { NO_SHOW_DISPUTE_BELOW } from './dispute-texts';

export const metadata: Metadata = { title: '예약 상세' };

type Params = Promise<{ reservationId: string }>;

const STATUS_LABEL = { confirmed: '예정', completed: '이용 완료', cancelled: '취소' } as const;

// 예약 상세 (J12, C-502). 본인 예약만 열린다. 예정 예약은 위쪽에 예약번호를 크게 보여 주는 '방문 확인' 칸이 있고(C-504),
// 시작 전이면 맨 아래에서 취소할 수 있다(J13, C-503). 시작 뒤(취소된 예약은 취소된 뒤)에는 이의제기 칸이 있다(C-507).
// 원장님이 합의 후 취소를 요청하고 답을 기다리는 동안에는 맨 위에 요청 카드가 있다(C-506)
export default function ReservationDetailPage({ params }: { params: Params }) {
  return (
    <main className="flex flex-1 flex-col md:mx-auto md:w-full md:max-w-3xl md:px-6 md:py-6">
      <Suspense fallback={<LoadingCards count={2} />}>
        <DetailContent params={params} />
      </Suspense>
    </main>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

async function DetailContent({ params }: { params: Params }) {
  const { reservationId } = await params;
  await ensureCustomerPage(`/reservations/${reservationId}`);
  const [result, now] = await Promise.all([getMyReservationDetail(reservationId), getRequestNow()]);
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') notFound();
    return <ErrorState description={result.error.message} />;
  }
  const r = result.data;
  const visitPending = isVisitPending(r.status, r.startAt, now);
  const checkIn = showsCheckInCard(r.status);
  const tel = r.shop.phone.replace(/[^\d+]/g, '');
  const [refundPreview, dispute, agreedCancel] = await Promise.all([
    showsCancelSection(r.status, r.startAt, now) ? previewRefund(r.reservationId) : null,
    getDisputeStatus(r.reservationId),
    // 답을 기다리는 합의 후 취소 요청(예정 예약만). 없거나 못 읽으면 카드를 그리지 않는다
    r.status === 'confirmed' ? getAgreedCancelRequest(r.reservationId) : null,
  ]);
  const disputeShown = dispute.ok && dispute.data.state !== 'not_open';
  const pendingAgreedCancel = agreedCancel?.ok ? agreedCancel.data : null;

  return (
    <article className="flex flex-col gap-3 pb-6">
      <header className="flex items-center gap-1 px-2 pt-2">
        <BackButton fallbackHref="/reservations" className="max-md:size-10" />
        <h1 className="text-lg font-bold">예약 상세</h1>
      </header>

      {/* 다시 읽을 때마다(서버 시각이 바뀌면) 새로 시작한다 */}
      {pendingAgreedCancel ? (
        <AgreedCancelCard key={pendingAgreedCancel.serverNow} request={pendingAgreedCancel} />
      ) : null}

      <DetailCard>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Badge variant={r.status === 'cancelled' ? 'outline' : 'secondary'}>
            {STATUS_LABEL[r.status]}
          </Badge>
          {r.noShow ? <Badge variant="destructive">노쇼</Badge> : null}
          {visitPending ? <Badge variant="secondary">방문 확인 중</Badge> : null}
          {/* 예정 예약은 아래 '방문 확인' 칸에 크게 나와서 여기서는 뺀다 */}
          {checkIn ? null : <span>예약번호 {formatReservationCode(r.code)}</span>}
        </p>
        <h2 className="text-xl font-bold">{r.menuName}</h2>
        <p className="flex items-center gap-2 text-sm">
          <Clock className="size-4 text-muted-foreground" aria-hidden />
          {formatKst(new Date(r.startAt))} · {formatDuration(r.durationMinutes)}
        </p>
        {/* 노쇼로 처리된 예약: 환불 안내와 잘못 처리됐을 때 알리는 곳(C-105) */}
        {r.noShow ? (
          <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="flex flex-col gap-1">
              <p>원장님이 노쇼로 처리한 예약이에요. {noShowRefundNote()}.</p>
              <p className="text-muted-foreground">
                {disputeShown ? NO_SHOW_DISPUTE_BELOW : NO_SHOW_DISPUTE_NOTE}.
              </p>
            </div>
          </div>
        ) : null}
        {/* 시작이 지났는데 원장님이 방문·노쇼 처리 전인 예약. 무슨 상태인지 한 줄로 알려 준다 */}
        {visitPending ? (
          <p className="text-sm text-muted-foreground">
            원장님이 방문을 확인하면 &lsquo;{STATUS_LABEL.completed}&rsquo;로 바뀌어요.
          </p>
        ) : null}
      </DetailCard>

      {checkIn ? <CheckInCard code={r.code} /> : null}

      <DetailCard aria-label="샵 정보">
        <h3 className="font-semibold">{r.shop.name}</h3>
        <p className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {r.shop.roadAddress}
          {r.shop.addressDetail ? ` ${r.shop.addressDetail}` : ''}
        </p>
        {/* 샵까지 길찾기(C-307). 카카오맵이 새 창으로 열린다 */}
        <a
          href={kakaoDirectionsLink(r.shop.name, r.shop.lat, r.shop.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm max-md:min-h-10"
        >
          <Navigation className="size-4 text-muted-foreground" aria-hidden />
          카카오맵으로 길찾기
        </a>
        {tel.length >= 8 ? (
          <a href={`tel:${tel}`} className="flex items-center gap-2 text-sm max-md:min-h-10">
            <Phone className="size-4 text-muted-foreground" aria-hidden />
            {r.shop.phone}
          </a>
        ) : null}
      </DetailCard>

      <DetailCard aria-label="결제 내역">
        <h3 className="font-semibold">결제 내역</h3>
        <dl className="flex flex-col gap-1">
          <Row label="할인가" value={formatWon(r.payment.salePrice)} />
          {r.payment.couponAmount > 0 ? (
            <Row label="쿠폰" value={`−${formatWon(r.payment.couponAmount)}`} />
          ) : null}
          <Row label="결제 금액" value={<strong>{formatWon(r.payment.amount)}</strong>} />
          {r.payment.paidAt ? (
            <Row label="결제 시각" value={formatKst(new Date(r.payment.paidAt))} />
          ) : null}
        </dl>
      </DetailCard>

      {r.refund ? (
        <DetailCard aria-label="환불 내역">
          <h3 className="font-semibold">환불 내역</h3>
          <dl className="flex flex-col gap-1">
            <Row label="환불 금액" value={<strong>{formatWon(r.refund.refundAmount)}</strong>} />
            <Row
              label="위약금"
              value={`${formatWon(r.refund.penaltyAmount)} (${r.refund.penaltyRate}%)`}
            />
            <Row label="환불 처리" value={formatKst(new Date(r.refund.processedAt))} />
          </dl>
        </DetailCard>
      ) : null}

      {/* 다시 읽을 때마다(서버 시각이 바뀌면) 새로 시작한다. 접수 뒤 새로 읽으면 접수함으로 바뀐다 */}
      {dispute.ok ? <DisputeSection key={dispute.data.serverNow} view={dispute.data} /> : null}

      {refundPreview ? (
        <DetailCard aria-label="예약 취소">
          {!refundPreview.ok ? (
            <p className="text-sm text-muted-foreground">{refundPreview.error.message}</p>
          ) : refundPreview.data.refundable ? (
            // 다시 읽을 때마다(서버 시각이 바뀌면) 새로 시작한다. 창을 닫은 뒤 새 금액·상태로 맞추려고
            <CancelReservation key={refundPreview.data.serverNow} preview={refundPreview.data} />
          ) : (
            // 시작까지 6시간 미만이면 취소 버튼 대신 안내만(10/29 결정, #128)
            <p className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm">
              <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {REFUND_ERRORS.NOT_REFUNDABLE}
            </p>
          )}
        </DetailCard>
      ) : null}
    </article>
  );
}
