import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/uuid';

import { BackButton } from '@/components/ui/back-button';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import { formatBusinessNumber } from '@/lib/business-number';
import { getRequestNow } from '@/lib/request-time';
import { formatEndTime, formatKst, kstDateKey } from '@/lib/time';
import { cn } from '@/lib/utils';
import { recordAdminAccess } from '@/server/admin/access-log';
import { ensureAdminPage } from '@/server/auth';
import { getBusinessDocUrl } from '@/server/storage/upload';
import { adminNoticeText, bankName, categoryLabel } from '@/server/policy';

import { lookupHref } from '../../reservations/format';
import {
  CANCEL_STATS_ANCHOR,
  CANCEL_STATS_PERIOD_ERROR,
  CancelStatsPeriodForm,
  ShopCancelStatsView,
} from '../cancel-stats';
import {
  type CancelStatsSearch,
  labelCancelStatsPeriod,
  readCancelStatsSearch,
  toCancelStatsRange,
} from '../cancel-stats-period';
import { selectShopCancelStats } from '../cancel-stats-queries';
import { labelPgSellerStatus, labelReviewAction, ntsCheckText } from '../format';
import { selectShopForReview, type ShopReviewDetail } from '../queries';
import { SlotControlAction } from '../slot-control-actions';
import { selectShopSlotControl, type ShopSlotControl } from '../slot-control-queries';
import { StatusBadge } from '../status-badge';
import { BusinessEdit } from './business-edit';
import { ReviewActions } from './review-actions';

export const metadata: Metadata = { title: '입점 심사' };

type Params = Promise<{ shopId: string }>;
type SearchParams = Promise<CancelStatsSearch>;

