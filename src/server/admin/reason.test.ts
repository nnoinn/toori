// 운영자 처리 사유 확인 (#373 공통 규칙).

import { describe, expect, it } from 'vitest';

import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

import { toAdminReason } from './reason';

describe('운영자 처리 사유', () => {
  it('앞뒤 공백을 뺀 사유를 돌려준다', () => {
    expect(toAdminReason('  포트원 콘솔에서 결제 확인함 ')).toEqual({
      ok: true,
      reason: '포트원 콘솔에서 결제 확인함',
    });
  });

  it('빈칸·공백만·글자가 아닌 값은 REASON_REQUIRED', () => {
    for (const raw of ['', '   \n', undefined, null, 3]) {
      expect(toAdminReason(raw)).toEqual({ ok: false, problem: 'REASON_REQUIRED' });
    }
  });

  it('상한까지는 받고, 넘으면 REASON_TOO_LONG(앞뒤 공백은 세지 않는다)', () => {
    expect(toAdminReason('가'.repeat(ADMIN_REASON_LIMIT)).ok).toBe(true);
    expect(toAdminReason(` ${'가'.repeat(ADMIN_REASON_LIMIT)} `).ok).toBe(true);
    expect(toAdminReason('가'.repeat(ADMIN_REASON_LIMIT + 1))).toEqual({
      ok: false,
      problem: 'REASON_TOO_LONG',
    });
  });
});
