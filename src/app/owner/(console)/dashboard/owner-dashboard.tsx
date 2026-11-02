'use client';

// 원장님 대시보드 (O9, S-401, #21 Q12). 맨 위 "처리 필요", 오늘/예정 탭, 상태 필터, 매물 목록. PC 기준.
// 판매 전 매물은 목록에서 [수정]·[마감](O10, S-206). 결제 중(홀딩)이면 버튼을 잠근다("다른 고객이 결제 중" 배지가 같이 보인다).
// 버튼은 글자만 쓰고 [수정]·[마감] 둘 다 테두리 버튼이다.
// 예약이 있는 매물(예약됨·완료·취소)은 [상세], "처리 필요" 줄은 [처리하기]로 예약 상세(O11)에 간다.
// 방문 완료·노쇼(O14)는 예약 상세에서 처리한다. 시작 전 '취소' 매물은 [재등록](O13, S-408)으로 같은 조건의 새 매물을 올리고,
// 재등록한 매물에는 "재등록함"을 보여준다.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from 'cn';
import { ClipboardCheck, SquarePlus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { SlotBadges, type SlotBadgeKind } from '@/components/ui/slot-badge';
import { EmptyState } from '@/components/ui/state';
import { formatKst, formatKstTime } from '@/lib/time';

import {
  countByStatus,
  DASHBOARD_STATUSES,
  type DashboardSlot,
  type DashboardTab,
  onHold,
  SLOT_STATUS_LABELS,
  splitByDay,
  viewStatus,
} from './dashboard';
import type { SlotStatus } from '@/features/slot-status/slot-status';

import { canRelist } from '../slots/relist';
import { SLOT_CLOSE_REASON_LABELS } from '../slots/slot-edit';
import { CloseSlotDialog } from './close-slot-dialog';

const TAB_LABELS: Record<DashboardTab, string> = { today: '오늘', upcoming: '예정' };

/** 상태 배지 색. 판매 중·예약은 눈에 띄게, 끝난 것은 흐리게 */
const STATUS_STYLE: Record<SlotStatus, string> = {
  scheduled: 'border-border bg-background text-foreground',
  published: 'bg-primary/15 text-primary',
  reserved: 'bg-accent text-accent-foreground',
  closed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
  completed: 'border-border bg-background text-muted-foreground',
};

export function OwnerDashboard({
  shopId,
  nowIso,
  slots,
  needsVisit,
}: {
  shopId: string;
  nowIso: string;
  /** 오늘 0시 이후에 시작하는 매물 */
  slots: DashboardSlot[];
  /** 시작이 지났는데 방문·노쇼를 처리하지 않은 예약 */
  needsVisit: DashboardSlot[];
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const byDay = useMemo(() => splitByDay(slots, now), [slots, now]);
  const [tab, setTab] = useState<DashboardTab>('today');
  const [status, setStatus] = useState<SlotStatus | 'all'>('all');
  // [마감]을 누른 매물(확인 창)
  const [closing, setClosing] = useState<DashboardSlot | null>(null);

  const inTab = byDay[tab];
  const counts = useMemo(() => countByStatus(inTab, now), [inTab, now]);
  const shown = status === 'all' ? inTab : inTab.filter((slot) => viewStatus(slot, now) === status);

  return (
    <div className="flex flex-col gap-4">
      {needsVisit.length > 0 ? <NeedsVisitCard slots={needsVisit} /> : null}

      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2" role="tablist" aria-label="날짜">
          {(Object.keys(TAB_LABELS) as DashboardTab[]).map((key) => (
            <Button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              variant={tab === key ? 'default' : 'outline'}
              onClick={() => {
                setTab(key);
                setStatus('all');
              }}
            >
              {TAB_LABELS[key]} {byDay[key].length}
            </Button>
          ))}
        </div>
        <Button asChild size="lg">
          <Link href="/owner/slots/new">
            <SquarePlus aria-hidden />
            매물 등록
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="상태">
        <FilterChip active={status === 'all'} onClick={() => setStatus('all')}>
          전체 {inTab.length}
        </FilterChip>
        {DASHBOARD_STATUSES.map((key) => (
          <FilterChip
            key={key}
            active={status === key}
            disabled={counts[key] === 0}
            onClick={() => setStatus(key)}
          >
            {SLOT_STATUS_LABELS[key]} {counts[key]}
          </FilterChip>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card>
          <EmptyState
            title={
              inTab.length === 0
                ? `${TAB_LABELS[tab]} 시작하는 매물이 없어요`
                : `${SLOT_STATUS_LABELS[status as SlotStatus]} 매물이 없어요`
            }
            description="매물은 서비스 시작 48시간 전부터 올릴 수 있어요"
            action={
              <Button asChild variant="outline">
                <Link href="/owner/slots/new">매물 등록하기</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <ul className="divide-y">
            {shown.map((slot) => (
              <SlotRow key={slot.id} slot={slot} now={now} onClose={setClosing} />
            ))}
          </ul>
        </Card>
      )}

      <CloseSlotDialog shopId={shopId} slot={closing} onDone={() => setClosing(null)} />
    </div>
  );
}

function SlotRow({
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
  const relistable = canRelist(
    { status: slot.status, startAt: new Date(slot.startAt), relistedSlotId: slot.relistedSlotId },
    now,
  );
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
      </div>
    </li>
  );
}

/** 맨 위 "처리 필요"(#21 Q12). 자동으로 처리하지 않아서 처리할 때까지 계속 보인다 */
function NeedsVisitCard({ slots }: { slots: DashboardSlot[] }) {
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

function StatusBadge({ status }: { status: SlotStatus }) {
  return <Badge className={STATUS_STYLE[status]}>{SLOT_STATUS_LABELS[status]}</Badge>;
}

function FilterChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'border-primary bg-primary/10 font-semibold text-primary'
          : 'bg-card hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
