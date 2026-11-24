// 탈퇴 30일 뒤 개인정보 지우기 저장과 조회 (#154 본문 4장, 0023). 서버에서만 부른다. withdrawal-erase.ts가 부른다.
// 지우는 것: 고객 이름·닉네임("탈퇴한 회원")·휴대폰, 원장님 이름("탈퇴한 회원")·휴대폰, 사업자등록증·샵 사진, 정산 계좌번호·예금주,
// 샵 소개·메뉴 설명. 두 계정이 모두 탈퇴하고 30일이 지나면 로그인 이메일도.
// 남기는 것(5년): 주문·예약·결제·환불, 정산, 상호·대표자명·사업자등록번호·샵 주소, 정산 계좌의 은행·뒷자리, 같은 사람 표시

import 'server-only';

import { and, asc, eq, exists, isNotNull, isNull, lte, not, or, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  accountWithdrawals,
  customers,
  menus,
  owners,
  payoutAccounts,
  profiles,
  shopImages,
  shops,
} from '@/db/schema';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;
type Tx = Pick<ReturnType<typeof getDb>, 'select' | 'update' | 'delete'>;

/** 지운 이름 칸에 넣는 글자(#154 본문 4장) */
export const ERASED_NAME = '탈퇴한 회원';

/** 지울 차례인 탈퇴 기록 하나 */
export type DueWithdrawal = {
  id: string;
  userId: string;
  accountType: 'customer' | 'owner';
  customerId: string | null;
  ownerId: string | null;
};

/** 되살리지도 지우지도 않았고 before 전에 탈퇴한 기록. 오래된 것부터 limit개 */
export async function readDueWithdrawals(
  db: DbReader,
  input: { before: Date; limit: number },
): Promise<DueWithdrawal[]> {
  const rows = await db
    .select({
      id: accountWithdrawals.id,
      userId: accountWithdrawals.userId,
      accountType: accountWithdrawals.accountType,
      customerId: accountWithdrawals.customerId,
      ownerId: accountWithdrawals.ownerId,
    })
    .from(accountWithdrawals)
    .where(
      and(
        isNull(accountWithdrawals.restoredAt),
        isNull(accountWithdrawals.erasedAt),
        lte(accountWithdrawals.withdrawnAt, new Date(input.before.getTime() - 1)),
      ),
    )
    .orderBy(asc(accountWithdrawals.withdrawnAt), asc(accountWithdrawals.id))
    .limit(input.limit);
  // account_type은 DB 제약으로 customer·owner만 들어간다
  return rows.map((row) => ({ ...row, accountType: row.accountType as 'customer' | 'owner' }));
}

/**
 * 탈퇴 기록이 아직 끝나지 않았으면 잠그고 로그인 이메일을 읽는다. 그 사이 되살렸거나 지웠으면 null.
 * 되살리기(lockOpenWithdrawal)도 같은 줄을 잠가서 겹치지 않는다
 */
export async function lockDueWithdrawal(
  tx: Tx,
  withdrawalId: string,
): Promise<{ email: string | null } | null> {
  const [row] = await tx
    .select({ email: profiles.email })
    .from(accountWithdrawals)
    .innerJoin(profiles, eq(profiles.id, accountWithdrawals.userId))
    .where(
      and(
        eq(accountWithdrawals.id, withdrawalId),
        isNull(accountWithdrawals.restoredAt),
        isNull(accountWithdrawals.erasedAt),
      ),
    )
    .for('update', { of: accountWithdrawals });
  return row ?? null;
}

async function finish(tx: Tx, withdrawalId: string, now: Date) {
  await tx
    .update(accountWithdrawals)
    .set({ erasedAt: now })
    .where(eq(accountWithdrawals.id, withdrawalId));
}

/** 고객 계정의 개인정보를 지우고 탈퇴 기록을 끝낸다. lockDueWithdrawal로 잠근 뒤 부른다 */
export async function eraseCustomerData(
  tx: Tx,
  input: { withdrawalId: string; customerId: string; now: Date },
): Promise<void> {
  await tx
    .update(customers)
    .set({ name: ERASED_NAME, nickname: ERASED_NAME })
    .where(and(eq(customers.id, input.customerId), isNotNull(customers.withdrawnAt)));
  await finish(tx, input.withdrawalId, input.now);
}

