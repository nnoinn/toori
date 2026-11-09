// 계정 만들기와 약관 동의 기록 (DB, #47 4·5장). 서버에서만 부른다.
// 화면이 부르는 'use server' 함수(customer-account.ts, owner-account.ts)가 권한·입력을 확인한 뒤 이 함수들을 부른다.
// 'use server' 파일에서 내보내는 함수는 화면에서 바로 부를 수 있으므로, db를 받는 함수는 여기에 둔다.

import 'server-only';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { customers, owners, payoutAccounts, shops, termsAgreements } from '@/db/schema';
import type { AccountType, TermsType } from '@/db/schema/accounts';
import type { GeoPoint } from '@/db/schema/types';
import { TERMS_VERSIONS } from '@/server/policy';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update'>;

/** 고객 가입의 필수 동의(만 14세 이상 확인 포함, C-104·#47 1장). 나머지는 아래 선택 동의 */
export const CUSTOMER_REQUIRED_TERMS = [
  'age14',
  'service',
  'privacy',
  'location',
] as const satisfies readonly TermsType[];

/**
 * 고객이 고르는 선택 동의. 둘 다 광고성 정보라 따로 받고 따로 철회한다(#267, 11/8).
 * interest_alert: 관심 동네·찜한 샵 새 매물 알림(W17은 이 동의만 본다). marketing: 이벤트·혜택 소식
 */
export const OPTIONAL_CUSTOMER_TERMS = [
  'interest_alert',
  'marketing',
] as const satisfies readonly TermsType[];
export type OptionalTerms = (typeof OPTIONAL_CUSTOMER_TERMS)[number];

export function isOptionalTerms(value: string): value is OptionalTerms {
  return (OPTIONAL_CUSTOMER_TERMS as readonly string[]).includes(value);
}

/** 가입·동의 직후 한 번 보여주는 처리 결과 한 줄(동의 문구 6-1장) */
export type ConsentNotice = { type: OptionalTerms; agreedAt: Date };

/** 프로필 이름을 받지 못했을 때의 첫 닉네임 */
export const DEFAULT_CUSTOMER_NICKNAME = '고객';

/**
 * 고객 계정과 약관 동의 기록을 저장한다. 이미 고객 계정이 있으면 아무것도 저장하지 않고 null.
 * 고른 선택 동의는 동의 시각을 돌려준다(가입 직후 처리 결과 안내). 둘이 함께 저장되도록 트랜잭션 안에서 부른다
 */
export async function saveCustomerAccount(
  tx: Db,
  input: {
    userId: string;
    nickname: string;
    phone: string;
    optionalTerms: readonly OptionalTerms[];
  },
): Promise<{ customerId: string; consentNotices: ConsentNotice[] } | null> {
  const [customer] = await tx
    .insert(customers)
    .values({ userId: input.userId, nickname: input.nickname, phone: input.phone })
    .onConflictDoNothing({ target: customers.userId })
    .returning({ id: customers.id });
  if (!customer) return null;

  const termsTypes: TermsType[] = [
    ...CUSTOMER_REQUIRED_TERMS,
    ...OPTIONAL_CUSTOMER_TERMS.filter((type) => input.optionalTerms.includes(type)),
  ];
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
  const consentNotices = OPTIONAL_CUSTOMER_TERMS.flatMap((type) => {
    const row = agreed.find((r) => r.termsType === type);
    return row ? [{ type, agreedAt: row.agreedAt }] : [];
  });
  return { customerId: customer.id, consentNotices };
}

/** 선택 동의 하나의 지금 상태 */
export type OptionalConsent = {
  /** 지금 동의한 상태인지 */
  agreed: boolean;
  /** 동의한 상태면 동의한 시각, 아니면 null */
  agreedAt: Date | null;
  /** 동의하지 않은 상태면 마지막으로 철회한 시각(한 번도 동의한 적 없으면 null), 동의한 상태면 null */
  withdrawnAt: Date | null;
};

/** 광고성 정보 수신(marketing) 동의 상태. 예전 이름이라 OptionalConsent와 같다 */
export type MarketingConsent = OptionalConsent;

/** 두 선택 동의의 지금 상태 */
export type OptionalConsents = Record<OptionalTerms, OptionalConsent>;

type ConsentRow = { agreedAt: Date; withdrawnAt: Date | null };

