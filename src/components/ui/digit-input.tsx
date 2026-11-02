'use client';

import * as React from 'react';

import { type DigitInputRule, editDigitInput } from '@/lib/digit-input';

import { Input } from './input';

type DigitInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> & {
  /** 칸에 보이는 모양(예: 123-45-67890) */
  value: string;
  onValueChange: (value: string) => void;
  /** 모양과 자릿수. 예: 사업자등록번호 BUSINESS_NUMBER_INPUT('@/lib/business-number') */
  rule: DigitInputRule;
};

/**
 * 번호 입력칸(#205). 숫자만 받고, rule의 자릿수까지만 받고, 양식에 하이픈이 있으면 치는 대로 넣는다.
 * 폰에서는 숫자 키패드가 뜬다. 사업자등록번호·계좌번호에 쓰고, 휴대폰·전화번호는 PhoneInput을 쓴다.
 * 저장할 수 있는 번호인지는 각 검사 함수가 본다
 */
export function DigitInput({ value, onValueChange, rule, ...props }: DigitInputProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const deleteForward = (event.nativeEvent as InputEvent).inputType === 'deleteContentForward';
    const next = editDigitInput(
      rule,
      value,
      input.value,
      input.selectionStart ?? input.value.length,
      deleteForward,
    );
    // 화면 글자와 커서를 여기서 바로 맞춘다. 다시 그릴 때 같은 값이면 React가 손대지 않아서 커서가 끝으로 튀지 않는다
    input.value = next.value;
    if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret);
    onValueChange(next.value);
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      {...props}
      value={value}
      onChange={handleChange}
    />
  );
}
