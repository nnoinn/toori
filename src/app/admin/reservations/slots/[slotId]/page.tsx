import { Suspense } from 'react';
import { formatReservationCode } from '@/components/ui/reservation-code';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import {
  getSlotStatus,
  isSlotOnHold,
  SLOT_STATUS_LABELS,
} from '@/features/slot-status/slot-status';
import { formatDuration, formatWon } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { formatKst, formatKstDateTime, formatKstTime } from '@/lib/time';
import { isUuid } from '@/lib/uuid';
import { ensureAdminPage } from '@/server/auth';
import { FALLBACK_ADMIN_NAME } from '@/server/admin/admin-name';
import { serviceTypeLabel } from '@/server/policy/catalog';

import { labelReservation } from '../../../lookup';
import { ACTION_LABELS, labelOf } from '../../../logs/format';
import { SlotControlAction } from '../../../shops/slot-control-actions';
import {
  canForceCloseSlot,
  labelSlotCloseReason,
  SLOT_ORIGIN_LABELS,
  slotDetailHref,
  slotOrigin,
  HOLDING_BADGE,
  reservationBadge,
  SLOT_STATUS_BADGES,
} from '../../format';
import { selectSlotDetail, type SlotDetail } from '../../queries';

export const metadata: Metadata = { title: '매물 정보' };

type Params = Promise<{ slotId: string }>;

// 매물 상세 (A-103, 11/19 운영자 화면 피드백). 주소: /admin/reservations/slots/[slotId].
// 매물 목록에서 줄을 두 번 누르거나 메뉴 이름·[상세]를 누르면 열린다. 매물 내용과 상태, 이 매물의 예약, 운영자 처리 기록을 본다.
// 판매 전이면 여기서도 강제 마감한다(#373 ④). 고객 정보는 보여 주지 않아서 열람 기록은 남기지 않는다(예약은 예약 상세에서 본다)
export default function AdminSlotPage({ params }: { params: Params }) {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/admin/reservations?tab=slots" />
        <h1 className="text-xl font-bold">매물 정보</h1>
      </div>
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: Params }) {
  await ensureAdminPage();
  const { slotId } = await params;
  if (!isUuid(slotId)) notFound();
  const [slot, now] = await Promise.all([selectSlotDetail(getDb(), slotId), getRequestNow()]);
  if (!slot) notFound();
  const status = getSlotStatus(slot, now);
  const onHold = isSlotOnHold(slot, now);
  const origin = slotOrigin(slot);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">{slot.menuName}</CardTitle>
            <Badge variant={SLOT_STATUS_BADGES[status]}>{SLOT_STATUS_LABELS[status]}</Badge>
            {onHold ? <Badge variant={HOLDING_BADGE}>결제 중</Badge> : null}
            {canForceCloseSlot(slot, now) ? (
              <div className="ml-auto">
                <SlotControlAction target={{ kind: 'close_slot', slotId: slot.slotId }} size="sm" />
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <Field label="샵">
              <Link href={`/admin/shops/${slot.shopId}`} className="hover:underline">
                {slot.shopName}
              </Link>
            </Field>
            <Field label="서비스 종류">{serviceTypeLabel(slot.serviceType)}</Field>
            {slot.menuDescription ? (
              <Field label="메뉴 설명">
                <span className="whitespace-pre-line">{slot.menuDescription}</span>
              </Field>
            ) : null}
            <Field label="일시">
              {formatKst(slot.startAt)}~{formatKstTime(slot.endAt)} (
              {formatDuration(slot.durationMinutes)})
            </Field>
            <Field label="정가">{formatWon(slot.listPrice)}</Field>
            <Field label="할인">{slot.discountRate}%</Field>
            <Field label="판매가">{formatWon(slot.salePrice)}</Field>
            <Field label="신규 고객 전용">{slot.newCustomerOnly ? '예' : '아니요'}</Field>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>등록·상태</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <Field label="올린 방식">
              {SLOT_ORIGIN_LABELS[origin]}
              {origin === 'relist' && slot.relistedFromSlotId ? (
                <>
                  {' · '}
                  <Link href={slotDetailHref(slot.relistedFromSlotId)} className="hover:underline">
                    원래 매물 보기
                  </Link>
                </>
              ) : null}
            </Field>
            <Field label="등록한 시각">{formatKstDateTime(slot.createdAt)}</Field>
            <Field label="게시 시각">{formatKstDateTime(slot.publishAt)}</Field>
            {onHold && slot.holdExpiresAt ? (
              <Field label="결제 중">{formatKstDateTime(slot.holdExpiresAt)}까지 홀딩</Field>
            ) : null}
            {slot.closedAt || slot.closeReason ? (
              <>
                <Field label="마감 시각">
                  {slot.closedAt ? formatKstDateTime(slot.closedAt) : '-'}
                </Field>
                <Field label="마감 사유">{labelSlotCloseReason(slot.closeReason)}</Field>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <ReservationsCard reservations={slot.reservations} />
      <AdminActionsCard actions={slot.adminActions} />
    </div>
  );
}

function ReservationsCard({ reservations }: { reservations: SlotDetail['reservations'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>예약</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {reservations.length === 0 ? (
          <p className="text-muted-foreground">이 매물의 예약이 없어요</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reservations.map((reservation) => (
              <li key={reservation.reservationId} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/reservations/${reservation.reservationId}`}
                  className="font-medium hover:underline"
                >
                  {formatReservationCode(reservation.code)}
                </Link>
                <Badge variant={reservationBadge(reservation.status, reservation.visitResult)}>
                  {labelReservation(reservation.status, reservation.visitResult)}
                </Badge>
                <span className="text-muted-foreground">
                  {formatKstDateTime(reservation.bookedAt)} 예약
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AdminActionsCard({ actions }: { actions: SlotDetail['adminActions'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>운영자 처리 기록</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {actions.length === 0 ? (
          <p className="text-muted-foreground">이 매물에 운영자가 처리한 기록이 없어요</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {actions.map((action, index) => (
              <li key={`${action.at.toISOString()}-${index}`} className="flex flex-col gap-0.5">
                <p>
                  <span className="font-medium">{labelOf(ACTION_LABELS, action.action)}</span>
                  <span className="text-muted-foreground">
                    {' · '}
                    {formatKstDateTime(action.at)} · {action.adminName ?? FALLBACK_ADMIN_NAME}
                  </span>
                </p>
                {action.memo ? (
                  <p className="whitespace-pre-line text-muted-foreground">{action.memo}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}
