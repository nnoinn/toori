'use client';

// 원장님 대시보드 (O9, S-401, #21 Q12). 맨 위 "처리 필요", 전체/오늘/예정 탭, 상태 필터, 매물 목록. PC 기준.
// 처음 열면 [전체](#358): 오늘·예정 두 구역을 한 화면에 나눠 구역마다 7개까지 보여주고, 넘으면 [더보기]로 그 탭에 간다.
// [더보기]는 고른 상태 필터를 그대로 두고(11/13 정민석), 탭 버튼을 직접 누르면 필터를 '전체'로 돌린다.
// 판매 전 매물은 목록에서 [수정]·[마감](O10, S-206). 결제 중(홀딩)이면 버튼을 잠근다("다른 고객이 결제 중" 배지가 같이 보인다).
// 버튼은 글자만 쓰고 [수정]·[마감] 둘 다 테두리 버튼이다.
// 예약이 있는 매물(예약됨·완료·취소)과 "처리 필요" 줄은 [상세]로 예약 상세(O11)에 간다.
// 방문 완료·노쇼(O14)는 "처리 필요" 줄에서 바로 누르거나(#23 B1) 예약 상세에서 처리한다. 둘 다 같은 확인 창을 거친다.
// 시작 전 '취소' 매물은 [재등록](O13, S-408)으로 같은 조건의 새 매물을 올리고, 재등록한 매물에는 "재등록함"을 보여준다.
// 이 파일은 탭·필터와 마감·방문 확인 창을 맡고, 매물 줄과 "처리 필요" 카드는 dashboard-rows.tsx가 그린다.
// 확인 창을 줄 안이 아니라 여기 두는 까닭: 처리하거나 그 사이 다른 곳에서 처리되면 그 줄이 사라지는데, 창은 결과 문구를 보여줄 때까지 남아야 한다.

import { useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from 'cn';
import { ChevronRight, SquarePlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/state';
import type { SlotStatus } from '@/features/slot-status/slot-status';
import { ADVANCE_LISTING_DAYS, PUBLISH_WINDOW_HOURS } from '@/server/policy';

import { visitSummary } from '../reservations/reservation-detail';
import { VisitConfirmDialog, type VisitTarget } from '../reservations/visit-confirm-dialog';
import { CloseSlotDialog } from './close-slot-dialog';
import {
  type AllTabSection,
  allTabSections,
  countByStatus,
  DASHBOARD_STATUSES,
  type DashboardDay,
  type DashboardSlot,
  type DashboardTab,
  filterByStatus,
  SLOT_STATUS_LABELS,
  splitByDay,
  type StatusFilter,
} from './dashboard';
import { NeedsVisitCard, SlotRow } from './dashboard-rows';

const TAB_LABELS: Record<DashboardTab, string> = { all: '전체', today: '오늘', upcoming: '예정' };

/** 그 탭(구역)에 매물이 하나도 없을 때 */
const EMPTY_TITLES: Record<DashboardTab, string> = {
  all: '오늘부터 시작하는 매물이 없어요',
  today: '오늘 시작하는 매물이 없어요',
  upcoming: '내일부터 시작하는 매물이 없어요',
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
  const [tab, setTab] = useState<DashboardTab>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  // [마감]을 누른 매물(확인 창)
  const [closing, setClosing] = useState<DashboardSlot | null>(null);
  // "처리 필요" 줄에서 [방문 완료]·[노쇼]를 누른 예약(확인 창)
  const [visiting, setVisiting] = useState<VisitTarget | null>(null);
  // [더보기]로 탭을 바꾸면 그 탭 버튼으로 초점을 옮긴다(목록 아래에서 누르면 화면도 탭 줄로 올라간다)
  const tabButtons = useRef<Partial<Record<DashboardTab, HTMLButtonElement | null>>>({});

  const tabSlots = useMemo<Record<DashboardTab, DashboardSlot[]>>(
    () => ({ all: [...byDay.today, ...byDay.upcoming], ...byDay }),
    [byDay],
  );
  const inTab = tabSlots[tab];
  const counts = useMemo(() => countByStatus(inTab, now), [inTab, now]);
  const shown = filterByStatus(inTab, status, now);

  /** [더보기]: 그 탭으로 가고 상태 필터는 그대로 둔다 */
  const showMore = (day: DashboardDay) => {
    setTab(day);
    tabButtons.current[day]?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      {needsVisit.length > 0 ? (
        <NeedsVisitCard
          slots={needsVisit}
          onVisit={(slot, result) =>
            setVisiting({
              reservationId: slot.reservationId!,
              summary: visitSummary({
                startAt: new Date(slot.startAt),
                menuName: slot.menuName,
                code: slot.reservationCode ?? '',
              }),
              result,
            })
          }
        />
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2" role="tablist" aria-label="날짜">
          {(Object.keys(TAB_LABELS) as DashboardTab[]).map((key) => (
            <Button
              key={key}
              ref={(button) => {
                tabButtons.current[key] = button;
              }}
              type="button"
              role="tab"
              aria-selected={tab === key}
              variant={tab === key ? 'default' : 'outline'}
              onClick={() => {
                setTab(key);
                // 탭마다 있는 상태가 달라서, 탭을 바꾸면 필터를 '전체'로 돌린다
                setStatus('all');
              }}
            >
              {TAB_LABELS[key]} {tabSlots[key].length}
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
                ? EMPTY_TITLES[tab]
                : `${SLOT_STATUS_LABELS[status as SlotStatus]} 매물이 없어요`
            }
            description={`매물은 ${ADVANCE_LISTING_DAYS}일 뒤까지 미리 올릴 수 있어요. 고객에게는 시작 ${PUBLISH_WINDOW_HOURS}시간 전부터 보여요`}
            action={
              <Button asChild variant="outline">
                <Link href="/owner/slots/new">매물 등록하기</Link>
              </Button>
            }
          />
        </Card>
      ) : tab === 'all' ? (
        <div className="flex flex-col gap-6">
          {allTabSections(byDay, status, now).map((section, index) => (
            <AllTabSectionView
              key={section.day}
              section={section}
              status={status}
              divided={index > 0}
              onMore={() => showMore(section.day)}
            >
              {section.shown.map((slot) => (
                <SlotRow key={slot.id} slot={slot} now={now} onClose={setClosing} />
              ))}
            </AllTabSectionView>
          ))}
        </div>
      ) : (
        <SlotList>
          {shown.map((slot) => (
            <SlotRow key={slot.id} slot={slot} now={now} onClose={setClosing} />
          ))}
        </SlotList>
      )}

      <CloseSlotDialog shopId={shopId} slot={closing} onDone={() => setClosing(null)} />
      {/* 처리하면 화면이 새로 고쳐져 그 예약이 "처리 필요"에서 빠진다. 빠졌으면 더는 처리할 수 없다 */}
      <VisitConfirmDialog
        target={visiting}
        canRecord={needsVisit.some((slot) => slot.reservationId === visiting?.reservationId)}
        onDone={() => setVisiting(null)}
      />
    </div>
  );
}

/** 매물 줄 목록 카드 */
function SlotList({ children }: { children: React.ReactNode }) {
  return (
    <Card className="gap-0 py-0">
      <ul className="divide-y">{children}</ul>
    </Card>
  );
}

/**
 * [전체] 탭의 구역 하나(#358): 두 번째 구역부터 위에 구분선, 구역 제목과 (상태 필터로 거른) 개수, 매물 줄(7개까지),
 * 넘으면 [N개 더보기]. 매물이 없는 구역은 한 줄 안내만 보여준다
 */
function AllTabSectionView({
  section,
  status,
  divided,
  onMore,
  children,
}: {
  section: AllTabSection;
  status: StatusFilter;
  divided: boolean;
  onMore: () => void;
  children: React.ReactNode;
}) {
  const titleId = useId();
  const dayLabel = TAB_LABELS[section.day];
  return (
    <section
      aria-labelledby={titleId}
      className={cn('flex flex-col gap-3', divided && 'border-t pt-6')}
    >
      <h2 id={titleId} className="font-semibold">
        {dayLabel} {section.total}
      </h2>
      {section.total === 0 ? (
        <p className="text-sm text-muted-foreground">
          {status === 'all'
            ? EMPTY_TITLES[section.day]
            : `${dayLabel} ${SLOT_STATUS_LABELS[status]} 매물이 없어요`}
        </p>
      ) : (
        <SlotList>{children}</SlotList>
      )}
      {section.more > 0 ? (
        <Button type="button" variant="outline" className="self-center" onClick={onMore}>
          {section.more}개 더보기
          <ChevronRight aria-hidden />
        </Button>
      ) : null}
    </section>
  );
}

/** 상태 필터 칩. 그 탭에 그 상태 매물이 없으면(0개) 잠근다 */
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
