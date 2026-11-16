'use client';

// 대시보드 목록의 줄들 (O9, S-401). 매물 한 줄(SlotRow)과 맨 위 "처리 필요" 카드(NeedsVisitCard).
// 탭·필터·마감 확인 창은 owner-dashboard.tsx가 갖고, 여기는 받은 매물을 그리기만 한다.
// 줄마다 지금 상태로 버튼을 고른다: 판매 전은 [수정]·[마감](O10), 시작 전 취소 매물은 [재등록](O13).
// 결제 중(홀딩)이면 [수정]·[마감]을 잠근다.
// 예약이 있는 줄(예약됨·완료·취소, "처리 필요")은 [상세] 버튼 없이 줄을 두 번 누르거나 Enter로 예약 상세(O11)를 연다
// (11/16 정민석, 공통 UI SelectableRow). 한 번 누르면 그 줄이 연한 초록으로 골라진다. 줄 안의 버튼을 두 번 눌러도 상세로 가지 않는다.
// 시간대 매물(#308)은 WindowRow가 그린다: 시간·서비스·최대 할인율·상태와 [마감]. 시간대 안에서 손님이 만든 매물(windowId)은
// "시간대 예약"으로 표시하고, 원장님이 올린 매물이 아니라서 [수정]·[마감]·[재등록]을 두지 않는다(취소되면 그 시간은 시간대에 저절로 다시 열린다).
// 손님이 아직 결제 중인 시간대 칸은 매물 줄로 나오지 않는다(ownerListedSlot). 마감한 시간대에 그런 칸이 남아 있으면
// 시간대 줄에 마감 창과 같은 안내(keptSlotsNotice)를 붙인다(WINDOW-06).

import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { formatReservationCode } from '@/components/ui/reservation-code';
import { SelectableRow, SelectableRows } from '@/components/ui/selectable-rows';
import { SlotBadges, type SlotBadgeKind } from '@/components/ui/slot-badge';
import type { SlotStatus } from '@/features/slot-status/slot-status';
import { formatEndTime, formatKst } from '@/lib/time';
import type { VisitResult } from '@/server/visits/types';

import { VISIT_ACTIONS } from '../reservations/reservation-detail';
import { canRelist } from '../slots/relist';
import { SLOT_CLOSE_REASON_LABELS } from '../slots/slot-edit';
import { SLOT_STATUS_STYLE } from '../status-style';
import {
  type DashboardSlot,
  type DashboardWindow,
  keptSlotsNotice,
  onHold,
  ROW_DETAIL_HINT,
  rowDetailHref,
  SLOT_STATUS_LABELS,
  viewStatus,
  WINDOW_VIEW_STATUS,
} from './dashboard';

/** 매물 한 줄: 시간, 메뉴·가격·배지, 상태와 덧붙임(게시 시각·예약번호·마감 사유·재등록함), 버튼 */
export function SlotRow({
  slot,
  now,
  onClose,
}: {
  slot: DashboardSlot;
  now: Date;
  onClose: (slot: DashboardSlot) => void;
}) {
  const status = viewStatus(slot, now);
  // 판매 전(게시예정·게시중)만 고치거나 마감할 수 있고, 결제 중이면 잠근다(O1 canEditSlot과 같은 기준).
  // 시간대 안에서 손님이 만든 매물은 원장님이 올린 매물이 아니라서 고치거나 마감하지 않는다
  const inWindow = slot.windowId !== null;
  const beforeSale = (status === 'scheduled' || status === 'published') && !inWindow;
  const held = beforeSale && onHold(slot, now);
  const badges: SlotBadgeKind[] = [];
  if (slot.newCustomerOnly) badges.push('newCustomerOnly');
  if (held) badges.push('onHold');
  const detailHref = rowDetailHref(slot);

  return (
    <SelectableRow
      as="li"
      id={slot.id}
      href={detailHref}
      title={detailHref ? ROW_DETAIL_HINT : undefined}
      className="flex items-center gap-4 px-4 py-3"
    >
      <DetailHint href={detailHref} />
      <div className="w-36 shrink-0 text-sm">
        <p className="font-semibold">{formatKst(new Date(slot.startAt))}</p>
        <p className="text-muted-foreground">~ {formatEndTime(slot.startAt, slot.endAt)}</p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium">{slot.menuName}</span>
        <Price
          listPrice={slot.listPrice}
          salePrice={slot.salePrice}
          discountRate={slot.discountRate}
          size="sm"
        />
        <SlotBadges kinds={badges} />
      </div>
      <div className="flex flex-col items-end gap-1">
        <StatusBadge status={status} />
        {/* 미리 올린 매물(S-205)은 언제 고객에게 보이기 시작하는지 */}
        {status === 'scheduled' ? (
          <span className="text-xs text-muted-foreground">
            {formatKst(new Date(slot.publishAt))} 게시
          </span>
        ) : null}
        {slot.reservationCode ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            예약번호 {formatReservationCode(slot.reservationCode)}
          </span>
        ) : null}
        {status === 'closed' && slot.closeReason ? (
          <span className="text-xs text-muted-foreground">
            {SLOT_CLOSE_REASON_LABELS[slot.closeReason]}
          </span>
        ) : null}
        {slot.relistedSlotId ? (
          <span className="text-xs text-muted-foreground">재등록함</span>
        ) : null}
        {inWindow ? <span className="text-xs text-muted-foreground">시간대 예약</span> : null}
      </div>
      {/* 버튼이 없는 줄도 같은 폭을 비워 상태 배지 줄을 맞춘다. 판매 전 매물은 [수정]·[마감] 두 개라 폭을 넉넉히 */}
      <div className="flex w-36 shrink-0 justify-end gap-1">
        <SlotActions
          slot={slot}
          beforeSale={beforeSale}
          held={held}
          relistable={
            !inWindow &&
            canRelist(
              {
                status: slot.status,
                startAt: new Date(slot.startAt),
                relistedSlotId: slot.relistedSlotId,
              },
              now,
            )
          }
          onClose={onClose}
        />
      </div>
    </SelectableRow>
  );
}

