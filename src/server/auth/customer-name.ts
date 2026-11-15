// 고객 이름 확인 규칙 (#375, 11/13 nnoinn, AUTH-12). 예약자 이름이라 가입 때 받고 내 정보에서 고친다.
// 가입 저장(createCustomerAccount)과 내 정보 고치기(정찬형 updateMyProfile)가 같은 규칙을 쓴다.
// 화면에서도 먼저 막을 수 있게 서버 전용이 아니다. 화면에서는 '@/server/auth/customer-name'에서 가져온다.

import { z } from 'zod';

/** 이름 최대 글자 수(앞뒤 공백을 뺀 뒤) */
export const CUSTOMER_NAME_MAX_LENGTH = 30;

export const CUSTOMER_NAME_MESSAGES = {
  REQUIRED: '이름을 입력해 주세요',
  TOO_LONG: `이름은 ${CUSTOMER_NAME_MAX_LENGTH}자까지 쓸 수 있어요`,
} as const;

/** 고객 이름. 앞뒤 공백을 빼고 1~30자 */
export const customerNameSchema = z
  .string()
  .trim()
  .min(1, CUSTOMER_NAME_MESSAGES.REQUIRED)
  .max(CUSTOMER_NAME_MAX_LENGTH, CUSTOMER_NAME_MESSAGES.TOO_LONG);
