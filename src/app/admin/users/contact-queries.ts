// 운영자 [번호 보기](#360 4번)가 읽는 연락처. 서버 함수(contact-actions.ts)에서만 부른다.

import 'server-only';

import { eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { customers, owners, profiles, shops } from '@/db/schema';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 고객의 이메일·휴대폰 번호. 없는 고객이면 null */
export async function selectCustomerContact(
  db: DbReader,
  customerId: string,
): Promise<{ email: string | null; phone: string | null } | null> {
  const [row] = await db
    .select({ email: profiles.email, phone: customers.phone })
    .from(customers)
    .innerJoin(profiles, eq(profiles.id, customers.userId))
    .where(eq(customers.id, customerId));
  return row ?? null;
}

/** 샵 원장님의 id와 휴대폰 번호(입점 심사 화면의 연락처). 없는 샵이면 null. 탈퇴하고 30일이 지나 지운 번호는 null(#154) */
export async function selectShopOwnerContact(
  db: DbReader,
  shopId: string,
): Promise<{ ownerId: string; phone: string | null } | null> {
  const [row] = await db
    .select({ ownerId: owners.id, phone: owners.phone })
    .from(shops)
    .innerJoin(owners, eq(owners.id, shops.ownerId))
    .where(eq(shops.id, shopId));
  return row ?? null;
}
