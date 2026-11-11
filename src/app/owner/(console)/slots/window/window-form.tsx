'use client';

// 시간대 매물 등록 (#308, S-201 두 번째 방식). ① 날짜·시간대 → ② 서비스(여러 개) → ③ 할인율 → 확인·등록.
// 지금은 ①까지다. 날짜는 한 시술 매물과 같은 등록 달력을 쓰고, 날짜를 고르면 그 날 시간표를 드래그로 고른다(window-timetable.tsx).
// 한 번에 하루만 올린다(11/11 정민석). 다른 날짜를 고르면 고른 칸을 비운다.
// ②③·확인과 저장(강규민 createSlotWindows)은 다음 PR에서 잇는다. 저장할 때 서버가 시각·영업시간·겹침을 다시 확인한다.

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { BusinessHours } from '@/db/schema/shops';
import { kstDateKey } from '@/lib/time';
import { ADVANCE_LISTING_DAYS, PUBLISH_WINDOW_HOURS } from '@/server/policy';

import { weekdayOfKey } from '../calendar-days';
import { dateKeyLabel, SlotDateCalendar } from '../slot-date-calendar';
import { groupByKstDate, startCandidates } from '../slot-time';
import { dayCells, dayHours, minutesLabel, rangesSummary, selectedRanges } from './window-cells';
import { WindowTimetable } from './window-timetable';

export function WindowForm({
  nowIso,
  businessHours,
  busy,
}: {
  nowIso: string;
  /** 샵 영업시간(O2). 입력하지 않은 요일은 하루 전체를 보여준다 */
  businessHours: BusinessHours;
  /** 같은 샵의 이미 올린 매물·시간대 시간(ISO). 그 칸은 잠근다 */
  busy: { start: string; end: string }[];
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const busyRanges = useMemo(
    () => busy.map((range) => ({ start: new Date(range.start), end: new Date(range.end) })),
    [busy],
  );
  const days = useMemo(() => groupByKstDate(startCandidates(now)), [now]);
  const [dateKey, setDateKey] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());

  const cells = useMemo(
    () => (dateKey ? dayCells(dateKey, businessHours, now, busyRanges) : []),
    [dateKey, businessHours, now, busyRanges],
  );
  const ranges = selectedRanges(cells, selected);
  const summary = rangesSummary(ranges);
  const hours = dateKey ? dayHours(dateKey, businessHours) : null;
  // 그 요일 영업시간을 입력했는지(안 했으면 하루 전체를 보여준다)
  const hoursEntered =
    dateKey !== '' && businessHours.some((item) => item.weekday === weekdayOfKey(dateKey));
  const noOpenCell = cells.every((cell) => cell.lock !== null);

  /** 날짜를 바꾸면 고른 칸을 비운다(한 번에 하루만 올린다) */
  function chooseDate(key: string) {
    if (key === dateKey) return;
    setDateKey(key);
    setSelected(new Set());
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>① 언제 올릴까요?</CardTitle>
          <p className="text-sm text-muted-foreground">
            빈 시간대를 올리면 고객이 그 안에서 원하는 서비스와 시작 시각을 골라요. 지금부터{' '}
            {ADVANCE_LISTING_DAYS}일 안을 올릴 수 있고, 고객에게는 시작 {PUBLISH_WINDOW_HOURS}
            시간 전부터 보여요. 한 번에 하루씩 올려요.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SlotDateCalendar
            todayKey={kstDateKey(now)}
            days={days}
            selectedKey={dateKey || null}
            businessHours={businessHours}
            onChoose={chooseDate}
          />
          {dateKey && hours ? (
            <section aria-label="시간대" className="flex flex-col gap-3 border-t pt-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold">{dateKeyLabel(dateKey)} 시간대</h3>
                <p className="text-xs text-muted-foreground">
                  {hoursEntered
                    ? `매장 설정의 영업시간(${minutesLabel(hours.open)}~${minutesLabel(hours.close)}) 안에서 골라요.`
                    : '영업시간을 입력하지 않은 요일이라 하루 전체를 보여줘요. 매장 설정에서 영업시간을 넣으면 그 시간만 보여요.'}
                </p>
              </div>

              {noOpenCell ? (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  이 날은 올릴 수 있는 시간이 없어요. 다른 날을 골라 주세요.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4 rounded-lg bg-muted p-3 text-sm">
                    <p aria-live="polite">
                      {summary ? (
                        <>
                          고른 시간: <strong>{summary}</strong>
                        </>
                      ) : (
                        '아직 고른 시간이 없어요'
                      )}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!summary}
                      onClick={() => setSelected(new Set())}
                    >
                      모두 지우기
                    </Button>
                  </div>
                  <p className="text-sm font-medium">드래그해서 원하는 시간들을 선택해 주세요</p>
                  <WindowTimetable cells={cells} selected={selected} onChange={setSelected} />
                  <p className="text-xs text-muted-foreground">
                    여러 번 끌어서 점심시간 같은 칸은 빼고 올릴 수 있어요. 켜진 칸을 끌면 꺼져요.
                    이어진 칸 묶음마다 시간대 하나로 올라가고, 고객 예약은 묶음을 넘지 못해요. 회색
                    칸은 지난 시각이거나 이미 올린 매물·시간대와 겹쳐서 고를 수 없어요. 키보드는
                    화살표로 옮기고 Space로 켜고 꺼요(Shift를 누르면 범위).
                  </p>
                </>
              )}
            </section>
          ) : (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              달력에서 날짜를 고르면 그 날의 시간표가 나와요.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        다음 단계 ② 서비스 고르기 → ③ 할인율 → 확인·등록은 준비 중이에요.
      </p>

      <div className="flex justify-end">
        <Button type="button" size="lg" disabled>
          다음
        </Button>
      </div>
    </div>
  );
}
