// 원장님 사업자 정보·정산 계좌 입력 검사 (S-101·S-107, #23 D3). 화면('use client')과 서버 함수가 같이 쓴다.
// 가입(join/owner-join.ts), 매장 설정 > 사업자 정보, 정산 계좌(O7 ②)가 같은 규칙을 쓴다. 강규민님 createOwnerAccount의 서버 검사와 같은 규칙이다.

import { utcToKst } from '@/lib/time';
import { BANK_CODES, type BankCode } from '@/server/policy';

/** 한국 날짜 YYYY-MM-DD. 개업일자 검사의 '오늘'로 쓴다 */
export function kstDateKey(date: Date): string {
  const { year, month, day } = utcToKst(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const OWNER_FIELD_LIMITS = {
  personName: 20,
  businessName: 40,
  accountHolder: 40,
} as const;

export type BusinessInput = {
  businessName: string;
  representativeName: string;
  businessRegistrationNumber: string;
  /** YYYY-MM-DD (date 입력) */
  openedOn: string;
  /** 올린 사업자등록증 경로. 올리기 전이면 빈 문자열 */
  businessDocPath: string;
};

export type PayoutInput = {
  bankCode: BankCode | '';
  accountNumber: string;
  accountHolder: string;
};

export type PayoutValues = { bankCode: BankCode; accountNumber: string; accountHolder: string };

type Checked<T, K extends string> =
  { ok: true; data: T } | { ok: false; fieldErrors: Partial<Record<K, string>> };

/** 하이픈·공백을 뺀 숫자 */
export function onlyDigits(value: string): string {
  return value.replace(/[-\s]/g, '');
}

/** 비면 "…을(를) 입력해 주세요", 길면 "N자 이하로". 앞뒤 빈칸을 뺀 값을 돌려준다 */
export function checkRequired<K extends string>(
  errors: Partial<Record<K, string>>,
  field: K,
  value: string,
  label: string,
  max?: number,
): string {
  const text = value.trim();
  if (text === '') errors[field] = `${label}을(를) 입력해 주세요`;
  else if (max !== undefined && text.length > max) errors[field] = `${max}자 이하로 입력해 주세요`;
  return text;
}

/**
 * 사업자 정보. today는 한국 날짜(YYYY-MM-DD)로, 개업일자가 그 뒤면 막는다.
 * 통과하면 앞뒤 빈칸을 빼고 사업자등록번호는 숫자 10자리로 돌려준다
 */
export function validateBusinessInput(
  input: BusinessInput,
  today: string,
): Checked<BusinessInput, keyof BusinessInput> {
  const errors: Partial<Record<keyof BusinessInput, string>> = {};
  const businessName = checkRequired(
    errors,
    'businessName',
    input.businessName,
    '상호',
    OWNER_FIELD_LIMITS.businessName,
  );
  const representativeName = checkRequired(
    errors,
    'representativeName',
    input.representativeName,
    '대표자명',
    OWNER_FIELD_LIMITS.personName,
  );
  const businessRegistrationNumber = onlyDigits(input.businessRegistrationNumber);
  if (!/^\d{10}$/.test(businessRegistrationNumber)) {
    errors.businessRegistrationNumber = '사업자등록번호 10자리를 입력해 주세요(예: 123-45-67890)';
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.openedOn)) {
    errors.openedOn = '개업일자를 골라 주세요';
  } else if (input.openedOn > today) {
    errors.openedOn = '개업일자는 오늘이나 그 전 날짜여야 해요';
  }
  if (input.businessDocPath === '') errors.businessDocPath = '사업자등록증을 올려 주세요';

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      businessName,
      representativeName,
      businessRegistrationNumber,
      openedOn: input.openedOn,
      businessDocPath: input.businessDocPath,
    },
  };
}

/** 정산 계좌. 계좌번호는 하이픈·공백을 뺀 숫자 8~16자리 */
export function validatePayoutInput(input: PayoutInput): Checked<PayoutValues, keyof PayoutInput> {
  const errors: Partial<Record<keyof PayoutInput, string>> = {};
  const bankCode = input.bankCode;
  if (!bankCode || !BANK_CODES.includes(bankCode)) errors.bankCode = '은행을 골라 주세요';
  const accountNumber = onlyDigits(input.accountNumber);
  if (!/^\d{8,16}$/.test(accountNumber)) {
    errors.accountNumber = '계좌번호를 숫자로 입력해 주세요(8~16자리)';
  }
  const accountHolder = checkRequired(
    errors,
    'accountHolder',
    input.accountHolder,
    '예금주',
    OWNER_FIELD_LIMITS.accountHolder,
  );
  if (Object.keys(errors).length > 0 || !bankCode) return { ok: false, fieldErrors: errors };
  return { ok: true, data: { bankCode, accountNumber, accountHolder } };
}
