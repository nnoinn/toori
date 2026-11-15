import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DISPUTE_OUTCOMES } from '@/db/schema';
import { getDb } from '@/db';
import { formatKst, formatKstDateTime } from '@/lib/time';
import { isUuid } from '@/lib/uuid';
import { recordAdminAccess } from '@/server/admin/access-log';
import { ensureAdminPage } from '@/server/auth';
import { disputeDeadline, outcomeBlockReason } from '@/server/disputes/rules';

import { labelReservation } from '../../lookup';
import {
  DISPUTE_CHANNEL_DETAIL_LABELS,
  DISPUTE_OUTCOME_LABELS,
  DISPUTE_TYPE_LABELS,
  labelDisputeStatus,
  type OutcomeOption,
} from '../format';
import { selectDisputeDetail } from '../queries';
import { ResolveForm } from './resolve-form';

export const metadata: Metadata = { title: '이의제기 정보' };

type Params = Promise<{ disputeId: string }>;

// 이의제기 상세 (A-104, W19 ②). 주소: /admin/disputes/[disputeId]. 예약·접수 내용을 보고, 확인 중이면 결론을 기록한다.
// 결론을 기록하면 정산 보류가 풀린다. 고객 연락처는 보여주지 않는다(#360 4번)
export default function AdminDisputePage({ params }: { params: Params }) {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/admin/disputes" />
        <h1 className="text-xl font-bold">이의제기 정보</h1>
      </div>
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: Params }) {
  const admin = await ensureAdminPage();
  const { disputeId } = await params;
  if (!isUuid(disputeId)) notFound();
  const detail = await selectDisputeDetail(getDb(), disputeId);
  if (!detail) notFound();
  await recordAdminAccess(admin.userId, {
    action: 'view',
    targetType: 'dispute',
    targetId: disputeId,
    path: `/admin/disputes/${disputeId}`,
  });

  const deadline = disputeDeadline({
    status: detail.reservationStatus,
    startAt: detail.startAt,
    visitResult: detail.visitResult,
    visitRecordedAt: detail.visitRecordedAt,
    cancelledAt: detail.cancelledAt,
  });
  const open = detail.status === 'open';
  const options: OutcomeOption[] = DISPUTE_OUTCOMES.map((value) => {
    const blocked = outcomeBlockReason(value, detail);
    return {
      value,
      label: DISPUTE_OUTCOME_LABELS[value],
      ready: blocked !== 'OUTCOME_NOT_READY',
      allowed: blocked !== 'OUTCOME_NOT_ALLOWED',
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{detail.reservationCode}</CardTitle>
            <Badge variant={open ? 'default' : 'secondary'}>
              {labelDisputeStatus(detail.status, detail.outcome)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <Field label="예약">
              <Link
                href={`/admin/reservations/${detail.reservationId}`}
                className="hover:underline"
              >
                {detail.reservationCode} ·{' '}
                {labelReservation(detail.reservationStatus, detail.visitResult)}
              </Link>
            </Field>
            <Field label="샵">
              <Link href={`/admin/shops/${detail.shopId}`} className="hover:underline">
                {detail.shopName}
              </Link>
            </Field>
            <Field label="메뉴">{detail.menuName}</Field>
            <Field label="서비스 일시">{formatKst(detail.startAt)}</Field>
            {/* 이의제기는 그 예약의 손님만 신청한다(11/13 nnoinn). 연락처는 보여주지 않는다(#360 4번) */}
            <Field label="신청한 사람">
              <Link
                href={`/admin/users/customers/${detail.customerId}`}
                className="hover:underline"
              >
                {detail.customerName}
              </Link>
            </Field>
            <Field label="종류">{DISPUTE_TYPE_LABELS[detail.type]}</Field>
            <Field label="경로">{DISPUTE_CHANNEL_DETAIL_LABELS[detail.channel]}</Field>
            <Field label="받은 시각">{formatKstDateTime(detail.receivedAt)}</Field>
            <Field label="접수 기한">
              {deadline
                ? formatKstDateTime(deadline)
                : '방문·노쇼 처리 전이라 아직 정해지지 않았어요'}
            </Field>
            <Field label="정산">{open ? '보류 중(결론을 기록하면 풀려요)' : '보류 풀림'}</Field>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>내용</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm break-all whitespace-pre-wrap">{detail.content}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>결론</CardTitle>
        </CardHeader>
        <CardContent>
          {open ? (
            <ResolveForm disputeId={detail.disputeId} options={options} />
          ) : (
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
              <Field label="결론">
                {detail.outcome ? DISPUTE_OUTCOME_LABELS[detail.outcome] : '-'}
              </Field>
              <Field label="메모">
                <span className="whitespace-pre-wrap">{detail.result ?? '-'}</span>
              </Field>
              <Field label="기록한 시각">
                {detail.handledAt ? formatKstDateTime(detail.handledAt) : '-'}
              </Field>
            </dl>
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
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
