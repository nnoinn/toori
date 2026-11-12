'use client';

import { cn } from 'cn';

// 시각 고르기: 24시간 표기 칸 하나(#311, 11/11 nnoinn). 누르면 00:00, 00:30, … 23:30 목록에서 한 번에 시각 전체를 고른다.
// 값은 "HH:MM"(빈 값은 ''). 비어 있으면 "선택"으로 둔다.
// 닫는 시각 칸(closing)은 00:00을 "00:00(자정)"으로 보여준다(닫는 시각 00:00은 그 날 밤 12시에 닫는다는 뜻).
// 분 단위(stepMinutes)에 맞지 않는 예전 값(예: 10:15)도 지우지 않고 목록에 넣어 그대로 보여준다.

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad2 = (value: number) => String(value).padStart(2, '0');

/** 고르기 목록. 00:00부터 단위마다. 단위에 맞지 않는 지금 값(extra)이 있으면 그 값도 시각 순서대로 넣는다 */
export function timeOptions(stepMinutes: number, extra?: string): string[] {
  const options = Array.from({ length: Math.ceil((24 * 60) / stepMinutes) }, (_, index) => {
    const minutes = index * stepMinutes;
    return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
  });
  return extra && TIME.test(extra) && !options.includes(extra)
    ? [...options, extra].sort()
    : options;
}

/** 목록에 보이는 이름. 닫는 시각 칸의 00:00은 "00:00(자정)" */
export function timeOptionLabel(value: string, closing = false): string {
  return closing && value === '00:00' ? '00:00(자정)' : value;
}

const SELECT_CLASS =
  'h-9 w-32 rounded-lg border bg-card px-2 text-sm tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive disabled:cursor-not-allowed disabled:opacity-50';

type TimeSelectProps = {
  /** "HH:MM"(24시간) 또는 빈 값 */
  value: string;
  onChange: (value: string) => void;
  /** 분 단위. 기본 30분 */
  stepMinutes?: number;
  /** 닫는 시각 칸이면 true. 00:00을 "00:00(자정)"으로 보여준다 */
  closing?: boolean;
  /** 칸 이름(읽기 프로그램용). 예: "월요일 여는 시각" */
  label: string;
  disabled?: boolean;
  /** 오류 연결 값(aria-invalid·aria-describedby) */
  a11y?: { 'aria-invalid'?: boolean; 'aria-describedby'?: string };
  className?: string;
};

export function TimeSelect({
  value,
  onChange,
  stepMinutes = 30,
  closing = false,
  label,
  disabled,
  a11y,
  className,
}: TimeSelectProps) {
  return (
    <select
      aria-label={label}
      {...a11y}
      value={TIME.test(value) ? value : ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={cn(SELECT_CLASS, className)}
    >
      <option value="">선택</option>
      {timeOptions(stepMinutes, value).map((option) => (
        <option key={option} value={option}>
          {timeOptionLabel(option, closing)}
        </option>
      ))}
    </select>
  );
}
