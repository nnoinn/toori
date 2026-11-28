// 첫 로그인 안내(C-107)를 봤는지 읽고 남긴다. 고객 화면에서만 쓰는 서버 코드라 고객 화면 폴더에 둔다(#616 제안).
// 고객 계정의 customers.onboarding_seen_at(#623)을 쓴다. 비어 있으면 아직 안 봤다.
// 계정에 남겨서 다른 기기로 로그인해도 다시 뜨지 않는다. 내 정보에서 다시 볼 때는 바꾸지 않는다.
// 본인 고객 계정만 다룬다(X-102). customerId는 getCurrentAccount()·requireCustomer()에서 받은 값을 넘긴다

import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { customers } from '@/db/schema';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'update'>;

/** 첫 로그인 안내를 봤는지(끝까지 넘기거나 닫았는지). 계정이 없으면 본 것으로 본다(띄우지 않는다) */
export async function selectOnboardingSeen(db: Db, customerId: string): Promise<boolean> {
  const [row] = await db
    .select({ seenAt: customers.onboardingSeenAt })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return !row || row.seenAt !== null;
}

/** 안내를 본 시각을 남긴다. 이미 남겼으면 처음 시각을 그대로 둔다 */
export async function markOnboardingSeen(db: Db, customerId: string): Promise<void> {
  await db
    .update(customers)
    .set({ onboardingSeenAt: sql`now()` })
    .where(and(eq(customers.id, customerId), isNull(customers.onboardingSeenAt)));
}
