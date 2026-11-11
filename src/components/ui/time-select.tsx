'use client';

import { useState } from 'react';
import { cn } from 'cn';

// 시각 고르기: [오전/오후] · [시] · [분] (#311). 값은 24시간 "HH:MM"(빈 값은 ''), 화면은 오전·오후 12시간으로 보여준다.
// 브라우저 기본 시각 칸(<input type="time">)은 오전·오후 기본값을 정할 수 없어서 고르기 칸 세 개로 나눈다.
// 비어 있을 때는 오전·오후만 기본으로 골라 두고(여는 시각은 오전, 닫는 시각은 오후처럼) 시·분은 비워 둔다.
// 시를 고르면 분은 00으로 채운다. 분 단위(stepMinutes)에 맞지 않는 예전 값(예: 10:15)도 지우지 않고 그대로 보여준다.
// 12시는 "오전 12시" = 0시, "오후 12시" = 낮 12시다.

export type DayPeriod = 'am' | 'pm';

const PERIOD_LABELS: Record<DayPeriod, string> = { am: '오전', pm: '오후' };
const HOURS_12 = Array.from({ length: 12 }, (_, index) => index + 1);
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad2 = (value: number) => String(value).padStart(2, '0');

/** "HH:MM"을 오전·오후, 1~12시, 분으로. 모양이 아니면 null */
export function toTimeParts(
  value: string,
): { period: DayPeriod; hour12: number; minute: string } | null {
  const match = TIME.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  return { period: hour < 12 ? 'am' : 'pm', hour12: hour % 12 || 12, minute: match[2] };
}

/** 오전·오후, 1~12시, 분을 "HH:MM"으로. 오전 12시는 00시, 오후 12시는 12시 */
export function fromTimeParts(period: DayPeriod, hour12: number, minute: string): string {
  const hour = (hour12 % 12) + (period === 'pm' ? 12 : 0);
  return `${pad2(hour)}:${minute}`;
}

/** 분 고르기 목록. 단위에 맞지 않는 지금 값(extra)이 있으면 그 값도 넣는다 */
export function minuteOptions(stepMinutes: number, extra?: string): string[] {
  const options = Array.from({ length: Math.ceil(60 / stepMinutes) }, (_, index) =>
    pad2(index * stepMinutes),
  );
  return extra && !options.includes(extra) ? [...options, extra].sort() : options;
}

const SELECT_CLASS =
  'h-9 rounded-lg border bg-card px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50';

type TimeSelectProps = {
  /** "HH:MM"(24시간) 또는 빈 값 */
  value: string;
  onChange: (value: string) => void;
  /** 비어 있을 때 골라 둘 오전·오후 */
  defaultPeriod: DayPeriod;
  /** 분 단위. 기본 30분 */
  stepMinutes?: number;
  /** 칸 이름. 고르기 칸마다 "{label} 오전·오후", "{label} 시", "{label} 분"으로 읽힌다 */
  label: string;
  disabled?: boolean;
  /** 오류 연결 값(aria-invalid·aria-describedby). 세 칸에 같이 붙인다 */
  a11y?: { 'aria-invalid'?: boolean; 'aria-describedby'?: string };
  className?: string;
};

export function TimeSelect({
  value,
  onChange,
  defaultPeriod,
  stepMinutes = 30,
  label,
  disabled,
  a11y,
  className,
}: TimeSelectProps) {
  const parts = toTimeParts(value);
  // 값이 비어 있을 때 고른 오전·오후. 값이 있으면 값에서 읽는다
  const [emptyPeriod, setEmptyPeriod] = useState<DayPeriod>(defaultPeriod);
  const period = parts?.period ?? emptyPeriod;

  function choosePeriod(next: DayPeriod) {
    if (parts) onChange(fromTimeParts(next, parts.hour12, parts.minute));
    else setEmptyPeriod(next);
  }

  function chooseHour(next: string) {
    if (next === '') {
      // 시를 비우면 값을 지운다(오전·오후는 그대로 둔다)
      setEmptyPeriod(period);
      onChange('');
      return;
    }
    onChange(fromTimeParts(period, Number(next), parts?.minute ?? '00'));
  }

  function chooseMinute(next: string) {
    if (parts) onChange(fromTimeParts(parts.period, parts.hour12, next));
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <select
        aria-label={`${label} 오전·오후`}
        {...a11y}
        value={period}
        disabled={disabled}
        onChange={(event) => choosePeriod(event.target.value as DayPeriod)}
        className={SELECT_CLASS}
      >
        {(Object.keys(PERIOD_LABELS) as DayPeriod[]).map((key) => (
          <option key={key} value={key}>
            {PERIOD_LABELS[key]}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} 시`}
        {...a11y}
        value={parts ? String(parts.hour12) : ''}
        disabled={disabled}
        onChange={(event) => chooseHour(event.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">시</option>
        {HOURS_12.map((hour) => (
          <option key={hour} value={hour}>
            {hour}시
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} 분`}
        {...a11y}
        value={parts?.minute ?? ''}
        // 시를 고르기 전에는 분을 고를 수 없다(시를 고르면 00으로 채운다)
        disabled={disabled || !parts}
        onChange={(event) => chooseMinute(event.target.value)}
        className={SELECT_CLASS}
      >
        {parts ? null : <option value="">분</option>}
        {minuteOptions(stepMinutes, parts?.minute).map((minute) => (
          <option key={minute} value={minute}>
            {minute}분
          </option>
        ))}
      </select>
    </div>
  );
}