/** 한 종류의 동의 기록들로 지금 상태를 만든다. 철회하지 않은 기록이 있으면 동의한 상태 */
export function toOptionalConsent(rows: readonly ConsentRow[]): OptionalConsent {
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

/** 선택 동의 하나의 상태를 읽는다 */
export async function readOptionalConsent(
  db: Pick<Db, 'select'>,
  userId: string,
  accountType: AccountType,
  termsType: OptionalTerms,
): Promise<OptionalConsent> {
  const rows = await db
    .select({ agreedAt: termsAgreements.agreedAt, withdrawnAt: termsAgreements.withdrawnAt })
    .from(termsAgreements)
    .where(consentOf(userId, accountType, termsType));
  return toOptionalConsent(rows);
}

/** 두 선택 동의의 상태를 한 번에 읽는다(내 정보 알림 설정) */
export async function readOptionalConsents(
  db: Pick<Db, 'select'>,
  userId: string,
  accountType: AccountType,
): Promise<OptionalConsents> {
  const rows = await db
    .select({
      termsType: termsAgreements.termsType,
      agreedAt: termsAgreements.agreedAt,
      withdrawnAt: termsAgreements.withdrawnAt,
    })
    .from(termsAgreements)
    .where(
      and(
        eq(termsAgreements.userId, userId),
        eq(termsAgreements.accountType, accountType),
        inArray(termsAgreements.termsType, [...OPTIONAL_CUSTOMER_TERMS]),
      ),
    );
  return {
    interest_alert: toOptionalConsent(rows.filter((r) => r.termsType === 'interest_alert')),
    marketing: toOptionalConsent(rows.filter((r) => r.termsType === 'marketing')),
  };
}

/** 광고성 정보 수신(marketing) 동의 상태를 읽는다 */
export function readMarketingConsent(
  db: Pick<Db, 'select'>,
  userId: string,
  accountType: AccountType,
): Promise<MarketingConsent> {
  return readOptionalConsent(db, userId, accountType, 'marketing');
}

/**
 * 선택 동의 하나를 켜거나 끈다. 켜면 동의 기록을 새로 더하고(이미 켜져 있으면 그대로),
 * 끄면 철회하지 않은 기록에 철회 시각을 남긴다. 기록은 지우지 않는다. 트랜잭션 안에서 부른다
 */
export async function writeOptionalConsent(
  tx: Db,
  userId: string,
  accountType: AccountType,
  termsType: OptionalTerms,
  agree: boolean,
): Promise<OptionalConsent> {
  const current = await readOptionalConsent(tx, userId, accountType, termsType);
  if (current.agreed === agree) return current;

  if (agree) {
    await tx.insert(termsAgreements).values({
      userId,
      accountType,
      termsType,
      version: TERMS_VERSIONS[termsType],
    });
  } else {
    await tx
      .update(termsAgreements)
      .set({ withdrawnAt: sql`now()` })
      .where(and(consentOf(userId, accountType, termsType), isNull(termsAgreements.withdrawnAt)));
  }
  return readOptionalConsent(tx, userId, accountType, termsType);
}

/** 광고성 정보 수신(marketing) 동의를 켜거나 끈다 */
export function writeMarketingConsent(
  tx: Db,
  userId: string,
  accountType: AccountType,
  agree: boolean,
): Promise<MarketingConsent> {
  return writeOptionalConsent(tx, userId, accountType, 'marketing', agree);
}

function consentOf(userId: string, accountType: AccountType, termsType: OptionalTerms) {
  return and(
    eq(termsAgreements.userId, userId),
    eq(termsAgreements.accountType, accountType),
    eq(termsAgreements.termsType, termsType),
  );
}

/**
 * 원장님 가입 때 남기는 약관 동의(S-101, 동의 문구 2장, 10/28 결정). 화면의 필수 3개 중 '정산을 위한 정보 제공'은
 * supplier(원장님 이용약관)에 포함해서 두 줄로 남긴다. 고객용 이용약관(service)과 광고성 정보 수신(marketing)은 받지 않는다
 */
export const OWNER_TERMS = ['supplier', 'privacy'] as const satisfies readonly TermsType[];

export type NewOwnerAccount = {
  userId: string;
  owner: { name: string; phone: string };
  /** 화면에서 받은 값과 서버가 주소로 만든 좌표·지역(geocodeAddress) */
  shop: {
    name: string;
    category: string;
    phone: string;
    roadAddress: string;
    jibunAddress: string | null;
    addressDetail: string | null;
    sido: string;
    sigungu: string;
    sigunguCode: string;
    location: GeoPoint;
    businessName: string;
    representativeName: string;
    businessRegistrationNumber: string;
    openedOn: string;
    businessDocPath: string;
  };
  /** 계좌번호는 암호화한 값만 받는다 */
  payout: {
    bankCode: string;
    accountNumberEncrypted: string;
    accountLast4: string;
    accountHolder: string;
  };
};

/**
 * 원장님 계정·샵·정산 계좌·약관 동의를 저장한다(S-101, S-107). 이미 원장님 계정이 있으면 아무것도 저장하지 않고 null.
 * 샵은 승인 대기(pending)·영업시간 빈 목록·PG 셀러 등록 전(not_registered)으로 시작한다(DB 기본값).
 * 모두 함께 저장되도록 트랜잭션 안에서 부른다
 */
export async function saveOwnerAccount(
  tx: Db,
  input: NewOwnerAccount,
): Promise<{ ownerId: string; shopId: string } | null> {
  const [owner] = await tx
    .insert(owners)
    .values({ userId: input.userId, ...input.owner })
    .onConflictDoNothing({ target: owners.userId })
    .returning({ id: owners.id });
  if (!owner) return null;

  const [shop] = await tx
    .insert(shops)
    .values({ ownerId: owner.id, ...input.shop })
    .returning({ id: shops.id });
  await tx.insert(payoutAccounts).values({ shopId: shop.id, ...input.payout });

  await tx.insert(termsAgreements).values(
    OWNER_TERMS.map((termsType) => ({
      userId: input.userId,
      accountType: 'owner' as const,
      termsType,
      version: TERMS_VERSIONS[termsType],
    })),
  );
  return { ownerId: owner.id, shopId: shop.id };
}
