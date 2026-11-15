// 운영자 프로필 읽기 (#372 4장). 서버에서만 부른다. 운영자 화면 위 이름과 운영자 기록 화면이 쓴다.

import 'server-only';

import { eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { adminProfiles } from '@/db/schema';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 프로필이 아직 없는 운영자(강규민이 SQL로 넣기 전)에게 보일 이름 */
export const FALLBACK_ADMIN_NAME = '운영자';

/** 운영자 이름. 프로필이 없으면 FALLBACK_ADMIN_NAME */
export async function readAdminName(db: DbReader, userId: string): Promise<string> {
  const [row] = await db
    .select({ name: adminProfiles.name })
    .from(adminProfiles)
    .where(eq(adminProfiles.userId, userId));
  return row?.name ?? FALLBACK_ADMIN_NAME;
}
