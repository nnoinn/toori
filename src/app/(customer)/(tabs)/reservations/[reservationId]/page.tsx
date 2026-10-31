import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Clock, MapPin, Phone } from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { ErrorState, LoadingCards } from '@/components/ui/state';
import { formatWon } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { formatKst } from '@/lib/time';
import { ensureCustomerPage } from '@/server/auth';
import { previewRefund } from '@/server/refunds/cancel';
import { REFUND_ERRORS } from '@/server/refunds/errors';

import { formatDuration } from '../../slots/[slotId]/detail-format';
import { getMyReservationDetail } from '../queries';
import { isVisitPending, showsCancelSection } from '../reservation-tabs';
import { CancelReservation } from './cancel-reservation';

export const metadata: Metadata = { title: '예약 상세' };

type Params = Promise<{ reservationId: string }>;

const STATUS_LABEL = { confirmed: '예정', completed: '이용 완료', cancelled: '취소' } as const;

// 예약 상세 (J12, C-502). 본인 예약만 열린다. 시작 전 예정 예약은 맨 아래에서 취소할 수 있다(J13, C-503)
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
  const tel = r.shop.phone.replace(/[^\d+]/g, '');
  const refundPreview = showsCancelSection(r.status, r.startAt, now)
    ? await previewRefund(r.reservationId)
    : null;

  return (
    <article className="flex flex-col gap-4 pb-6">
      <header className="flex items-center gap-1 px-2 pt-2">
        <BackButton fallbackHref="/reservations" />
        <h1 className="text-lg font-bold">예약 상세</h1>
      </header>

      <section className="flex flex-col gap-2 px-4">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Badge variant={r.status === 'cancelled' ? 'outline' : 'secondary'}>
            {STATUS_LABEL[r.status]}
          </Badge>
          {r.noShow ? <Badge variant="destructive">노쇼</Badge> : null}
          {isVisitPending(r.status, r.startAt, now) ? (
            <Badge variant="secondary">방문 확인 중</Badge>
          ) : null}
          <span>예약번호 {r.code}</span>
        </p>
        <h2 className="text-xl font-bold">{r.menuName}</h2>
        <p className="flex items-center gap-2 text-sm">
          <Clock className="size-4 text-muted-foreground" aria-hidden />
          {formatKst(new Date(r.startAt))} · {formatDuration(r.durationMinutes)}
        </p>
      </section>

      <section className="flex flex-col gap-2 border-t px-4 pt-4" aria-label="샵 정보">
        <h3 className="font-semibold">{r.shop.name}</h3>
        <p className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {r.shop.roadAddress}
          {r.shop.addressDetail ? ` ${r.shop.addressDetail}` : ''}
        </p>
        {tel.length >= 8 ? (
          <a href={`tel:${tel}`} className="flex items-center gap-2 text-sm">
            <Phone className="size-4 text-muted-foreground" aria-hidden />
            {r.shop.phone}
          </a>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 border-t px-4 pt-4" aria-label="결제 내역">
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
      </section>

      {r.refund ? (
        <section className="flex flex-col gap-2 border-t px-4 pt-4" aria-label="환불 내역">
          <h3 className="font-semibold">환불 내역</h3>
          <dl className="flex flex-col gap-1">
            <Row label="환불 금액" value={<strong>{formatWon(r.refund.refundAmount)}</strong>} />
            <Row
              label="위약금"
              value={`${formatWon(r.refund.penaltyAmount)} (${r.refund.penaltyRate}%)`}
            />
            <Row label="환불 처리" value={formatKst(new Date(r.refund.processedAt))} />
          </dl>
        </section>
      ) : null}

      {refundPreview ? (
        <section className="flex flex-col gap-2 border-t px-4 pt-4" aria-label="예약 취소">
          {!refundPreview.ok ? (
            <p className="text-sm text-muted-foreground">{refundPreview.error.message}</p>
          ) : refundPreview.data.refundable ? (
            // 다시 읽을 때마다(서버 시각이 바뀌면) 새로 시작한다. 창을 닫은 뒤 새 금액·상태로 맞추려고
            <CancelReservation key={refundPreview.data.serverNow} preview={refundPreview.data} />
          ) : (
            // 시작까지 6시간 미만이면 취소 버튼 대신 안내만(10/29 결정, #128)
            <p className="text-sm text-muted-foreground">{REFUND_ERRORS.NOT_REFUNDABLE}</p>
          )}
        </section>
      ) : null}
    </article>
  );
}