// 입점 심사 상세 (A-101). 주소: /admin/shops/[shopId]. 승인 대기면 승인·반려 버튼. PC 기준
// 입점 승인된 샵은 취소 기록의 기간을 cancelFrom·cancelTo로 고른다(#486, 예: ?cancelFrom=2026-11-01&cancelTo=2026-11-18)
export default function AdminShopReviewPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/admin/shops" />
        <h1 className="text-xl font-bold">입점 심사</h1>
      </div>
      <Suspense fallback={<DetailSkeleton />}>
        <ReviewDetail params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ReviewDetail({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const admin = await ensureAdminPage();
  const { shopId } = await params;
  if (!isUuid(shopId)) notFound();
  const db = getDb();
  const detail = await selectShopForReview(db, shopId);
  if (!detail) notFound();
  await recordAdminAccess(admin.userId, {
    action: 'view',
    targetType: 'shop',
    targetId: shopId,
    path: `/admin/shops/${shopId}`,
  });
  // 비공개 버킷이라 5분 동안만 열리는 주소를 화면을 열 때마다 새로 받는다(#116)
  const doc = await getBusinessDocUrl(shopId);
  const approved = detail.status === 'approved';
  const now = await getRequestNow();
  // 입점 승인된 샵만 매물을 올리므로 그때만 매물 관리 칸을 보여 준다(#373 ④)
  const control = approved ? await selectShopSlotControl(db, shopId, now) : null;
  // 입점 승인된 샵만 예약을 받으므로 그때만 취소 기록을 본다. 기간이 잘못됐으면 기록 대신 안내를 보인다(#486)
  const cancelPeriod = readCancelStatsSearch(await searchParams);
  const cancelRange = toCancelStatsRange(cancelPeriod);
  const cancelStats =
    approved && cancelRange ? await selectShopCancelStats(db, shopId, cancelRange) : null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{detail.shop.name}</CardTitle>
            <StatusBadge status={detail.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Fields
            rows={[
              ['신청', formatKst(detail.appliedAt)],
              ['심사', detail.reviewedAt ? formatKst(detail.reviewedAt) : '-'],
              ...(detail.rejectionReason
                ? ([['반려 사유', detail.rejectionReason]] as [string, string][])
                : []),
            ]}
          />
          {detail.status === 'pending' ? (
            <ReviewActions shopId={detail.shopId} shopName={detail.shop.name} />
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="사업자 정보">
          <Fields
            rows={[
              ['상호', detail.business.businessName],
              ['대표자', detail.business.representativeName],
              ['사업자등록번호', formatBusinessNumber(detail.business.businessRegistrationNumber)],
              ['개업일자', detail.business.openedOn],
              ['국세청 확인', ntsCheckText(detail.business.ntsCheck, detail.business.ntsCheckedAt)],
            ]}
          />
          {doc.ok ? (
            <a
              href={doc.data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              사업자등록증 열기
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">{doc.error.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            등록증 주소는 5분 동안만 열려요. 지나면 화면을 새로 고쳐 주세요.
          </p>
          {detail.status === 'approved' ? (
            <BusinessEdit shopId={detail.shopId} current={detail.business} />
          ) : null}
        </Section>

        <Section title="원장님">
          <Fields
            rows={[
              ['이름', detail.owner.name],
              ['연락처', detail.owner.phone],
            ]}
          />
          {/* 원장님 계정에서 일어난 일(입점·매물·예약·정산 계좌 등)을 시각 순으로(#374) */}
          <Link
            href={`/admin/users/owners/${detail.owner.id}/history`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'self-start')}
          >
            원장님 이력 보기
          </Link>
        </Section>

        <Section title="샵">
          <Fields
            rows={[
              ['샵 이름', detail.shop.name],
              ['업종', categoryLabel(detail.shop.category)],
              ['전화', detail.shop.phone],
              [
                '주소',
                [detail.shop.roadAddress, detail.shop.addressDetail].filter(Boolean).join(' '),
              ],
              ['지역', `${detail.shop.sido} ${detail.shop.sigungu}`],
            ]}
          />
        </Section>

        <Section title="정산 계좌">
          <PayoutFields payout={detail.payout} />
        </Section>
      </div>

      {control ? (
        <Section title="매물 관리">
          <SlotControlPanel shopId={detail.shopId} shopName={detail.shop.name} control={control} />
        </Section>
      ) : null}

      {approved ? (
        <Section
          id={CANCEL_STATS_ANCHOR}
          title={cancelRange ? `취소 기록 · ${labelCancelStatsPeriod(cancelPeriod)}` : '취소 기록'}
        >
          <CancelStatsPeriodForm
            shopId={detail.shopId}
            period={cancelPeriod}
            today={kstDateKey(now)}
          />
          {cancelStats ? (
            <ShopCancelStatsView stats={cancelStats} />
          ) : (
            <p role="alert" className="text-sm text-destructive">
              {CANCEL_STATS_PERIOD_ERROR}
            </p>
          )}
        </Section>
      ) : null}

      <Section title="심사 기록">
        {detail.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 심사 기록이 없어요</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {detail.history.map((item, index) => (
              <li key={index} className="flex gap-3">
                <span className="w-28 shrink-0 text-muted-foreground">
                  {formatKst(item.createdAt)}
                </span>
                <span className="font-medium">{labelReviewAction(item.action)}</span>
                {item.memo ? <span className="text-muted-foreground">{item.memo}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/**
 * 매물 관리 칸(#373 ④). 새 매물 게시를 멈추고 다시 열며, 지금 올라와 있는 시간대 매물을 강제 마감한다.
 * 한 시술 매물은 매물·예약 > 매물 목록에서 강제 마감한다
 */
function SlotControlPanel({
  shopId,
  shopName,
  control,
}: {
  shopId: string;
  shopName: string;
  control: ShopSlotControl;
}) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-medium">새 매물 등록: {control.pause ? '멈춤' : '올릴 수 있어요'}</p>
          {control.pause ? (
            <p className="break-all text-muted-foreground">
              {formatKst(control.pause.pausedAt)}부터 · 원장님에게 보이는 사유:{' '}
              {adminNoticeText(control.pause.code, 'publish_pause').label} · 운영자 메모:{' '}
              {control.pause.reason}
            </p>
          ) : (
            <p className="text-muted-foreground">
              멈추면 새 매물·시간대 매물을 올릴 수 없어요. 이미 올린 매물과 예약은 그대로예요.
            </p>
          )}
        </div>
        <SlotControlAction
          target={control.pause ? { kind: 'resume', shopId } : { kind: 'pause', shopId }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-medium">올라와 있는 시간대 매물 {control.openWindows.length}개</p>
        {control.openWindows.length === 0 ? null : (
          <ul className="flex flex-col divide-y">
            {control.openWindows.map((window) => (
              <li
                key={window.windowId}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span>
                  {formatKst(window.startAt)}~{formatEndTime(window.startAt, window.endAt)}
                </span>
                <SlotControlAction
                  target={{ kind: 'close_window', windowId: window.windowId }}
                  size="sm"
                />
              </li>
            ))}
          </ul>
        )}
        <Link
          href={lookupHref({ tab: 'slots', query: shopName })}
          className="w-fit text-primary hover:underline"
        >
          이 샵의 한 시술 매물 보기(강제 마감)
        </Link>
      </div>
    </div>
  );
}

function PayoutFields({ payout }: { payout: ShopReviewDetail['payout'] }) {
  if (!payout) return <p className="text-sm text-muted-foreground">등록된 정산 계좌가 없어요</p>;
  return (
    <Fields
      rows={[
        ['은행', bankName(payout.bankCode)],
        ['계좌번호', `뒷자리 ${payout.accountLast4}`],
        ['예금주', payout.accountHolder],
        ['PG 셀러', labelPgSellerStatus(payout.pgSellerStatus)],
      ]}
    />
  );
}

function Section({
  title,
  id,
  children,
}: {
  title: string;
  /** 주소의 #자리로 이 칸에 바로 오게 할 때 */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className={id ? 'scroll-mt-4' : undefined}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function Fields({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}
