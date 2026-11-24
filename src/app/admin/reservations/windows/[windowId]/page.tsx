import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BackButton } from '@/components/ui/back-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatReservationCode } from '@/components/ui/reservation-code';
import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import {
  getSlotStatus,
  isSlotOnHold,
  SLOT_STATUS_LABELS,
} from '@/features/slot-status/slot-status';
import { formatDuration, formatWon } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { formatEndTime, formatKst, formatKstDateTime, formatKstTime } from '@/lib/time';
import { isUuid } from '@/lib/uuid';
import { FALLBACK_ADMIN_NAME } from '@/server/admin/admin-name';
import { ensureAdminPage } from '@/server/auth';
import { serviceTypeLabel } from '@/server/policy/catalog';

import { labelReservation } from '../../../lookup';
import { ACTION_LABELS, labelOf } from '../../../logs/format';
import { SlotControlAction } from '../../../shops/slot-control-actions';
import {
  canForceCloseWindow,
  labelSlotCloseReason,
  lookupHref,
  slotDetailHref,
  WINDOW_STATE_LABELS,
} from '../../format';
import { type AdminWindowDetail, selectAdminWindowDetail } from '../../window-queries';

export const metadata: Metadata = { title: '시간대 매물 정보' };

type Params = Promise<{ windowId: string }>;

// 시간대 매물 상세 (#567 2번, A-103). 주소: /admin/reservations/windows/[windowId].
// [시간대 매물] 탭과 샵 상세 '매물 관리'에서 줄을 두 번 누르거나 [상세]를 누르면 열린다. 시간대 내용과 상태, 올린 서비스,
// 손님이 만든 칸과 예약, 운영자 처리 기록을 본다. 마감하지 않았고 끝나지 않았으면 여기서도 강제 마감한다(#373 ④).
// 고객 정보는 보여 주지 않아서 열람 기록은 남기지 않는다(예약은 예약 상세에서 본다)
export default function AdminWindowPage({ params }: { params: Params }) {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref={lookupHref({ tab: 'windows' })} />
        <h1 className="text-xl font-bold">시간대 매물 정보</h1>
      </div>
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: Params }) {
  await ensureAdminPage();
  const { windowId } = await params;
  if (!isUuid(windowId)) notFound();
  const now = await getRequestNow();
  const window = await selectAdminWindowDetail(getDb(), { windowId, now });
  if (!window) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">
              {formatKst(window.startAt)}~{formatEndTime(window.startAt, window.endAt)}
            </CardTitle>
            <Badge variant="secondary">{WINDOW_STATE_LABELS[window.state]}</Badge>
            {canForceCloseWindow(window.state) ? (
              <div className="ml-auto">
                <SlotControlAction
                  target={{ kind: 'close_window', windowId: window.windowId }}
                  size="sm"
                />
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
            <Field label="샵">
              <Link href={`/admin/shops/${window.shopId}`} className="hover:underline">
                {window.shopName}
              </Link>
            </Field>
            <Field label="신규 고객 전용">{window.newCustomerOnly ? '예' : '아니요'}</Field>
            <Field label="등록한 시각">{formatKstDateTime(window.createdAt)}</Field>
            <Field label="게시 시각">{formatKstDateTime(window.publishAt)}</Field>
            {window.closedAt || window.closeReason ? (
              <>
                <Field label="마감 시각">
                  {window.closedAt ? formatKstDateTime(window.closedAt) : '-'}
                </Field>
                <Field label="마감 사유">{labelSlotCloseReason(window.closeReason)}</Field>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <MenusCard menus={window.menus} />
      <CellsCard cells={window.cells} now={now} />
      <AdminActionsCard actions={window.adminActions} />
    </div>
  );
}

function MenusCard({ menus }: { menus: AdminWindowDetail['menus'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>올린 서비스</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {menus.length === 0 ? (
          <p className="text-muted-foreground">올린 서비스가 없어요</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem]">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-2 font-medium">서비스</th>
                  <th className="px-2 py-2 font-medium">종류</th>
                  <th className="px-2 py-2 font-medium">소요 시간</th>
                  <th className="px-2 py-2 font-medium">정가</th>
                  <th className="px-2 py-2 font-medium">할인</th>
                  <th className="px-2 py-2 font-medium">판매가</th>
                </tr>
              </thead>
              <tbody>
                {menus.map((menu) => (
                  <tr key={menu.menuId} className="border-b last:border-0">
                    <td className="px-2 py-2 font-medium">{menu.name}</td>
                    <td className="px-2 py-2">{serviceTypeLabel(menu.serviceType)}</td>
                    <td className="px-2 py-2">{formatDuration(menu.durationMinutes)}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatWon(menu.listPrice)}</td>
                    <td className="px-2 py-2">{menu.discountRate}%</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatWon(menu.salePrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 손님이 [예약하기]로 만든 칸. 칸은 매물 하나라 매물 상세로, 예약은 예약 상세로 간다 */
function CellsCard({ cells, now }: { cells: AdminWindowDetail['cells']; now: Date }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>손님이 만든 칸과 예약</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {cells.length === 0 ? (
          <p className="text-muted-foreground">이 시간대에서 손님이 만든 칸이 없어요</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {cells.map((cell) => (
              <li key={cell.slotId} className="flex flex-col gap-1 py-2">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={slotDetailHref(cell.slotId)} className="font-medium hover:underline">
                    {formatKstTime(cell.startAt)}~{formatKstTime(cell.endAt)} {cell.menuName}
                  </Link>
                  <Badge variant="secondary">{SLOT_STATUS_LABELS[getSlotStatus(cell, now)]}</Badge>
                  {isSlotOnHold(cell, now) ? <Badge>결제 중</Badge> : null}
                  {cell.closeReason ? (
                    <span className="text-muted-foreground">
                      {labelSlotCloseReason(cell.closeReason)}
                    </span>
                  ) : null}
                </p>
                {cell.reservations.map((reservation) => (
                  <p
                    key={reservation.reservationId}
                    className="flex flex-wrap items-center gap-2 pl-4"
                  >
                    <Link
                      href={`/admin/reservations/${reservation.reservationId}`}
                      className="hover:underline"
                    >
                      예약 {formatReservationCode(reservation.code)}
                    </Link>
                    <Badge variant="secondary">
                      {labelReservation(reservation.status, reservation.visitResult)}
                    </Badge>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AdminActionsCard({ actions }: { actions: AdminWindowDetail['adminActions'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>운영자 처리 기록</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {actions.length === 0 ? (
          <p className="text-muted-foreground">이 시간대에 운영자가 처리한 기록이 없어요</p>
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
