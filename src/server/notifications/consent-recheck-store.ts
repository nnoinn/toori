// 2년마다 광고성 정보 수신 동의 확인(#535)에 쓸 동의 읽기. 서버에서만 부른다. 보내기는 consent-recheck.ts가 한다.

import 'server-only';

import { and, asc, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';

import type { getDb } from '@/db';
import { customers, notifications, termsAgreements } from '@/db/schema';
import { OPTIONAL_CONSENT_NAMES, type OptionalConsentType } from '@/server/policy/terms';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 확인 알림을 받을 수 있는 동의 하나 */
export type RecheckAgreement = {
  agreementId: string;
  userId: string;
  termsType: OptionalConsentType;
  agreedAt: Date;
};

const OPTIONAL_CONSENT_TYPES = Object.keys(OPTIONAL_CONSENT_NAMES) as OptionalConsentType[];

/**
 * 지금 켜져 있는 고객의 광고성 정보 수신 동의(이벤트·혜택 소식, 관심 동네·찜한 샵 새 매물 알림) 중 agreedBefore 전에 동의한 것.
 * 철회한 동의와 탈퇴한 고객 계정은 뺀다. 원장님 계정은 이 동의가 없다. 동의 순서
 */
export async function readRecheckAgreements(
  db: DbReader,
  input: { agreedBefore: Date },
): Promise<RecheckAgreement[]> {
  const rows = await db
    .select({
      agreementId: termsAgreements.id,
      userId: termsAgreements.userId,
      termsType: termsAgreements.termsType,
      agreedAt: termsAgreements.agreedAt,
    })
    .from(termsAgreements)
    .innerJoin(customers, eq(customers.userId, termsAgreements.userId))
    .where(
      and(
        or(eq(termsAgreements.accountType, 'customer'), eq(termsAgreements.accountType, 'owner')),
        inArray(termsAgreements.termsType, OPTIONAL_CONSENT_TYPES),
        isNull(termsAgreements.withdrawnAt),
        lt(termsAgreements.agreedAt, input.agreedBefore),
        or(isNull(customers.withdrawnAt), isNotNull(customers.withdrawnAt)),
      ),
    )
    .orderBy(asc(termsAgreements.agreedAt), asc(termsAgreements.id));
  return rows.map((row) => ({ ...row, termsType: row.termsType as OptionalConsentType }));
}

/** keys 중 이미 보낸 알림의 dedupe_key */
export async function readSentDedupeKeys(
  db: DbReader,
  keys: readonly string[],
): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await db
    .select({ key: notifications.dedupeKey })
    .from(notifications)
    .where(inArray(notifications.dedupeKey, [...keys]));
  return new Set(rows.map((row) => row.key));
}
