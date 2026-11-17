// 운영자 이름 확인 규칙 (11/16 nnoinn, AUTH-14). 운영자 기록과 화면 위에 보이는 이름이라, 누가 처리했는지 구분되게
// 운영자끼리 같은 이름을 쓰지 않는다(겹치는지는 저장할 때 saveAdminName이 DB로 본다).
// 화면에서도 먼저 막을 수 있게 서버 전용이 아니다. 화면에서는 '@/server/admin/admin-name'에서 가져온다.

import { z } from 'zod';

/** 이름 최대 글자 수(앞뒤 공백을 뺀 뒤) */
export const ADMIN_NAME_MAX_LENGTH = 20;

/** 이름을 아직 정하지 않은 운영자에게 보일 이름. 누군지 구분되지 않아서 이 이름으로는 정할 수 없다 */
export const FALLBACK_ADMIN_NAME = '운영자';

export const ADMIN_NAME_MESSAGES = {
  REQUIRED: '이름을 입력해 주세요',
  TOO_LONG: `이름은 ${ADMIN_NAME_MAX_LENGTH}자까지 쓸 수 있어요`,
  RESERVED: `'${FALLBACK_ADMIN_NAME}'는 다른 운영자와 구분되지 않아서 쓸 수 없어요`,
  TAKEN: '다른 운영자가 쓰는 이름이에요. 다른 이름을 써 주세요',
} as const;

/** 운영자 이름. 앞뒤 공백을 빼고 1~20자, '운영자'는 안 된다 */
export const adminNameSchema = z
  .string()
  .trim()
  .min(1, ADMIN_NAME_MESSAGES.REQUIRED)
  .max(ADMIN_NAME_MAX_LENGTH, ADMIN_NAME_MESSAGES.TOO_LONG)
  .refine((name) => name !== FALLBACK_ADMIN_NAME, { message: ADMIN_NAME_MESSAGES.RESERVED });
