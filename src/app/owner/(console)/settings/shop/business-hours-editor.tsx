'use client';

// 샵 정보 > 영업시간 칸 (O2, S-103, #311). 요일마다 [쉬는 날]과 여는·닫는 시각을 받는다.
// 시각은 [오전/오후]·[시]·[분] 고르기(공통 UI TimeSelect)라서 여는 시각은 오전, 닫는 시각은 오후가 기본으로 골라져 있다.
// 닫는 시각이 여는 시각과 같거나 빠르면 고르는 즉시 그 줄 아래에 안내하고(hoursOrderProblem), 저장할 때도 막는다.
// 맨 위 "전체 요일" 줄로 쉬는 날이 아닌 요일에 한 번에 넣고, [초기화]로 모든 요일을 비운다(저장을 눌러야 반영된다).
// 값과 저장할 때의 오류는 shop-profile-form.tsx가 갖는다.

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TimeSelect } from '@/components/ui/time-select';
import { SLOT_START_STEP_MINUTES } from '@/server/policy';

import { errorA11y, FieldError } from '../../../form-field';
import {
  type HoursRow,
  hoursOrderProblem,
  type ShopProfileFieldErrors,
  WEEKDAY_LABELS,
} from './shop-profile';

/** 모든 요일을 빈 값(쉬는 날 아님)으로 */
const emptyRows = (hours: HoursRow[]): HoursRow[] =>
  hours.map((row) => ({ weekday: row.weekday, closed: false, open: '', close: '' }));

export function BusinessHoursEditor({
  hours,
  errors,
  onChange,
  onChangeAll,
}: {
  /** 일요일(0)부터 토요일(6)까지 7줄 */
  hours: HoursRow[];
  /** 샵 정보 칸 오류 전체. 이 중 `hours.{줄 번호}`만 쓴다 */
  errors: ShopProfileFieldErrors;
  /** index번째 줄에서 바뀐 값만 넘긴다 */
  onChange: (index: number, row: Partial<HoursRow>) => void;
  /** 7줄을 한 번에 바꾼다(전체 요일에 적용, 초기화) */
  onChangeAll: (rows: HoursRow[]) => void;
}) {
  // [초기화]를 누를 때마다 올려서 시각 칸을 새로 그린다. 칸마다 기억하던 오전·오후도 기본값(여는 오전, 닫는 오후)으로 돌아간다
  const [resetCount, setResetCount] = useState(0);

  function reset() {
    onChangeAll(emptyRows(hours));
    setResetCount((count) => count + 1);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>영업시간</CardTitle>
          <p className="text-sm text-muted-foreground">
            비워 둔 요일은 고객에게 &quot;정보 없음&quot;으로 보여요. 자정을 넘기는 시각은 넣을 수
            없어요.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={reset}>
          초기화
        </Button>
      </CardHeader>
      <CardContent key={resetCount} className="flex flex-col gap-4">
        <AllDaysRow
          onApply={(open, close) =>
            onChangeAll(hours.map((row) => (row.closed ? row : { ...row, open, close })))
          }
        />
        <ul className="flex flex-col gap-2">
          {hours.map((row, index) => {
            // 오류는 칸이 아니라 요일 한 줄에 붙는다. 저장할 때 오류가 없으면 고르는 즉시 순서 문제를 보여준다
            const field = `hours.${index}` as const;
            const error =
              errors[field] ?? (row.closed ? null : hoursOrderProblem(row)) ?? undefined;
            const label = `${WEEKDAY_LABELS[row.weekday]}요일`;
            return (
              <li key={row.weekday} className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <span className="w-6 font-medium">{WEEKDAY_LABELS[row.weekday]}</span>
                  <label className="flex w-24 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.closed}
                      onChange={(event) => onChange(index, { closed: event.target.checked })}
                      className="size-4 accent-primary"
                    />
                    쉬는 날
                  </label>
                  <TimeSelect
                    label={`${label} 여는 시각`}
                    value={row.open}
                    onChange={(open) => onChange(index, { open })}
                    defaultPeriod="am"
                    stepMinutes={SLOT_START_STEP_MINUTES}
                    disabled={row.closed}
                    a11y={errorA11y(field, error)}
                  />
                  <span aria-hidden>~</span>
                  <TimeSelect
                    label={`${label} 닫는 시각`}
                    value={row.close}
                    onChange={(close) => onChange(index, { close })}
                    defaultPeriod="pm"
                    stepMinutes={SLOT_START_STEP_MINUTES}
                    disabled={row.closed}
                    a11y={errorA11y(field, error)}
                  />
                </div>
                <FieldError id={field} error={error} className="pl-9" />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * "전체 요일" 줄. 여는·닫는 시각을 골라 [모든 요일에 적용]을 누르면 쉬는 날이 아닌 요일에 넣는다(#311).
 * 둘 다 골랐고 순서가 맞을 때만 누를 수 있다. 이 줄 값은 저장하지 않는다
 */
function AllDaysRow({ onApply }: { onApply: (open: string, close: string) => void }) {
  const [open, setOpen] = useState('');
  const [close, setClose] = useState('');
  const problem = hoursOrderProblem({ open, close });
  const ready = open !== '' && close !== '' && problem === null;
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
      <div className="flex items-center gap-3">
        <span className="w-[7.5rem] shrink-0 text-sm font-medium">전체 요일</span>
        <TimeSelect
          label="전체 요일 여는 시각"
          value={open}
          onChange={setOpen}
          defaultPeriod="am"
          stepMinutes={SLOT_START_STEP_MINUTES}
        />
        <span aria-hidden>~</span>
        <TimeSelect
          label="전체 요일 닫는 시각"
          value={close}
          onChange={setClose}
          defaultPeriod="pm"
          stepMinutes={SLOT_START_STEP_MINUTES}
        />
      </div>
      {/* 버튼과 설명은 시각 칸 아래에 맞춰 둔다(한 줄에 다 넣으면 좁은 폭에서 넘친다) */}
      <div className="flex items-center gap-3 pl-[8.25rem]">
        <Button
          type="button"
          variant="outline"
          disabled={!ready}
          onClick={() => onApply(open, close)}
        >
          모든 요일에 적용
        </Button>
        <p className={problem ? 'text-sm text-destructive' : 'text-xs text-muted-foreground'}>
          {problem ?? '쉬는 날로 표시한 요일은 그대로 두고 나머지 요일에 넣어요.'}
        </p>
      </div>
    </div>
  );
}
