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
import { REFUND_ERRORS } from '@/server/refunds/errors';
import { readRefundTargetById } from '@/server/refunds/refund-store';
import { SETTLEMENT_HOLD_ERRORS } from '@/server/settlements/hold-errors';
import { ADMIN_VISIT_ERRORS } from '@/server/visits/admin-errors';

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
import { AGREED_REQUEST_STATUS_LABELS, agreedCancelReasonText } from '../../shops/format';
import { HoldAction } from '../../settlements/hold-actions';
import { HoldList } from '../../settlements/hold-list';
import { reservationHoldBlock } from '../../settlements/hold-panel';
import {
  isShopHeld,
  selectReservationHolds,
  type SettlementHoldRow,
} from '../../settlements/hold-queries';
import { type AgreedCancelView, agreedCancelViews } from '../agreed-cancel-format';
import { selectReservationAgreedCancels } from '../agreed-cancel-queries';
import { selectReservationDetail } from '../queries';
import { OwnerFaultCancelAction } from './owner-fault-action';
import { type OwnerFaultPanel, ownerFaultPanel } from './owner-fault-panel';
import { RegisterDispute } from './register-dispute';
import { VisitAction } from './visit-actions';
import { VoidAction } from './void-action';
import { type VisitPanel, visitPanel } from './visit-panel';

export const metadata: Metadata = { title: '예약 정보' };

type Params = Promise<{ reservationId: string }>;

const when = (date: Date | null) => (date ? formatKst(date) : '-');