/**
 * 매물 줄의 버튼. 판매 전이면 [수정]·[마감](결제 중이면 둘 다 잠금), 다시 올릴 수 있는 취소 매물이면 [재등록].
 * 예약 상세는 버튼 없이 줄을 두 번 눌러 연다. 잠긴 [수정]은 링크가 아니라 누를 수 없는 버튼으로 그린다(링크는 잠글 수 없다)
 */
function SlotActions({
  slot,
  beforeSale,
  held,
  relistable,
  onClose,
}: {
  slot: DashboardSlot;
  beforeSale: boolean;
  held: boolean;
  relistable: boolean;
  onClose: (slot: DashboardSlot) => void;
}) {
  return (
    <>
      {beforeSale ? (
        <>
          {held ? (
            <Button type="button" variant="outline" disabled>
              수정
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={`/owner/slots/${slot.id}/edit`}>수정</Link>
            </Button>
          )}
          <Button type="button" variant="outline" disabled={held} onClick={() => onClose(slot)}>
            마감
          </Button>
        </>
      ) : null}
      {relistable ? (
        <Button asChild variant="outline">
          <Link href={`/owner/slots/${slot.id}/relist`}>재등록</Link>
        </Button>
      ) : null}
    </>
  );
}

/** 시간대 서비스 요약. 예: "커트", "커트 외 2개" */
function windowMenuSummary(menus: DashboardWindow['menus']): string {
  if (menus.length === 0) return '서비스 없음';
  return menus.length === 1 ? menus[0].name : `${menus[0].name} 외 ${menus.length - 1}개`;
}

/**
 * 시간대 매물 한 줄(#308): 시간, "시간대 매물" 표시·서비스·최대 할인율(서비스별 할인율), 상태와 덧붙임(게시 시각·마감 사유), [마감].
 * 상태는 서버가 화면을 열 때 계산한 값이다. 남은 시간에 들어가는 서비스가 없으면(full) 게시중으로 두고 고객 목록에서 내려갔다고 알려 준다.
 * 안에서 들어온 예약은 매물 줄("시간대 예약")로 따로 나온다. 마감했는데 손님이 결제 중이라 남긴 칸이 있으면 그 안내를 붙인다
 */
