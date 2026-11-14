import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import { formatWon } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { formatKst, formatKstDateTime } from '@/lib/time';
import { isUuid } from '@/lib/uuid';
import { recordAdminAccess } from '@/server/admin/access-log';
import { ensureAdminPage } from '@/server/auth';
import { disputeDeadline, disputeOpensAt, disputeTypes } from '@/server/disputes/rules';
import { DISPUTE_DEADLINE_BUSINESS_HOURS } from '@/server/policy/dispute';

import {
  labelCancelActor,
  labelHoursBefore,
  labelOrderStatus,
  labelRefundBand,
  labelRefundReason,
  labelRefundStatus,
} from '../format';
import { DISPUTE_TYPE_LABELS, labelDisputeStatus, toKstInputValue } from '../../disputes/format';
import { labelReservation } from '../../lookup';
import { selectReservationDetail } from '../queries';
import { RegisterDispute } from './register-dispute';

export const metadata: Metadata = { title: '예약 정보' };

type Params = Promise<{ reservationId: string }>;

const when = (date: Date | null) => (date ? formatKst(date) : '-');

// 예약 상세 (A-103). 주소: /admin/reservations/[reservationId]. 결제와 취소·환불 기록, 운영자 확인 이유를 본다.
// 카카오톡 채널로 받은 이의제기는 여기서 등록한다(A-104, [이의제기 등록]). 이미 있으면 그 이의제기로 보낸다
export default function AdminReservationPage({ params }: { params: Params }) {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/admin/reservations" />
        <h1 className="text-xl font-bold">예약 정보</h1>
      </div>
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: Params }) {
  const admin = await ensureAdminPage();
  const { reservationId } = await params;
  if (!isUuid(reservationId)) notFound();
  const detail = await selectReservationDetail(getDb(), reservationId);
  if (!detail) notFound();
  await recordAdminAccess(admin.userId, {
    action: 'view',
    targetType: 'reservation',
    targetId: reservationId,
    path: `/admin/reservations/${reservationId}`,
  });
  const now = await getRequestNow();
  const disputeTarget = {
    status: detail.status,
    startAt: detail.startAt,
    visitResult: detail.visitResult,
    visitRecordedAt: detail.visitRecordedAt,
    cancelledAt: detail.cancelledAt,
  };
  const disputeDue = disputeDeadline(disputeTarget);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{detail.code}</CardTitle>
            <Badge variant="secondary">{labelReservation(detail.status, detail.visitResult)}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <Field label="샵">
              <Link href={`/admin/shops/${detail.shopId}`} className="hover:underline">
                {detail.shopName}
              </Link>
            </Field>
            <Field label="메뉴">{detail.menuName}</Field>
            <Field label="일시">{formatKst(detail.startAt)}</Field>
            <Field label="고객">{detail.customerNickname}</Field>
            <Field label="예약한 시각">{formatKst(detail.createdAt)}</Field>
            <Field label="방문 처리">{when(detail.visitRecordedAt)}</Field>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>결제</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <Field label="결제 번호">{detail.paymentId}</Field>
            <Field label="주문 상태">{labelOrderStatus(detail.orderStatus)}</Field>
            <Field label="포트원 상태">{detail.pgStatus ?? '-'}</Field>
            <Field label="결제 수단">{detail.payMethod ?? '-'}</Field>
            <Field label="결제 시각">{when(detail.paidAt)}</Field>
            <Field label="판매가">{formatWon(detail.salePrice)}</Field>
            <Field label="쿠폰">{formatWon(detail.couponAmount)}</Field>
            <Field label="결제액">{formatWon(detail.amount)}</Field>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>취소·환불</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {detail.status === 'cancelled' ? (
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
              <Field label="취소한 쪽">{labelCancelActor(detail.cancelActor)}</Field>
              <Field label="취소 시각">{when(detail.cancelledAt)}</Field>
              <Field label="시작까지">{labelHoursBefore(detail.hoursBeforeStartAtCancel)}</Field>
              <Field label="취소 사유">{detail.cancelReason ?? '-'}</Field>
            </dl>
          ) : null}
          {detail.refunds.length === 0 ? (
            <p className="text-sm text-muted-foreground">환불 기록이 없어요</p>
          ) : (
            detail.refunds.map((refund) => (
              <dl
                key={refund.refundId}
                className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 border-t pt-4 text-sm"
              >
                <Field label="환불 사유">{labelRefundReason(refund.reason)}</Field>
                <Field label="상태">{labelRefundStatus(refund.status)}</Field>
                <Field label="위약금 구간">
                  {labelRefundBand(refund.band)} · {refund.penaltyRate}%
                </Field>
                <Field label="환불액">{formatWon(refund.refundAmount)}</Field>
                <Field label="위약금">{formatWon(refund.penaltyAmount)}</Field>
                <Field label="포트원 취소 번호">{refund.pgCancellationId ?? '-'}</Field>
                <Field label="처리 시각">{when(refund.processedAt)}</Field>
                {refund.reviewReason ? (
                  <Field label="운영자 확인">
                    <span className="font-medium text-destructive">{refund.reviewReason}</span>
                  </Field>
                ) : null}
              </dl>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>이의제기</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {detail.dispute ? (
            <p>
              <Link
                href={`/admin/disputes/${detail.dispute.disputeId}`}
                className="hover:underline"
              >
                {labelDisputeStatus(detail.dispute.status, detail.dispute.outcome)} · 이의제기 보기
              </Link>
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                접수 기간: {formatKstDateTime(disputeOpensAt(disputeTarget))}부터{' '}
                {disputeDue
                  ? `${formatKstDateTime(disputeDue)}까지`
                  : `방문·노쇼 처리 뒤 영업일 기준 ${DISPUTE_DEADLINE_BUSINESS_HOURS}시간까지`}
                . 카카오톡 채널로 받은 이의제기를 받은 시각과 함께 남겨요.
              </p>
              <div>
                <RegisterDispute
                  reservationId={detail.reservationId}
                  types={disputeTypes(disputeTarget).map((value) => ({
                    value,
                    label: DISPUTE_TYPE_LABELS[value],
                  }))}
                  defaultReceivedAt={toKstInputValue(now)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all">{children}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
