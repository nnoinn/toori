import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import { ensureAdminPage } from '@/server/auth';

import {
  labelCancelActor,
  labelHoursBefore,
  labelOrderStatus,
  labelRefundBand,
  labelRefundReason,
  labelRefundStatus,
  labelReservation,
} from '../format';
import { selectReservationDetail } from '../queries';

export const metadata: Metadata = { title: '예약 정보' };

type Params = Promise<{ reservationId: string }>;

const when = (date: Date | null) => (date ? formatKst(date) : '-');

// 예약 상세 (A-103). 주소: /admin/reservations/[reservationId]. 결제와 취소·환불 기록, 운영자 확인 이유를 본다(조회만)
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
  await ensureAdminPage();
  const { reservationId } = await params;
  if (!z.uuid().safeParse(reservationId).success) notFound();
  const detail = await selectReservationDetail(getDb(), reservationId);
  if (!detail) notFound();

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
