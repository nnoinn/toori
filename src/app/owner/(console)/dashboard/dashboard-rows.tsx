'use client';

// 대시보드 목록의 줄들 (O9, S-401). 매물 한 줄(SlotRow)과 맨 위 "처리 필요" 카드(NeedsVisitCard).
// 탭·필터·마감 확인 창은 owner-dashboard.tsx가 갖고, 여기는 받은 매물을 그리기만 한다.
// 줄마다 지금 상태로 버튼을 고른다: 판매 전은 [수정]·[마감](O10), 시작 전 취소 매물은 [재등록](O13),
// 예약이 있는 매물은 [상세](O11). 결제 중(홀딩)이면 [수정]·[마감]을 잠근다.

import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { SlotBadges, type SlotBadgeKind } from '@/components/ui/slot-badge';
import type { SlotStatus } from '@/features/slot-status/slot-status';
import { formatKst, formatKstTime } from '@/lib/time';

import { canRelist } from '../slots/relist';
import { SLOT_CLOSE_REASON_LABELS } from '../slots/slot-edit';
import { type DashboardSlot, onHold, SLOT_STATUS_LABELS, viewStatus } from './dashboard';

/** 상태 배지 색. 판매 중·예약은 눈에 띄게, 끝난 것은 흐리게 */
const STATUS_STYLE: Record<SlotStatus, string> = {
  scheduled: 'border-border bg-background text-foreground',
  published: 'bg-primary/15 text-primary',
  reserved: 'bg-accent text-accent-foreground',
  closed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
  completed: 'border-border bg-background text-muted-foreground',
};

/** 매물 한 줄: 시간, 메뉴·가격·배지, 상태와 덧붙임(예약번호·마감 사유·재등록함), 버튼 */
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
  // 판매 전(예약대기·게시중)만 고치거나 마감할 수 있고, 결제 중이면 잠근다(O1 canEditSlot과 같은 기준)
  const beforeSale = status === 'scheduled' || status === 'published';
  const held = beforeSale && onHold(slot, now);
  const badges: SlotBadgeKind[] = [];
  if (slot.newCustomerOnly) badges.push('newCustomerOnly');
  if (held) badges.push('onHold');

  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <div className="w-36 shrink-0 text-sm">
        <p className="font-semibold">{formatKst(new Date(slot.startAt))}</p>
        <p className="text-muted-foreground">~ {formatKstTime(new Date(slot.endAt))}</p>
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
        {slot.reservationCode ? (
          <span className="text-xs text-muted-foreground">예약번호 {slot.reservationCode}</span>
        ) : null}
        {status === 'closed' && slot.closeReason ? (
          <span className="text-xs text-muted-foreground">
            {SLOT_CLOSE_REASON_LABELS[slot.closeReason]}
          </span>
        ) : null}
        {slot.relistedSlotId ? (
          <span className="text-xs text-muted-foreground">재등록함</span>
        ) : null}
      </div>
      {/* 버튼이 없는 줄도 같은 폭을 비워 상태 배지 줄을 맞춘다. 취소 매물은 [재등록]·[상세] 두 개라 폭을 넉넉히 */}
      <div className="flex w-36 shrink-0 justify-end gap-1">
        <SlotActions
          slot={slot}
          beforeSale={beforeSale}
          held={held}
          relistable={canRelist(
            {
              status: slot.status,
              startAt: new Date(slot.startAt),
              relistedSlotId: slot.relistedSlotId,
            },
            now,
          )}
          onClose={onClose}
        />
      </div>
    </li>
  );
}

/**
 * 매물 줄의 버튼. 판매 전이면 [수정]·[마감](결제 중이면 둘 다 잠금), 다시 올릴 수 있는 취소 매물이면 [재등록],
 * 예약이 있으면 [상세]. 잠긴 [수정]은 링크가 아니라 누를 수 없는 버튼으로 그린다(링크는 잠글 수 없다)
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
      {slot.reservationId ? <DetailButton reservationId={slot.reservationId} /> : null}
    </>
  );
}

/** 맨 위 "처리 필요"(#21 Q12). 자동으로 처리하지 않아서 처리할 때까지 계속 보인다 */
export function NeedsVisitCard({ slots }: { slots: DashboardSlot[] }) {
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
        <ul className="divide-y">
          {slots.map((slot) => (
            <li key={slot.id} className="flex items-center gap-4 py-2 text-sm">
              <span className="w-36 shrink-0 font-medium">{formatKst(new Date(slot.startAt))}</span>
              <span className="min-w-0 flex-1 truncate">{slot.menuName}</span>
              {slot.reservationCode ? (
                <span className="text-muted-foreground">예약번호 {slot.reservationCode}</span>
              ) : null}
              {slot.reservationId ? (
                <DetailButton reservationId={slot.reservationId} label="처리하기" />
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** 예약이 있는 매물(예약됨·완료·취소)에서 예약 상세(O11)로 간다 */
function DetailButton({
  reservationId,
  label = '상세',
}: {
  reservationId: string;
  label?: string;
}) {
  return (
    <Button asChild variant="outline">
      <Link href={`/owner/reservations/${reservationId}`}>{label}</Link>
    </Button>
  );
}

/** 화면 상태(viewStatus) 배지. 같은 이름 6개(X-301)만 쓴다 */
function StatusBadge({ status }: { status: SlotStatus }) {
  return <Badge className={STATUS_STYLE[status]}>{SLOT_STATUS_LABELS[status]}</Badge>;
}