// 예약 상세 (A-103). 주소: /admin/reservations/[reservationId]. 결제와 취소·환불 기록, 운영자 확인 이유를 본다.
// 카카오톡 채널로 받은 이의제기는 여기서 등록한다(A-104, [이의제기 등록]). 이미 있으면 그 이의제기로 보낸다.
// 원장님이 못 하면 운영자가 원장님 사정으로 대신 취소한다(#373 ③-2, '취소·환불' 칸)
// 정산에 묶이기 전이면 이 거래의 정산을 보류하고 푼다(#373 ②).
// 원장님의 합의 후 취소 요청과 손님의 답(X-208)도 본다. 보기만 하고 운영자가 대신 요청하거나 답하지는 않는다
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
  const db = getDb();
  const detail = await selectReservationDetail(db, reservationId);
  if (!detail) notFound();
  await recordAdminAccess(admin.userId, {
    action: 'view',
    targetType: 'reservation',
    targetId: reservationId,
    path: `/admin/reservations/${reservationId}`,
  });
  const [now, refundTarget, holds, shopHeld, agreedCancels] = await Promise.all([
    getRequestNow(),
    readRefundTargetById(reservationId, db),
    selectReservationHolds(db, reservationId),
    isShopHeld(db, detail.shopId),
    selectReservationAgreedCancels(db, reservationId),
  ]);
  const ownerFault: OwnerFaultPanel = refundTarget
    ? ownerFaultPanel(refundTarget, now)
    : { kind: 'none' };
  const disputeTarget = {
    status: detail.status,
    startAt: detail.startAt,
    visitResult: detail.visitResult,
    visitRecordedAt: detail.visitRecordedAt,
    cancelledAt: detail.cancelledAt,
  };
  const disputeDue = disputeDeadline(disputeTarget);
  const visit = visitPanel(
    {
      status: detail.status,
      visitResult: detail.visitResult,
      visitRecordedAt: detail.visitRecordedAt,
      startAt: detail.startAt,
      disputeOpen: detail.dispute?.status === 'open',
      settlementBundled: detail.settlementBundled,
    },
    now,
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{detail.code}</CardTitle>
            <Badge variant="secondary">{labelReservation(detail.status, detail.visitResult)}</Badge>
            {detail.voidedAt ? <Badge variant="outline">무효</Badge> : null}
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
          <OwnerFaultPanelView reservationId={detail.reservationId} panel={ownerFault} />
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
          <CardTitle>예약 무효</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {detail.voidedAt ? (
            <p>
              {formatKstDateTime(detail.voidedAt)}에 무효로 처리했어요. 손님에게 남은 결제액과
              사용한 쿠폰을 돌려줬고, 원장님 정산 기준 금액은 0원이에요.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                원장님이 손님에게 전액 환불을 요청했을 때만 써요(고객센터 분쟁이 타협되지 않아
                원장님이 동의한 경우 포함). 원장님 사정으로 서비스를 못 한 것이면 무효가 아니라
                원장님 사정 취소예요.
              </p>
              <VoidAction reservationId={detail.reservationId} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>합의 후 취소 요청</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <AgreedCancelList
            requests={agreedCancelViews(
              agreedCancels,
              { status: detail.status, visitResult: detail.visitResult },
              now,
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>방문·노쇼</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <VisitPanelView reservationId={detail.reservationId} panel={visit} />
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
          ) : detail.voidedAt ? (
            <p className="text-muted-foreground">
              무효로 처리한 예약이라 새 이의제기를 받지 않아요.
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

      <Card>
        <CardHeader>
          <CardTitle>정산 보류</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <HoldPanelView
            reservationId={detail.reservationId}
            shopId={detail.shopId}
            holds={holds}
            shopHeld={shopHeld}
            block={reservationHoldBlock(detail)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** 정산 보류 칸(#373 ②). 묶이기 전이면 이 거래만 멈추고 풀 수 있다. 샵 전체 보류는 샵 정산 화면에서 한다 */
function HoldPanelView({
  reservationId,
  shopId,
  holds,
  shopHeld,
  block,
}: {
  reservationId: string;
  shopId: string;
  holds: SettlementHoldRow[];
  shopHeld: boolean;
  block: ReturnType<typeof reservationHoldBlock>;
}) {
  const active = holds.some((hold) => hold.releasedAt === null);
  return (
    <>
      {shopHeld ? (
        <p>
          이 샵 전체가 정산 보류 중이에요.{' '}
          <Link
            href={`/admin/settlements/shops/${shopId}`}
            className="text-primary hover:underline"
          >
            샵 정산 보기
          </Link>
        </p>
      ) : null}
      {active ? null : block ? (
        <p className="text-muted-foreground">{SETTLEMENT_HOLD_ERRORS[block]}</p>
      ) : (
        <>
          <p className="text-muted-foreground">
            목요일 정산에 묶이기 전에 이 거래만 멈출 수 있어요. 원장님에게는 &quot;운영자 확인
            중&quot;만 보여요.
          </p>
          <div>
            <HoldAction target={{ kind: 'reservation', reservationId }} />
          </div>
        </>
      )}
      {holds.length > 0 ? <HoldList holds={holds} /> : null}
    </>
  );
}

/** 합의 후 취소 요청 칸(X-208). 최근 요청부터, 지금 상태와 그 상태의 시각 */
function AgreedCancelList({ requests }: { requests: AgreedCancelView[] }) {
  if (requests.length === 0) {
    return <p className="text-muted-foreground">원장님이 합의 후 취소를 요청한 적이 없어요</p>;
  }
  return (
    <ul className="flex flex-col divide-y">
      {requests.map((request) => (
        <li key={request.requestId} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
          <p className="flex flex-wrap items-center gap-2">
            <span>{formatKstDateTime(request.requestedAt)} 원장님 요청</span>
            <Badge variant={request.status === 'requested' ? 'default' : 'secondary'}>
              {AGREED_REQUEST_STATUS_LABELS[request.status]}
            </Badge>
          </p>
          <p className="break-all">
            <span className="text-muted-foreground">사유 </span>
            {agreedCancelReasonText(request.reason, request.reasonText)}
          </p>
          {request.timeText ? <p className="text-muted-foreground">{request.timeText}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** 방문·노쇼 칸(#373 ③). 원장님이 못 하면 운영자가 사유를 남기고 대신 처리하고, 잘못 누른 노쇼는 정산에 묶이기 전까지 되돌린다 */
function VisitPanelView({ reservationId, panel }: { reservationId: string; panel: VisitPanel }) {
  switch (panel.kind) {
    case 'cancelled':
      return <p className="text-muted-foreground">취소된 예약이라 방문·노쇼를 처리하지 않아요.</p>;
    case 'before_start':
      return (
        <p className="text-muted-foreground">
          서비스 시작({formatKst(panel.startAt)})부터 원장님 대신 처리할 수 있어요.
        </p>
      );
    case 'can_record':
      return (
        <>
          <p className="text-muted-foreground">
            아직 처리하지 않았어요. 원장님이 처리하지 못하면 운영자가 대신 처리해요.
          </p>
          <div className="flex gap-2">
            <VisitAction reservationId={reservationId} kind="visited" />
            <VisitAction reservationId={reservationId} kind="no_show" variant="destructive" />
          </div>
        </>
      );
    case 'visited':
      return <p>방문 완료 · {when(panel.recordedAt)} 처리</p>;
    case 'no_show':
      return (
        <>
          <p>노쇼 · {when(panel.recordedAt)} 처리</p>
          {panel.reverseBlock ? (
            <p className="text-muted-foreground">{ADMIN_VISIT_ERRORS[panel.reverseBlock]}</p>
          ) : (
            <div>
              <VisitAction reservationId={reservationId} kind="reverse" />
            </div>
          )}
        </>
      );
  }
}

/** 원장님 사정 취소 대신 하기(#373 ③-2). 예정 예약일 때만 보인다. 시작 뒤 문제는 손님이 이의제기한다(A-104) */
function OwnerFaultPanelView({
  reservationId,
  panel,
}: {
  reservationId: string;
  panel: OwnerFaultPanel;
}) {
  switch (panel.kind) {
    case 'none':
      return null;
    case 'blocked':
      return (
        <p className="text-sm text-muted-foreground">
          원장님 사정 취소: {REFUND_ERRORS[panel.code]}
          {panel.code === 'ALREADY_STARTED' ? '. 시작 뒤 문제는 이의제기로 처리해요.' : null}
        </p>
      );
    case 'can_cancel':
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            {panel.resuming
              ? '원장님 사정 취소가 진행 중이에요. 이어서 하면 저장해 둔 금액으로 마무리해요.'
              : '원장님이 하지 못하면 운영자가 원장님 사정으로 대신 취소해요. 금액은 원장님이 한 것과 같아요.'}
          </p>
          <OwnerFaultCancelAction
            reservationId={reservationId}
            preview={panel.preview}
            resuming={panel.resuming}
          />
        </div>
      );
  }
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
