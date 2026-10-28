// 계정 만들기와 약관 동의 기록 (DB, #47 4·5장). 서버에서만 부른다.
// 화면이 부르는 'use server' 함수(customer-account.ts)가 권한·입력을 확인한 뒤 이 함수들을 부른다.
// 'use server' 파일에서 내보내는 함수는 화면에서 바로 부를 수 있으므로, db를 받는 함수는 여기에 둔다.

import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { customers, termsAgreements } from '@/db/schema';
import type { AccountType, TermsType } from '@/db/schema/accounts';
import { TERMS_VERSIONS } from '@/server/policy';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update'>;

/** 고객 가입의 필수 동의(만 14세 이상 확인 포함, C-104·#47 1장). 광고성 정보 수신(marketing)만 선택 */
export const CUSTOMER_REQUIRED_TERMS = [
  'age14',
  'service',
  'privacy',
  'location',
] as const satisfies readonly TermsType[];

/** 프로필 이름을 받지 못했을 때의 첫 닉네임 */
export const DEFAULT_CUSTOMER_NICKNAME = '고객';

/**
 * 고객 계정과 약관 동의 기록을 저장한다. 이미 고객 계정이 있으면 아무것도 저장하지 않고 null.
 * 광고성 정보 수신에 동의했으면 그 동의 시각도 돌려준다(가입 직후 처리 결과 안내). 둘이 함께 저장되도록 트랜잭션 안에서 부른다
 */
export async function saveCustomerAccount(
  tx: Db,
  input: { userId: string; nickname: string; marketing: boolean },
): Promise<{ customerId: string; marketingAgreedAt: Date | null } | null> {
  const [customer] = await tx
    .insert(customers)
    .values({ userId: input.userId, nickname: input.nickname })
    .onConflictDoNothing({ target: customers.userId })
    .returning({ id: customers.id });
  if (!customer) return null;

  const termsTypes: TermsType[] = [...CUSTOMER_REQUIRED_TERMS];
  if (input.marketing) termsTypes.push('marketing');
  const agreed = await tx
    .insert(termsAgreements)
    .values(
      termsTypes.map((termsType) => ({
        userId: input.userId,
        accountType: 'customer',
        termsType,
        version: TERMS_VERSIONS[termsType],
      })),
    )
    .returning({ termsType: termsAgreements.termsType, agreedAt: termsAgreements.agreedAt });
  const marketing = agreed.find((row) => row.termsType === 'marketing');
  return { customerId: customer.id, marketingAgreedAt: marketing?.agreedAt ?? null };
}

export type MarketingConsent = {
  /** 지금 광고성 정보 수신에 동의한 상태인지 */
  agreed: boolean;
  /** 동의한 상태면 동의한 시각, 아니면 null */
  agreedAt: Date | null;
  /** 동의하지 않은 상태면 마지막으로 철회한 시각(한 번도 동의한 적 없으면 null), 동의한 상태면 null */
  withdrawnAt: Date | null;
};

type MarketingRow = { agreedAt: Date; withdrawnAt: Date | null };

/** 광고성 동의 기록들로 지금 상태를 만든다. 철회하지 않은 기록이 있으면 동의한 상태 */
export function toMarketingConsent(rows: readonly MarketingRow[]): MarketingConsent {
  const latest = (dates: Date[]) =>
    dates.reduce<Date | null>((a, b) => (a && a >= b ? a : b), null);
  const agreedAt = latest(rows.filter((r) => r.withdrawnAt === null).map((r) => r.agreedAt));
  if (agreedAt) return { agreed: true, agreedAt, withdrawnAt: null };
  return {
    agreed: false,
    agreedAt: null,
    withdrawnAt: latest(rows.flatMap((r) => (r.withdrawnAt ? [r.withdrawnAt] : []))),
  };
}

/** 광고성 정보 수신 동의 상태를 읽는다 */
export async function readMarketingConsent(
  db: Pick<Db, 'select'>,
  userId: string,
  accountType: AccountType,
): Promise<MarketingConsent> {
  const rows = await db
    .select({ agreedAt: termsAgreements.agreedAt, withdrawnAt: termsAgreements.withdrawnAt })
    .from(termsAgreements)
    .where(marketingOf(userId, accountType));
  return toMarketingConsent(rows);
}

/**
 * 광고성 정보 수신 동의를 켜거나 끈다. 켜면 동의 기록을 새로 더하고(이미 켜져 있으면 그대로),
 * 끄면 철회하지 않은 기록에 철회 시각을 남긴다. 기록은 지우지 않는다. 트랜잭션 안에서 부른다
 */
export async function writeMarketingConsent(
  tx: Db,
  userId: string,
  accountType: AccountType,
  agree: boolean,
): Promise<MarketingConsent> {
  const current = await readMarketingConsent(tx, userId, accountType);
  if (current.agreed === agree) return current;

  if (agree) {
    await tx.insert(termsAgreements).values({
      userId,
      accountType,
      termsType: 'marketing',
      version: TERMS_VERSIONS.marketing,
    });
  } else {
    await tx
      .update(termsAgreements)
      .set({ withdrawnAt: sql`now()` })
      .where(and(marketingOf(userId, accountType), isNull(termsAgreements.withdrawnAt)));
  }
  return readMarketingConsent(tx, userId, accountType);
}

function marketingOf(userId: string, accountType: AccountType) {
  return and(
    eq(termsAgreements.userId, userId),
    eq(termsAgreements.accountType, accountType),
    eq(termsAgreements.termsType, 'marketing'),
  );
}
