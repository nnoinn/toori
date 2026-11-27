'use client';

// 원장님 화면별 말풍선(S-412, 3단계 3-A). 화면에 처음 들어가면 `data-tour` 칸 옆에 말풍선을 하나씩 띄운다.
// 지금 화면에 보이는 칸만 차례로 보여주고(tours.ts), 설명하는 칸에는 초록 테두리를 두른다.
// [마치기]·[건너뛰기]·Esc·말풍선 밖 누르기로 닫으면 이 화면은 본 것으로 이 브라우저에 남긴다(#618 DB 없음).
// 내 계정의 [사용 안내 다시 보기]로 다시 켠다. PC 기준

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

import { availableSteps, type TourKey, TOURS, type TourStep } from './tours';
import { markTourSeen, useTutorialMemory } from './use-tutorial-memory';

/** 설명하는 칸에 두르는 테두리. 칸이 이미 쓰는 ring과 겹치지 않게 outline을 쓴다 */
const HIGHLIGHT = ['outline-2', 'outline-offset-4', 'outline-primary'];

/** 화면에 보이는 칸. 숨긴 탭 패널 안처럼 보이지 않으면 null */
function findTarget(target: string): HTMLElement | null {
  const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  return element && element.getClientRects().length > 0 ? element : null;
}

type ShownStep = TourStep & { element: HTMLElement };

export function TutorialTour({
  shopId,
  tour,
  active = true,
}: {
  shopId: string;
  tour: TourKey;
  /** 탭처럼 그 화면이 지금 보일 때만 true */
  active?: boolean;
}) {
  const memory = useTutorialMemory(shopId);
  const ready = active && memory !== null && !memory.seenTours.includes(tour);
  // 어느 화면의 말풍선인지 같이 둔다(탭을 바꾼 직후 앞 탭의 칸에 붙지 않게)
  const [shown, setShown] = useState<{ tour: TourKey; steps: ShownStep[] } | null>(null);
  const [index, setIndex] = useState(0);
  const titleId = useId();
  const nextRef = useRef<HTMLButtonElement>(null);

  // 화면이 그려진 뒤 지금 보이는 칸만 고른다
  useEffect(() => {
    if (!ready) return;
    const steps = availableSteps(TOURS[tour], (target) => findTarget(target) !== null).map(
      (step) => ({ ...step, element: findTarget(step.target)! }),
    );
    // 칸은 화면을 그린 뒤에만 찾을 수 있어서 effect 안에서 정한다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShown({ tour, steps });
    setIndex(0);
  }, [ready, tour]);

  const steps = ready && shown?.tour === tour ? shown.steps : [];
  const current = steps[index] ?? null;

  // 설명하는 칸을 화면 가운데로 옮기고 테두리를 두른다
  useEffect(() => {
    const element = current?.element;
    if (!element) return;
    element.classList.add(...HIGHLIGHT);
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return () => element.classList.remove(...HIGHLIGHT);
  }, [current]);

  const anchor = useMemo(() => ({ current: current?.element ?? null }), [current]);

  if (!current) return null;

  const last = index === steps.length - 1;
  const finish = () => markTourSeen(shopId, tour);

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) finish();
      }}
    >
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        side="bottom"
        collisionPadding={16}
        aria-labelledby={titleId}
        className="flex w-80 flex-col gap-2 p-4"
        // 처음에는 [다음]에 둔다(Enter로 이어 보게, [건너뛰기]가 먼저 잡혀 안내를 통째로 넘기지 않게)
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          nextRef.current?.focus();
        }}
      >
        <p className="text-xs text-muted-foreground">
          {index + 1}/{steps.length}
        </p>
        <p id={titleId} className="font-semibold">
          {current.title}
        </p>
        <p className="text-sm">{current.body}</p>
        <div className="mt-1 flex items-center justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={finish}>
            건너뛰기
          </Button>
          <Button
            ref={nextRef}
            type="button"
            size="sm"
            onClick={() => (last ? finish() : setIndex((i) => i + 1))}
          >
            {last ? '마치기' : '다음'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