export function WindowRow({
  window,
  onClose,
}: {
  window: DashboardWindow;
  onClose: (window: DashboardWindow) => void;
}) {
  const status = WINDOW_VIEW_STATUS[window.state];
  const maxRate = Math.max(0, ...window.menus.map((menu) => menu.discountRate));
  const keptNotice = keptSlotsNotice(window.keptSlots);
  // 시간대 줄은 열 상세가 없어서 고르기만 된다(같은 목록의 매물 줄과 똑같이 골라진다)
  return (
    <SelectableRow as="li" id={window.id} className="flex items-center gap-4 px-4 py-3">
      <div className="w-36 shrink-0 text-sm">
        <p className="font-semibold">{formatKst(new Date(window.startAt))}</p>
        <p className="text-muted-foreground">~ {formatEndTime(window.startAt, window.endAt)}</p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary" className="shrink-0 bg-accent text-accent-foreground">
            시간대 매물
          </Badge>
          <span className="truncate font-medium">{windowMenuSummary(window.menus)}</span>
        </span>
        <span className="text-sm">
          <span className="font-bold text-sale">최대 {maxRate}%</span>{' '}
          <span className="text-muted-foreground">
            {window.menus.map((menu) => `${menu.name} ${menu.discountRate}%`).join(' · ')}
          </span>
        </span>
        {window.state === 'full' ? (
          <span className="text-xs text-muted-foreground">
            남은 시간에 들어가는 서비스가 없어 고객 목록에서 내려갔어요
          </span>
        ) : null}
        {keptNotice ? <span className="text-xs text-warning-foreground">{keptNotice}</span> : null}
        <SlotBadges kinds={window.newCustomerOnly ? ['newCustomerOnly'] : []} />
      </div>
      <div className="flex flex-col items-end gap-1">
        <StatusBadge status={status} />
        {window.state === 'scheduled' ? (
          <span className="text-xs text-muted-foreground">
            {formatKst(new Date(window.publishAt))} 게시
          </span>
        ) : null}
        {window.state === 'closed' && window.closeReason ? (
          <span className="text-xs text-muted-foreground">
            {SLOT_CLOSE_REASON_LABELS[window.closeReason]}
          </span>
        ) : null}
      </div>
      <div className="flex w-36 shrink-0 justify-end gap-1">
        {window.state === 'closed' ? null : (
          <Button type="button" variant="outline" onClick={() => onClose(window)}>
            마감
          </Button>
        )}
      </div>
    </SelectableRow>
  );
}

/**
 * 맨 위 "처리 필요"(#21 Q12). 자동으로 처리하지 않아서 처리할 때까지 계속 보인다.
 * 줄에서 바로 [방문 완료]·[노쇼]를 누를 수 있다(#23 B1). 누르면 대시보드의 확인 창(onVisit)이 열리고,
 * 거기서 한 번 더 눌러야 처리된다. 줄을 두 번 누르거나 Enter를 누르면 예약 상세(O11)로 간다(11/16 정민석)
 */
export function NeedsVisitCard({
  slots,
  onVisit,
}: {
  slots: DashboardSlot[];
  onVisit: (slot: DashboardSlot, result: VisitResult) => void;
}) {
  return (
    <Card className="border-warning/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="size-5 text-warning-foreground" aria-hidden />
          처리 필요 {slots.length}건
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          서비스 시작이 지났는데 방문 완료·노쇼를 아직 처리하지 않은 예약이에요. 처리해야 정산이
          진행돼요.
        </p>
      </CardHeader>
      <CardContent className="py-0">
        <SelectableRows as="ul" className="-mx-2 divide-y">
          {slots.map((slot) => (
            <SelectableRow
              as="li"
              key={slot.id}
              id={slot.id}
              href={rowDetailHref(slot)}
              title={ROW_DETAIL_HINT}
              className="flex items-center gap-4 px-2 py-2 text-sm"
            >
              <DetailHint href={rowDetailHref(slot)} />
              <span className="w-36 shrink-0 font-medium">{formatKst(new Date(slot.startAt))}</span>
              <span className="min-w-0 flex-1 truncate">{slot.menuName}</span>
              {slot.reservationCode ? (
                <span className="text-muted-foreground tabular-nums">
                  예약번호 {formatReservationCode(slot.reservationCode)}
                </span>
              ) : null}
              {slot.reservationId ? (
                <div className="flex shrink-0 gap-1">
                  <Button type="button" onClick={() => onVisit(slot, 'visited')}>
                    {VISIT_ACTIONS.visited.button}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => onVisit(slot, 'no_show')}
                  >
                    {VISIT_ACTIONS.no_show.button}
                  </Button>
                </div>
              ) : null}
            </SelectableRow>
          ))}
        </SelectableRows>
      </CardContent>
    </Card>
  );
}

/**
 * 화면 읽기 프로그램용 안내. [상세] 버튼이 없어서, 예약이 있는 줄에 가면 Enter로 예약 상세를 연다고 읽어 준다.
 * 마우스로 쓰는 사람에게는 줄의 title(ROW_DETAIL_HINT)이 같은 일을 한다
 */
function DetailHint({ href }: { href: string | null }) {
  return href ? <span className="sr-only">Enter를 누르면 예약 상세가 열려요.</span> : null;
}

/** 화면 상태(viewStatus) 배지. 같은 이름 6개(X-301)만 쓴다 */
function StatusBadge({ status }: { status: SlotStatus }) {
  return <Badge className={SLOT_STATUS_STYLE[status]}>{SLOT_STATUS_LABELS[status]}</Badge>;
}
