// E2E 도우미: 시드 계정으로 로그인하기, 시드 매물 고르기, 시드 고객의 홀딩 정리.
// 모두 로컬 Supabase만 쓴다. 주소·키는 playwright.config.ts가 로컬인지 확인한 뒤 E2E_* 환경변수로 넘겨준다.

import { type BrowserContext, expect } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

/** 시드 계정(scripts/seed-data.mjs SEED_ACCOUNTS). 고객 A는 시드가 다른 매물 하나를 홀딩해 두므로 홀딩 흐름에는 B를 쓴다 */
export type SeedAccount = 'customer-a' | 'customer-b' | 'customer-c' | 'owner-a';

const SEED_EMAIL_DOMAIN = 'seed.test';
// src/server/auth/account-mode.ts ACCOUNT_MODE_COOKIE
const ACCOUNT_MODE_COOKIE = 'account_mode';

function env(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `${name}이 없어요. E2E는 npm run test:e2e로 돌려요(playwright.config.ts가 넣어 준다).`,
    );
  return value;
}

function adminClient() {
  return createClient(env('E2E_SUPABASE_URL'), env('E2E_SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 테스트 준비·정리용 DB 접속. 테스트 하나가 끝나면 닫는다 */
export async function withDb<T>(run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(env('E2E_DATABASE_URL'), { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

/**
 * 시드 계정으로 로그인한 쿠키를 브라우저에 넣는다. scripts/pr-screenshot.mjs의 signIn과 같은 방식이다:
 * 관리 기능으로 로그인 링크를 만들고 바로 확인해서 세션 쿠키를 받는다(간편 로그인 화면은 로봇이 누르지 않는다, AUTH-07)
 */
export async function signInAs(context: BrowserContext, account: SeedAccount, baseURL: string) {
  const email = `${account}@${SEED_EMAIL_DOMAIN}`;
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw new Error(`${account} 로그인 링크를 만들지 못했어요: ${error.message}`);

  const jar = new Map<string, string>();
  const client = createServerClient(env('E2E_SUPABASE_URL'), env('E2E_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const verified = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.properties.hashed_token,
  });
  if (verified.error)
    throw new Error(`${account}로 로그인하지 못했어요: ${verified.error.message}`);
  // 세션 쿠키는 로그인 확인 뒤 조금 늦게 쓰인다
  await expect.poll(() => jar.size, { message: '로그인 쿠키' }).toBeGreaterThan(0);

  const mode = account.startsWith('owner') ? 'owner' : 'customer';
  await context.addCookies([
    ...[...jar].map(([name, value]) => ({ name, value, url: baseURL })),
    { name: ACCOUNT_MODE_COOKIE, value: mode, url: baseURL },
  ]);
}

/**
 * 시드 샵의 게시중(게시 시각이 지나고 시작 전) 한 시술 매물 중 아무도 홀딩하지 않은 것(시작 시각 순).
 * minHoursLeft: 시작까지 이보다 많이 남은 것만. withNewCustomerOnly: 신규 고객 전용도 넣을지
 */
async function seedSlotIds({
  minHoursLeft,
  withNewCustomerOnly,
}: {
  minHoursLeft: number;
  withNewCustomerOnly: boolean;
}): Promise<string[]> {
  return withDb(async (sql) => {
    const rows = await sql<{ id: string }[]>`
      select s.id
      from slots s
      join shops sh on sh.id = s.shop_id
      join owners o on o.id = sh.owner_id
      join auth.users u on u.id = o.user_id
      where u.email like ${`%@${SEED_EMAIL_DOMAIN}`}
        and sh.status = 'approved'
        and s.status in ('scheduled', 'published')
        and s.window_id is null
        and (${withNewCustomerOnly} or s.new_customer_only = false)
        and s.publish_at <= now()
        and s.start_at > now() + make_interval(hours => ${minHoursLeft})
        and (s.hold_customer_id is null or s.hold_expires_at <= now())
      order by s.start_at`;
    return rows.map((row) => row.id);
  });
}

/** 로그인하지 않은 손님에게 [예약하기]가 보이는 시드 매물(결제 중이 아닌 게시중 매물) */
export function openSeedSlotIds(): Promise<string[]> {
  return seedSlotIds({ minHoursLeft: 0, withNewCustomerOnly: true });
}

/**
 * 시드 고객이 지금 예약할 수 있는 시드 매물. 시작까지 7시간보다 많이 남았고(6시간 미만의 환불 불가 표시와 섞이지 않게),
 * 신규 고객 전용이 아니다(고객마다 보이는 매물이 다르다, C-306)
 */
export function reservableSeedSlotIds(): Promise<string[]> {
  return seedSlotIds({ minHoursLeft: 7, withNewCustomerOnly: false });
}

/**
 * 예약할 수 있고, 취소하면 70% 환불 구간(24시간 이상 남음, X-202)인 시드 매물(#592 2차).
 * 결제·취소하는 동안 24시간 아래로 내려가지 않게 25시간보다 많이 남은 것만 고른다
 */
export function refundableSeedSlotIds(): Promise<string[]> {
  return seedSlotIds({ minHoursLeft: 25, withNewCustomerOnly: false });
}

/** 이 매물을 지금 홀딩한 시드 고객(없거나 끝났으면 null) */
export async function holderOf(slotId: string): Promise<string | null> {
  return withDb(async (sql) => {
    const [row] = await sql<{ email: string | null }[]>`
      select u.email
      from slots s
      left join customers c on c.id = s.hold_customer_id
      left join auth.users u on u.id = c.user_id
      where s.id = ${slotId} and s.hold_expires_at > now()`;
    return row?.email?.replace(`@${SEED_EMAIL_DOMAIN}`, '') ?? null;
  });
}

/** 테스트가 남긴 홀딩 정리(실패하거나 다시 돌 때 다음 테스트가 "이미 결제 중인 매물"에 막히지 않게) */
export async function releaseHoldsOf(account: SeedAccount) {
  await withDb(async (sql) => {
    await sql`
      update slots set hold_customer_id = null, hold_expires_at = null
      where hold_customer_id in (
        select c.id from customers c join auth.users u on u.id = c.user_id
        where u.email = ${`${account}@${SEED_EMAIL_DOMAIN}`}
      )`;
  });
}
