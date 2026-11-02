'use client';

import * as React from 'react';

import { PHONE_INPUT_RULES, type PhoneKind } from '@/lib/phone';

import { DigitInput } from './digit-input';

type PhoneInputProps = Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  /** 하이픈 넣은 모양(010-1234-5678) */
  value: string;
  onValueChange: (value: string) => void;
  /** mobile(기본): 휴대폰만. any: 지역번호·070·0507 안심번호·대표번호까지(샵 전화번호, #205) */
  kind?: PhoneKind;
};

const PLACEHOLDERS: Record<PhoneKind, string> = {
  mobile: '010-1234-5678',
  any: '031-123-4567',
};

/**
 * 전화번호 입력칸(#183, #205). 숫자만 쳐도 하이픈을 넣고, 그 번호의 자릿수까지만 받는다.
 * 휴대폰(기본)은 010-1234-5678 모양으로 11자리까지. 고객 연락처(예약 확인·내 정보·가입)와 원장님 휴대폰에 쓴다.
 * kind="any"는 앞자리(02·031·0507·1588 등)에 맞춘 모양이고 샵 전화번호에 쓴다.
 * 저장할 수 있는 번호인지는 normalizePhone(…, kind)으로 본다
 */
export function PhoneInput({ value, onValueChange, kind = 'mobile', ...props }: PhoneInputProps) {
  return (
    // type="tel"이라 폰에서는 숫자 키패드가 뜬다
    <DigitInput
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder={PLACEHOLDERS[kind]}
      {...props}
      rule={PHONE_INPUT_RULES[kind]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
