'use client';

import { cn } from 'cn';

import { FieldError } from '../form-field';

// 하나를 고르는 칩 묶음(#23 디자인 A7). 샵 정보 업종, 메뉴 서비스 종류, 매물 마감 사유가 같이 쓴다.
// 세 곳이 높이(36px·32px)와 줄바꿈을 따로 적던 것을 모았다. 속은 라디오 버튼이라 키보드(화살표)로도 고른다.

type ChoiceChipsProps<T extends string> = {
  legend: string;
  /** 라디오 묶음 이름. 한 화면에서 겹치지 않게 */
  name: string;
  options: readonly { key: T; label: string }[];
  /** 고른 값. 아직 안 골랐으면 null(또는 빈 값) */
  value: string | null;
  onChange: (key: T) => void;
  /** 오류 문구 id(묶음 이름)와 문구. 오류를 칩 아래에 보여줄 때만 준다 */
  errorId?: string;
  error?: string;
};

export function ChoiceChips<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  errorId,
  error,
}: ChoiceChipsProps<T>) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.key}
            className={cn(
              'flex h-9 cursor-pointer items-center rounded-lg border px-3 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
              value === option.key && 'border-primary bg-primary/10 font-semibold',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.key}
              checked={value === option.key}
              onChange={() => onChange(option.key)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {errorId ? <FieldError id={errorId} error={error} /> : null}
    </fieldset>
  );
}
