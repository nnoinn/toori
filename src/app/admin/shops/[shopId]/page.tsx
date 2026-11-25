import { type ReactNode, Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isUuid } from '@/lib/uuid';

import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DetailLink, SelectableRow, SelectableRows } from '@/components/ui/selectable-rows';
import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import {
  getSlotStatus,
  isSlotOnHold,
  SLOT_STATUS_LABELS,
} from '@/features/slot-status/slot-status';
import { formatBusinessNumber } from '@/lib/business-number';
import { formatWon } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { formatEndTime, formatKst, kstDateKey } from '@/lib/time';
import { maskPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { recordAdminAccess } from '@/server/admin/access-log';
import { ensureAdminPage } from '@/server/auth';
import { getBusinessDocUrl } from '@/server/storage/upload';
import { adminNoticeText, bankName, categoryLabel } from '@/server/policy';

import {
  canForceCloseSlot,
  lookupHref,
  slotDetailHref,
  windowDetailHref,
} from '../../reservations/format';
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
import { revealShopOwnerContact } from '../../users/contact-actions';
import { ContactReveal, RevealButton, RevealedValue } from '../../users/contact-reveal';
import { labelPgSellerStatus, labelReviewAction, ntsCheckText } from '../format';
import { selectShopForReview, type ShopReviewDetail } from '../queries';
import { type SameBusinessShop, selectSameBusinessShops } from '../same-business-queries';
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
  // 예약을 받았던 샵(승인됨·탈퇴함)만 취소 기록이 있다. 탈퇴한 샵도 보여 줘야 같은 사업자의 다시 신청을 심사할 때 볼 수 있다(#154)
  const showCancelStats = approved || detail.status === 'withdrawn';
  const now = await getRequestNow();
  // 입점 승인된 샵만 매물을 올리므로 그때만 매물 관리 칸을 보여 준다(#373 ④)
  const control = approved ? await selectShopSlotControl(db, shopId, now) : null;
  // 승인됐거나 탈퇴한 샵만 취소 기록을 본다. 기간이 잘못됐으면 기록 대신 안내를 보인다(#486)
  const cancelPeriod = readCancelStatsSearch(await searchParams);
  const cancelRange = toCancelStatsRange(cancelPeriod);
  const cancelStats =
    showCancelStats && cancelRange
      ? await selectShopCancelStats(db, shopId, now, cancelRange)
      : null;
  // 같은 사업자등록번호의 다른 샵(#154 재가입과 악용 막기). 탈퇴하고 다시 신청한 원장님의 예전 취소 기록을 확인한다
  const sameBusiness = await selectSameBusinessShops(db, {
    shopId,
    businessRegistrationNumber: detail.business.businessRegistrationNumber,
  });

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

      {sameBusiness.length > 0 ? (
        <Section title={`같은 사업자등록번호의 다른 샵 ${sameBusiness.length}곳`}>
          <SameBusinessShops shops={sameBusiness} />
        </Section>
      ) : null}

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
            // 승인된 샵은 등록증이 늘 있다(탈퇴한 샵만 비울 수 있다, shops_business_doc_path_check)
            <BusinessEdit
              shopId={detail.shopId}
              current={{
                ...detail.business,
                businessDocPath: detail.business.businessDocPath ?? '',
              }}
            />
          ) : null}
        </Section>

        <Section title="원장님">
          {/* 연락처는 가려서 보여 주고, [번호 보기]를 누르면 같은 자리에 전체를 진하게 보여 준다(#360 4번) */}
          <ContactReveal reveal={revealShopOwnerContact.bind(null, detail.shopId)}>
            <Fields
              rows={[
                ['이름', detail.owner.name],
                [
                  '연락처',
                  <RevealedValue
                    key="phone"
                    field="phone"
                    masked={maskPhone(detail.owner.phone)}
                  />,
                ],
              ]}
            />
            <RevealButton />
          </ContactReveal>
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
          {/* 이 샵의 정산 묶음·지급·보류를 바로 본다(#567 2번) */}
          <Link
            href={`/admin/settlements/shops/${detail.shopId}`}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3 w-fit')}
          >
            이 샵 정산 보기
          </Link>
        </Section>
      </div>

      {control ? (
        <Section title="매물 관리">
          <SlotControlPanel
            shopId={detail.shopId}
            shopName={detail.shop.name}
            control={control}
            now={now}
          />
        </Section>
      ) : null}

      {showCancelStats ? (
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
 * 매물 관리 칸(#373 ④, #567 3번). 새 매물 게시를 멈추고 다시 열며, 아래를 [시간대 매물]과 [한 시술 매물] 두 영역으로 나눈다.
 * 영역마다 가까운 것부터 SHOP_SLOT_CONTROL_LIMIT개까지 줄마다 강제 마감하고, [전체 보기]는 매물·예약 화면을 이 샵 이름으로 연다.
 * 줄을 두 번 누르거나 Enter를 누르면 그 시간대 매물·매물 상세가 열린다(#567, 완료의 기준 7번). 시각·메뉴 이름도 상세로 가는 링크다
 */
function SlotControlPanel({
  shopId,
  shopName,
  control,
  now,
}: {
  shopId: string;
  shopName: string;
  control: ShopSlotControl;
  now: Date;
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

      <SlotArea
        title={`올라와 있는 시간대 매물 ${control.openWindowCount}개`}
        empty="올라와 있는 시간대 매물이 없어요"
        allHref={lookupHref({ tab: 'windows', query: shopName })}
        more={control.openWindowCount > control.openWindows.length}
      >
        {control.openWindows.map((window) => (
          <SelectableRow
            as="li"
            key={window.windowId}
            id={window.windowId}
            href={windowDetailHref(window.windowId)}
            title={DOUBLE_CLICK_HINT}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <Link href={windowDetailHref(window.windowId)} className="hover:underline">
              {formatKst(window.startAt)}~{formatEndTime(window.startAt, window.endAt)}
            </Link>
            <SlotControlAction
              target={{ kind: 'close_window', windowId: window.windowId }}
              size="sm"
            />
          </SelectableRow>
        ))}
      </SlotArea>

      <SlotArea
        title={`판매 전 한 시술 매물 ${control.openSlotCount}개`}
        empty="판매 전 한 시술 매물이 없어요"
        allHref={lookupHref({ tab: 'slots', query: shopName })}
        more={control.openSlotCount > control.openSlots.length}
      >
        {control.openSlots.map((slot) => (
          <SelectableRow
            as="li"
            key={slot.slotId}
            id={slot.slotId}
            href={slotDetailHref(slot.slotId)}
            title={DOUBLE_CLICK_HINT}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <span className="flex flex-wrap items-center gap-2">
              <Link href={slotDetailHref(slot.slotId)} className="hover:underline">
                {slot.menuName}
              </Link>
              <span className="text-muted-foreground">{formatKst(slot.startAt)}</span>
              <Badge variant="secondary">{SLOT_STATUS_LABELS[getSlotStatus(slot, now)]}</Badge>
              {isSlotOnHold(slot, now) ? <Badge>결제 중</Badge> : null}
            </span>
            {/* 손님이 결제 중이면 강제 마감할 수 없다. 막는 것은 서버가 다시 본다 */}
            {canForceCloseSlot(slot, now) ? (
              <SlotControlAction target={{ kind: 'close_slot', slotId: slot.slotId }} size="sm" />
            ) : null}
          </SelectableRow>
        ))}
      </SlotArea>
    </div>
  );
}

/**
 * 같은 사업자등록번호의 다른 샵(#154). 줄을 두 번 누르거나 Enter·[상세]로 그 샵 상세(취소 기록)가 열린다(완료의 기준 7번).
 * 원장님 사정 취소 건수와 못 걷은 패널티는 전체 기간이다
 */
function SameBusinessShops({ shops }: { shops: SameBusinessShop[] }) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground">
        탈퇴하고 다시 신청한 원장님일 수 있어요. 예전 샵의 원장님 사정 취소 기록을 확인해 주세요.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem]">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="px-2 py-2 font-medium">샵</th>
              <th className="px-2 py-2 font-medium">상태</th>
              <th className="px-2 py-2 font-medium">원장님</th>
              <th className="px-2 py-2 font-medium">신청</th>
              <th className="px-2 py-2 font-medium">원장님 사정 취소</th>
              <th className="px-2 py-2 font-medium">못 걷은 패널티</th>
              <th className="px-2 py-2 font-medium">
                <span className="sr-only">관리</span>
              </th>
            </tr>
          </thead>
          <SelectableRows>
            {shops.map((shop) => {
              const href = `/admin/shops/${shop.shopId}`;
              return (
                <SelectableRow key={shop.shopId} id={shop.shopId} href={href}>
                  <td className="px-2 py-2 font-medium">
                    <Link href={href} className="hover:underline">
                      {shop.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <StatusBadge status={shop.status} />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {shop.ownerWithdrawnAt ? `탈퇴 ${formatKst(shop.ownerWithdrawnAt)}` : '-'}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatKst(shop.appliedAt)}</td>
                  <td className="px-2 py-2">{shop.ownerFaultCount}건</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {shop.unpaidPenalty > 0 ? formatWon(shop.unpaidPenalty) : '-'}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <DetailLink href={href} label={`${shop.name} 샵 상세`} />
                  </td>
                </SelectableRow>
              );
            })}
          </SelectableRows>
        </table>
      </div>
    </div>
  );
}

/** 매물 관리 줄에 마우스를 올리면 보이는 안내 */
const DOUBLE_CLICK_HINT = '두 번 누르면 상세가 열려요';

/** 매물 관리 칸의 한 영역(#567 3번). 위에 구분선을 두고, 줄 목록 아래 [전체 보기]로 매물·예약 화면을 연다 */
function SlotArea({
  title,
  empty,
  allHref,
  more,
  children,
}: {
  title: string;
  empty: string;
  allHref: string;
  /** 보여 준 줄보다 더 있는지(전체 보기 문구에 "더 있어요"를 붙인다) */
  more: boolean;
  children: ReactNode[];
}) {
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <p className="font-medium">{title}</p>
      {children.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <SelectableRows as="ul" className="flex flex-col divide-y">
          {children}
        </SelectableRows>
      )}
      <Link href={allHref} className="w-fit text-primary hover:underline">
        {more ? '전체 보기(더 있어요)' : '전체 보기'}
      </Link>
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

function Fields({ rows }: { rows: [string, ReactNode][] }) {
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
