'use client';

// 시간대 매물 등록 (#308, S-201 두 번째 방식). ① 날짜·시간대 → ② 서비스(여러 개) → ③ 할인율 → ④ 확인·등록.
// ① 날짜는 한 시술 매물과 같은 등록 달력을 쓰고, 날짜를 고르면 그 날 시간표를 드래그로 고른다(window-timetable.tsx).
// 한 번에 하루만 올린다(11/11 정민석). 다른 날짜를 고르면 고른 칸을 비운다.
// 새벽까지 여는 샵은 그 날 영업이 다음 날 새벽까지 이어진 칸도 이 날 시간표 아래에 붙는다(window-cells.ts).
// 처음 열 때 그 샵이 마지막으로 올린 시간대의 서비스·할인율·신규 고객 전용을 채운다(getLastWindowSettings, #308).
// ②③④ 카드와 완료 카드는 window-steps.tsx, 계산은 window-draft.ts가 맡는다.
// [등록하기]는 강규민 createSlotWindows로 저장한다. 서버가 시각·영업시간·겹침·메뉴·할인율을 다시 확인하고 할인가를 계산한다.

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { BusinessHours } from '@/db/schema/shops';
import { kstDateKey } from '@/lib/time';
import { ADVANCE_LISTING_DAYS, type DiscountRate, PUBLISH_WINDOW_HOURS } from '@/server/policy';
import { createSlotWindows } from '@/server/slot-windows/actions';
import type { LastWindowSettings } from '@/server/slot-windows/types';

import { weekdayOfKey } from '../calendar-days';
import { dateKeyLabel, SlotDateCalendar } from '../slot-date-calendar';
import type { SlotMenuOption } from '../slot-form';
import { canOpenStep, StepNav } from '../slot-form-steps';
import { groupByKstDate, startCandidates } from '../slot-time';
import { dayCells, daySpans, rangesSummary, selectedRanges, spanLabel } from './window-cells';
import { applyRateToAll, fittingMenuIds, prefillFromLast, windowDraftInput } from './window-draft';
import {
  ConfirmStep,
  RatesStep,
  type SavedWindows,
  SavedWindowsCard,
  ServicesStep,
} from './window-steps';
import { WindowTimetable } from './window-timetable';

type WindowStep = 1 | 2 | 3 | 4;

const WINDOW_STEPS = ['시간', '서비스', '할인율', '확인'] as const;

