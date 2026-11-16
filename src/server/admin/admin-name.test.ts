// 운영자 이름 규칙 (11/16 nnoinn, AUTH-13). 다른 운영자와 겹치는지는 admin-profile.db.test.ts가 실제 DB로 본다.

import { describe, expect, it } from 'vitest';

import { ADMIN_NAME_MAX_LENGTH, ADMIN_NAME_MESSAGES, adminNameSchema } from './admin-name';

const firstMessage = (value: unknown) => adminNameSchema.safeParse(value).error?.issues[0]?.message;

describe('운영자 이름 규칙', () => {
  it('앞뒤 공백을 빼고 저장한다', () => {
    expect(adminNameSchema.parse('  김투리  ')).toBe('김투리');
  });

  it(`앞뒤 공백을 뺀 뒤 ${ADMIN_NAME_MAX_LENGTH}자까지 되고, 넘으면 TOO_LONG`, () => {
    expect(adminNameSchema.parse(` ${'가'.repeat(ADMIN_NAME_MAX_LENGTH)} `)).toHaveLength(
      ADMIN_NAME_MAX_LENGTH,
    );
    expect(firstMessage('가'.repeat(ADMIN_NAME_MAX_LENGTH + 1))).toBe(ADMIN_NAME_MESSAGES.TOO_LONG);
  });

  it.each(['', '   '])('빈칸(%j)은 REQUIRED', (value) => {
    expect(firstMessage(value)).toBe(ADMIN_NAME_MESSAGES.REQUIRED);
  });

  it.each(['운영자', '  운영자 '])(
    "이름을 정하지 않은 운영자에게 보이는 '운영자'(%j)는 쓸 수 없다",
    (value) => {
      expect(firstMessage(value)).toBe(ADMIN_NAME_MESSAGES.RESERVED);
    },
  );
});
