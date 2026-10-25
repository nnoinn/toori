// 지금 들어온 사람 확인 (X-101, 연결 #2, Issue #47 1장). 서버에서만 부른다.
// 쿠키만 믿지 않고 DB에서 계정을 다시 읽는다. 탈퇴한 고객·원장님 계정은 없는 것으로 본다.
//
// 지금은 로그인(W2) 전이라 "누가 로그인했나"만 가짜다. 내 컴퓨터의 next dev에서만 .env.local의
// DEV_LOGIN_EMAIL(시드 계정)·DEV_LOGIN_MODE로 로그인한 것처럼 처리하고, 그 밖에는 늘 로그인 안 함(null)이다.
// W2에서 이 부분만 Supabase 로그인 정보와 account_mode 쿠키로 바꾼다. 함수 이름·입출력은 그대로다.
//
// 화면에서 부를 때: 요청마다 다른 값이라 정적 화면에 미리 그려 둘 수 없다(Cache Components).
// 레이아웃·페이지 맨 위에서 기다리지 말고 <Suspense> 안의 서버 컴포넌트에서 부른다.

import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { connection } from 'next/server';

import { getDb } from '@/db';
import { customers, owners, profiles, shops } from '@/db/schema';

export type AccountMode = 'customer' | 'owner';

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

/** 로그인 안 했으면 null */
export async function getCurrentAccount(): Promise<CurrentAccount | null> {
  // 로그인 정보는 요청마다 다르다. 빌드 때 미리 계산하지 않고 요청이 올 때까지 기다린다
  await connection();
  const devLogin = readDevLogin();
  if (!devLogin) return null;

  const db = getDb();
  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, devLogin.email));
  if (!profile) return null;
  return loadAccount(db, profile.id, devLogin.mode);
}

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

/** userId의 고객·원장님 계정과 샵을 DB에서 읽는다. 로그인 정보(profiles)가 없으면 null. W2 로그인과 테스트가 같이 쓴다 */
export async function loadAccount(
  db: Db,
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

// --- 로그인(W2) 전 임시. W2에서 지운다 ---

/** 가짜 로그인은 시드 계정만 쓸 수 있다(scripts/seed-data.mjs의 SEED_EMAIL_DOMAIN) */
const DEV_LOGIN_EMAIL_SUFFIX = '@seed.test';

function readDevLogin(): { email: string; mode: AccountMode } | null {
  // next dev에서만 켠다. 배포·미리보기(next build)와 테스트에서는 늘 로그인 안 함이다
  if (process.env.NODE_ENV !== 'development') return null;
  const email = process.env.DEV_LOGIN_EMAIL?.trim().toLowerCase();
  if (!email?.endsWith(DEV_LOGIN_EMAIL_SUFFIX)) return null;
  return { email, mode: process.env.DEV_LOGIN_MODE === 'owner' ? 'owner' : 'customer' };
}