export function WindowForm({
  shopId,
  nowIso,
  businessHours,
  menus,
  busy,
  lastSettings,
}: {
  shopId: string;
  nowIso: string;
  /** 샵 영업시간(O2). 입력하지 않은 요일은 하루 전체를 보여준다 */
  businessHours: BusinessHours;
  /** 고를 수 있는 메뉴: 숨기지 않았고 지금 업종의 서비스 종류 */
  menus: SlotMenuOption[];
  /** 같은 샵의 이미 올린 매물·시간대 시간(ISO). 그 칸은 잠근다 */
  busy: { start: string; end: string }[];
  /** 그 샵이 마지막으로 올린 시간대의 서비스·할인율. 올린 적 없으면 null */
  lastSettings: LastWindowSettings | null;
}) {
  const router = useRouter();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const busyRanges = useMemo(
    () => busy.map((range) => ({ start: new Date(range.start), end: new Date(range.end) })),
    [busy],
  );
  const days = useMemo(() => groupByKstDate(startCandidates(now)), [now]);
  const [prefill] = useState(() => prefillFromLast(lastSettings, menus));

  const [step, setStep] = useState<WindowStep>(1);
  const [dateKey, setDateKey] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  // ② 고른 서비스(메뉴 id). 시간을 줄여서 안 들어가게 된 서비스는 남겨 두되 고른 것으로 보지 않는다(fittingMenuIds)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(prefill.chosen);
  const [rates, setRates] = useState<Record<string, DiscountRate>>(prefill.rates);
  const [newCustomerOnly, setNewCustomerOnly] = useState(prefill.newCustomerOnly);
  // 지난번 설정을 채워 열었는지(② 안내). 하나 더 올릴 때는 지금 값을 그대로 쓰므로 끈다
  const [prefilled, setPrefilled] = useState(prefill.chosen.size > 0);
  const [saved, setSaved] = useState<SavedWindows | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const cells = useMemo(
    () => (dateKey ? dayCells(dateKey, businessHours, now, busyRanges) : []),
    [dateKey, businessHours, now, busyRanges],
  );
  const ranges = useMemo(() => selectedRanges(cells, selected), [cells, selected]);
  const summary = rangesSummary(ranges, dateKey);
  const menuIds = fittingMenuIds(menus, chosen, ranges);
  const chosenMenus = menus.filter((item) => menuIds.includes(item.id));
  const input = windowDraftInput(ranges, menuIds, rates, newCustomerOnly);

  // 고른 단계. 앞 단계를 다 골라야 다음 단계 버튼을 누를 수 있다. ④ 확인은 등록해야 끝나서 ✓를 붙이지 않는다
  const stepDone: Record<WindowStep, boolean> = {
    1: ranges.length > 0,
    2: ranges.length > 0 && menuIds.length > 0,
    3: input !== null,
    4: false,
  };

  function goTo(target: WindowStep) {
    if (!canOpenStep(target, stepDone) || target === step) return;
    setMessage(null);
    setStep(target);
  }

  /** 날짜를 바꾸면 고른 칸을 비운다(한 번에 하루만 올린다) */
  function chooseDate(key: string) {
    if (key === dateKey) return;
    setDateKey(key);
    setSelected(new Set());
  }

  function toggleMenu(menuId: string) {
    const next = new Set(chosen);
    if (next.has(menuId)) next.delete(menuId);
    else next.add(menuId);
    setChosen(next);
    setMessage(null);
  }

  /** ④ [등록하기]. 서버가 다시 확인하고 저장한다. 실패하면 서버 문구를 그대로 보여준다 */
  function submit() {
    if (!input) return;
    setMessage(null);
    startTransition(async () => {
      const result = await createSlotWindows(shopId, input);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      setSaved({
        dateKey,
        windows: result.data.windows,
        menus: chosenMenus.map((item) => ({
          menuId: item.id,
          name: item.name,
          discountRate: rates[item.id],
        })),
        newCustomerOnly,
      });
      // 방금 올린 시간을 ① 시간표에서 잠그도록 이미 올린 시간(busy)을 다시 읽는다. 고른 값(상태)은 그대로 남는다
      router.refresh();
    });
  }

  /** 완료 카드에서 하나 더 올리기. 서비스·할인율·신규 고객 전용은 남기고 ① 날짜·시간부터 다시 고른다 */
  function startOver() {
    setSaved(null);
    setDateKey('');
    setSelected(new Set());
    setPrefilled(false);
    setMessage(null);
    setStep(1);
  }

  if (saved) return <SavedWindowsCard saved={saved} onAgain={startOver} />;

  return (
    <div className="flex flex-col gap-4">
      <StepNav labels={WINDOW_STEPS} step={step} done={stepDone} pending={pending} onGoTo={goTo} />

      {step === 1 ? (
        <TimeCard
          now={now}
          days={days}
          dateKey={dateKey}
          businessHours={businessHours}
          cells={cells}
          selected={selected}
          summary={summary}
          onChooseDate={chooseDate}
          onChangeSelected={setSelected}
        />
      ) : null}

      {step === 2 ? (
        <ServicesStep
          menus={menus}
          ranges={ranges}
          dateKey={dateKey}
          chosenIds={menuIds}
          prefilled={prefilled}
          onToggle={toggleMenu}
        />
      ) : null}

      {step === 3 ? (
        <RatesStep
          menus={chosenMenus}
          rates={rates}
          newCustomerOnly={newCustomerOnly}
          onRateAll={(rate) => setRates(applyRateToAll(rates, menuIds, rate))}
          onRate={(menuId, rate) => setRates({ ...rates, [menuId]: rate })}
          onChangeNewCustomerOnly={setNewCustomerOnly}
        />
      ) : null}

      {step === 4 ? (
        <ConfirmStep
          dateKey={dateKey}
          ranges={ranges}
          menus={chosenMenus}
          rates={rates}
          newCustomerOnly={newCustomerOnly}
          now={now}
        />
      ) : null}

      {step > 1 && summary ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm">
          <span>
            <strong>{dateKeyLabel(dateKey)}</strong> {summary}
          </span>
          <span className="text-muted-foreground">
            {chosenMenus.length > 0
              ? `서비스 ${chosenMenus.length}개: ${chosenMenus.map((item) => item.name).join(', ')}`
              : '서비스를 골라 주세요'}
          </span>
        </div>
      ) : null}

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        {step > 1 ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => goTo((step - 1) as WindowStep)}
          >
            이전
          </Button>
        ) : null}
        {step < 4 ? (
          <Button
            type="button"
            size="lg"
            disabled={!stepDone[step]}
            onClick={() => goTo((step + 1) as WindowStep)}
          >
            다음
          </Button>
        ) : (
          <Button type="button" size="lg" disabled={!input || pending} onClick={submit}>
            {pending ? '등록 중…' : '등록하기'}
          </Button>
        )}
      </div>
    </div>
  );
}

/** ① 날짜와 시간대: 달력에서 날짜를 고르면 그 날 시간표를 드래그로 고른다 */
function TimeCard({
  now,
  days,
  dateKey,
  businessHours,
  cells,
  selected,
  summary,
  onChooseDate,
  onChangeSelected,
}: {
  now: Date;
  days: ReturnType<typeof groupByKstDate>;
  dateKey: string;
  businessHours: BusinessHours;
  cells: ReturnType<typeof dayCells>;
  selected: ReadonlySet<number>;
  summary: string | null;
  onChooseDate: (key: string) => void;
  onChangeSelected: (next: ReadonlySet<number>) => void;
}) {
  const spans = dateKey ? daySpans(dateKey, businessHours) : [];
  // 그 요일 영업시간을 입력했는지(안 했으면 하루 전체를 보여준다)
  const hoursEntered =
    dateKey !== '' && businessHours.some((item) => item.weekday === weekdayOfKey(dateKey));
  const noOpenCell = cells.every((cell) => cell.lock !== null);

  return (
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
          onChoose={onChooseDate}
        />
        {dateKey ? (
          <section aria-label="시간대" className="flex flex-col gap-3 border-t pt-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{dateKeyLabel(dateKey)} 시간대</h3>
              <p className="text-xs text-muted-foreground">
                {hoursEntered
                  ? `매장 설정의 영업시간(${spans.map(spanLabel).join(', ') || '쉬는 날'}) 안에서 골라요.`
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
                    onClick={() => onChangeSelected(new Set())}
                  >
                    모두 지우기
                  </Button>
                </div>
                <p className="text-sm font-medium">드래그해서 원하는 시간들을 선택해 주세요</p>
                <WindowTimetable
                  dateKey={dateKey}
                  cells={cells}
                  selected={selected}
                  onChange={onChangeSelected}
                />
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
  );
}
