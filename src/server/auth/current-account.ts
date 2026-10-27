// 지금 들어온 사람 확인 (X-101, 연결 #2, Issue #47 1장). 서버에서만 부른다.
// Supabase 로그인 세션으로 누구인지 확인하고, account_mode 쿠키로 어느 계정으로 들어왔는지 본다.
// 쿠키만 믿지 않고 DB에서 계정을 다시 읽는다. 탈퇴한 고객·원장님 계정은 없는 것으로 본다.
//
// 화면에서 부를 때: 요청마다 다른 값이라 정적 화면에 미리 그려 둘 수 없다(Cache Components).
// 레이아웃·페이지 맨 위에서 기다리지 말고 <Suspense> 안의 서버 컴포넌트에서 부른다.

import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { cache } from 'react';

import { getDb } from '@/db';
import { customers, owners, profiles, shops } from '@/db/schema';
import { createSupabaseServerClient } from '@/server/supabase/server';

import { ACCOUNT_MODE_COOKIE, type AccountMode, parseAccountMode } from './account-mode';

export type { AccountMode } from './account-mode';

export type CurrentAccount = {
  /** profiles.id (= Supabase 로그인 사용자 ID) */
  userId: string;
  email: string;
  /** 로그인 때 고른 계정 종류. 없으면 'customer' */
  mode: AccountMode;
  /** 고객 계정이 있으면 */
  customerId: string | null;
  /** 원장님 계정이 있으면 */
  ownerId: string | null;
  /** 원장님의 샵(원장님 한 명에 샵 하나). #47 약속에 더한 값 */
  shopId: string | null;
  /** profiles.is_admin */
  isAdmin: boolean;
};

/** 로그인 안 했으면 null. 한 요청 안에서 여러 번 불러도 한 번만 읽는다 */
export const getCurrentAccount = cache(async (): Promise<CurrentAccount | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const mode = parseAccountMode((await cookies()).get(ACCOUNT_MODE_COOKIE)?.value);
  return loadAccount(getDb(), userId, mode);
});

/** 로그인 세션의 사용자 id. 로그인 토큰의 서명을 확인한 값이라 믿을 수 있다. 로그인 안 했으면 null */
export async function getSessionUserId(): Promise<string | null> {
  return (await getSessionUser())?.userId ?? null;
}

/**
 * 로그인 세션의 사용자 id와 간편 로그인 프로필 이름(카카오 닉네임·구글 이름, 없으면 null).
 * 이름은 고객 가입 때 처음 닉네임으로 쓴다(C-103에서 바꿀 수 있다). 로그인 안 했으면 null
 */
export async function getSessionUser(): Promise<{ userId: string; name: string | null } | null> {
  // 토큰 만료를 확인하느라 지금 시각을 읽는다. 쿠키만 읽으면 미리 그리는 단계(Partial Prefetching)에서도 돌 수 있어서,
  // 실제 요청이 올 때까지 기다린 뒤에 확인한다(Cache Components의 Date.now() 오류 방지)
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub) return null;
  const metadata = data.claims.user_metadata ?? {};
  const name = [metadata.full_name, metadata.name].find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  return { userId: data.claims.sub, name: name?.trim() ?? null };
}

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'insert'>;

/** userId의 고객·원장님 계정과 샵을 DB에서 읽는다. 로그인 정보(profiles)가 없으면 null. 로그인 콜백과 테스트가 같이 쓴다 */
export async function loadAccount(
  db: Pick<Db, 'select'>,
  userId: string,
  mode: AccountMode,
): Promise<CurrentAccount | null> {
  const [row] = await db
    .select({
      userId: profiles.id,
      email: profiles.email,
      isAdmin: profiles.isAdmin,
      customerId: customers.id,
      ownerId: owners.id,
      shopId: shops.id,
    })
    .from(profiles)
    .leftJoin(customers, and(eq(customers.userId, profiles.id), isNull(customers.withdrawnAt)))
    .leftJoin(owners, and(eq(owners.userId, profiles.id), isNull(owners.withdrawnAt)))
    .leftJoin(shops, eq(shops.ownerId, owners.id))
    .where(eq(profiles.id, userId));
  if (!row) return null;
  return { ...row, mode };
}

/** 첫 로그인이면 profiles를 만든다. 이미 있으면 그대로 둔다(로그인 콜백) */
export async function ensureProfile(
  db: Pick<Db, 'insert'>,
  userId: string,
  email: string,
): Promise<void> {
  await db
    .insert(profiles)
    .values({ id: userId, email })
    .onConflictDoNothing({ target: profiles.id });
}
