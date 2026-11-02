'use client';

import * as React from 'react';

import { editPhoneInput } from '@/lib/phone';

import { Input } from './input';

type PhoneInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  /** 하이픈 넣은 모양(010-1234-5678) */
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * 휴대폰 번호 입력칸(#183). 숫자만 쳐도 010-1234-5678 모양으로 하이픈을 넣고, 11자리까지만 받는다.
 * 고객 연락처(예약 확인·내 정보·가입)에 쓴다. 저장할 수 있는 번호인지는 normalizePhone(…, 'mobile')으로 본다
 */
export function PhoneInput({ value, onValueChange, ...props }: PhoneInputProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const deleteForward = (event.nativeEvent as InputEvent).inputType === 'deleteContentForward';
    const next = editPhoneInput(
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
    // type="tel"이라 폰에서는 숫자 키패드가 뜬다
    <Input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder="010-1234-5678"
      {...props}
      value={value}
      onChange={handleChange}
    />
  );
}
