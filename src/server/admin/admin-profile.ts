// 운영자 프로필 읽기·이름 정하기 (#372 4장, 11/16 nnoinn). 서버에서만 부른다.
// 운영자 화면 위 이름과 [이름 정하기·바꾸기](admin-name-edit.tsx), 운영자 기록 화면이 쓴다.

import 'server-only';

import { and, eq, ne, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { adminProfiles } from '@/db/schema';
import { fail, ok, type Result } from '@/lib/result';
import { requireAdmin } from '@/server/auth';

import { ADMIN_NAME_MESSAGES, adminNameSchema } from './admin-name';

export { FALLBACK_ADMIN_NAME } from './admin-name';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;
type DbWriter = Pick<ReturnType<typeof getDb>, 'select' | 'insert'>;

/** 운영자 이름. 아직 정하지 않았으면(프로필 전) null이라 화면 위에 [이름 정하기]를 보여 준다 */
export async function readAdminProfileName(db: DbReader, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: adminProfiles.name })
    .from(adminProfiles)
    .where(eq(adminProfiles.userId, userId));
  return row?.name ?? null;
}

/**
 * 운영자 이름을 정하거나 바꾼다(AUTH-13). 프로필이 없으면 만들고, 있으면 이름만 바꾼다(맡은 일은 그대로).
 * 다른 운영자가 쓰는 이름(앞뒤 공백·영문 대소문자 무시)이면 NAME_TAKEN. 기록은 운영자 id로 남아서,
 * 이름을 바꾸면 지난 기록에도 새 이름으로 보인다
 */
export async function saveAdminName(
  db: DbWriter,
  userId: string,
  input: unknown,
): Promise<Result<{ name: string }>> {
  const parsed = adminNameSchema.safeParse(input);
  if (!parsed.success) {
    // 글자가 아닌 값(화면을 거치지 않은 요청)은 빈칸처럼 안내한다
    const issue = parsed.error.issues[0];
    const message =
      typeof input === 'string' && issue ? issue.message : ADMIN_NAME_MESSAGES.REQUIRED;
    return fail('INVALID_INPUT', message);
  }
  const name = parsed.data;

  const [taken] = await db
    .select({ userId: adminProfiles.userId })
    .from(adminProfiles)
    .where(
      and(
        sql`lower(btrim(${adminProfiles.name})) = lower(${name})`,
        ne(adminProfiles.userId, userId),
      ),
    )
    .limit(1);
  if (taken) return fail('NAME_TAKEN', ADMIN_NAME_MESSAGES.TAKEN);

  await db
    .insert(adminProfiles)
    .values({ userId, name })
    .onConflictDoUpdate({ target: adminProfiles.userId, set: { name, updatedAt: new Date() } });
  return ok({ name });
}

/** 지금 들어와 있는 운영자 자기 이름만 정한다. 다른 운영자 이름은 바꿀 수 없다(받는 값에 운영자 id가 없다) */
export async function updateMyAdminName(input: unknown): Promise<Result<{ name: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  return saveAdminName(getDb(), auth.data.userId, input);
}
