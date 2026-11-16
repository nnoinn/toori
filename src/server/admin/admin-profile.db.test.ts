// 운영자 이름 정하기·바꾸기 저장 (11/16 nnoinn, AUTH-14). 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 권한 확인은 admin-profile.test.ts가 가짜 로그인으로 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { adminProfiles } from '@/db/schema';
import { fail, ok } from '@/lib/result';

import { createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { ADMIN_NAME_MESSAGES } from './admin-name';
import { readAdminProfileName, saveAdminName } from './admin-profile';

describeDb('운영자 이름 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('이름이 없으면 프로필을 만들고, 있으면 이름만 바꾼다(맡은 일은 그대로)', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      expect(await readAdminProfileName(tx, adminId)).toBeNull();

      expect(await saveAdminName(tx, adminId, '  김투리 ')).toEqual(ok({ name: '김투리' }));
      expect(await readAdminProfileName(tx, adminId)).toBe('김투리');

      await tx.update(adminProfiles).set({ role: '정산' }).where(eq(adminProfiles.userId, adminId));
      expect(await saveAdminName(tx, adminId, '이투리')).toEqual(ok({ name: '이투리' }));
      const rows = await tx.select().from(adminProfiles).where(eq(adminProfiles.userId, adminId));
      expect(rows).toEqual([expect.objectContaining({ name: '이투리', role: '정산' })]);
    });
  });

  it('다른 운영자가 쓰는 이름은 앞뒤 공백·영문 대소문자를 무시하고 NAME_TAKEN, 내 이름 그대로 저장은 된다', async () => {
    await withRollback(async (tx) => {
      const first = await createTestUser(tx);
      const second = await createTestUser(tx);
      expect(await saveAdminName(tx, first, 'Toori Kim')).toEqual(ok({ name: 'Toori Kim' }));

      expect(await saveAdminName(tx, second, '  toori KIM ')).toEqual(
        fail('NAME_TAKEN', ADMIN_NAME_MESSAGES.TAKEN),
      );
      expect(await readAdminProfileName(tx, second)).toBeNull();

      expect(await saveAdminName(tx, first, 'Toori Kim')).toEqual(ok({ name: 'Toori Kim' }));
    });
  });

  it("틀린 이름('운영자', 빈칸)은 저장하지 않는다", async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      expect(await saveAdminName(tx, adminId, '운영자')).toEqual(
        fail('INVALID_INPUT', ADMIN_NAME_MESSAGES.RESERVED),
      );
      expect(await saveAdminName(tx, adminId, ' ')).toEqual(
        fail('INVALID_INPUT', ADMIN_NAME_MESSAGES.REQUIRED),
      );
      expect(await readAdminProfileName(tx, adminId)).toBeNull();
    });
  });
});