/**
 * 원장님 계정과 샵의 개인정보를 지우고 탈퇴 기록을 끝낸다. 저장소에서 지울 파일 경로(등록증·샵 사진)를 돌려준다.
 * 파일은 트랜잭션이 끝난 뒤 부른 쪽이 지운다. lockDueWithdrawal로 잠근 뒤 부른다
 */
export async function eraseOwnerData(
  tx: Tx,
  input: { withdrawalId: string; ownerId: string; now: Date },
): Promise<{ businessDocPaths: string[]; shopImagePaths: string[] }> {
  const { ownerId } = input;
  await tx
    .update(owners)
    .set({ name: ERASED_NAME, phone: null })
    .where(and(eq(owners.id, ownerId), isNotNull(owners.withdrawnAt)));

  const ownShops = await tx
    .select({ id: shops.id, businessDocPath: shops.businessDocPath })
    .from(shops)
    .where(and(eq(shops.ownerId, ownerId), eq(shops.status, 'withdrawn')));
  const businessDocPaths: string[] = [];
  const shopImagePaths: string[] = [];
  for (const shop of ownShops) {
    if (shop.businessDocPath) businessDocPaths.push(shop.businessDocPath);
    await tx
      .update(shops)
      .set({ businessDocPath: null, description: null })
      .where(eq(shops.id, shop.id));
    await tx
      .update(payoutAccounts)
      .set({ accountNumberEncrypted: null, accountHolder: null })
      .where(eq(payoutAccounts.shopId, ownerId));
    await tx.update(menus).set({ description: null }).where(eq(menus.shopId, shop.id));
    const images = await tx
      .delete(shopImages)
      .where(eq(shopImages.shopId, shop.id))
      .returning({ path: shopImages.storagePath });
    shopImagePaths.push(...images.map((image) => image.path));
  }
  await finish(tx, input.withdrawalId, input.now);
  return { businessDocPaths, shopImagePaths };
}

/**
 * 로그인 정보를 지울 사람: 탈퇴 기록이 있고, 탈퇴하지 않은 고객·원장님 계정이 없고, 끝나지 않은(30일이 안 됐거나 아직 지우지 않은)
 * 탈퇴 기록도 없고, 아직 이메일이 남은 사람. 운영자는 뺀다. limit명
 */
export async function readProfilesToForget(
  db: DbReader,
  input: { limit: number },
): Promise<{ userId: string }[]> {
  const one = { one: sql`1` };
  const withdrawals = (open: boolean) =>
    db
      .select(one)
      .from(accountWithdrawals)
      .where(
        and(
          eq(accountWithdrawals.userId, profiles.id),
          open
            ? and(isNull(accountWithdrawals.restoredAt), isNull(accountWithdrawals.erasedAt))
            : undefined,
        ),
      );
  const activeCustomer = db
    .select(one)
    .from(customers)
    .where(and(eq(customers.userId, profiles.id), isNull(customers.withdrawnAt)));
  const activeOwner = db
    .select(one)
    .from(owners)
    .where(and(eq(owners.userId, profiles.id), isNull(owners.withdrawnAt)));
  return db
    .select({ userId: profiles.id })
    .from(profiles)
    .where(
      and(
        isNotNull(profiles.email),
        eq(profiles.isAdmin, false),
        exists(withdrawals(false)),
        not(exists(withdrawals(true))),
        not(exists(activeCustomer)),
        or(not(exists(activeOwner)), exists(activeOwner)),
      ),
    )
    .orderBy(asc(profiles.id))
    .limit(input.limit);
}

/** 로그인 정보를 지운 뒤 이메일을 비운다(같은 사람 표시는 남긴다) */
export async function forgetProfileEmail(
  db: Pick<ReturnType<typeof getDb>, 'update'>,
  userId: string,
): Promise<void> {
  await db.update(profiles).set({ email: null }).where(eq(profiles.id, userId));
}
