// 입점 심사 조회 (A-101, 연결 #13 #50). 운영자 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 화면(page)이 ensureAdminPage()로 관리자를 확인한 뒤 부른다. db를 받아서 테스트(withRollback)에서도 같은 조회를 쓴다.
// 정산 계좌는 은행·뒷자리 4개·예금주만 읽는다(계좌번호 암호문은 읽지 않는다, 10/29 결정).

import 'server-only';

import { and, asc, count, desc, eq, type SQL } from 'drizzle-orm';

import type { getDb } from '@/db';
import { adminActions, owners, payoutAccounts, shops, type ShopStatus } from '@/db/schema';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 목록 탭. 주소 ?status= 값 */
export const REVIEW_FILTERS = ['pending', 'rejected', 'approved', 'all'] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

/** 한 번에 보여줄 최대 개수. MVP는 샵 수가 적어서 페이지를 나누지 않는다 */
const LIST_LIMIT = 200;

export type ShopReviewRow = {
  shopId: string;
  name: string;
  category: string;
  businessName: string;
  sigungu: string;
  status: ShopStatus;
  appliedAt: Date;
  reviewedAt: Date | null;
};

/**
 * 입점 심사 목록. 승인 대기는 오래 기다린 순(신청 시각 오래된 것부터),
 * 반려·승인은 최근 심사 순, 전체는 최근 신청 순
 */
export async function selectShopsForReview(
  db: DbReader,
  filter: ReviewFilter,
): Promise<ShopReviewRow[]> {
  const where: SQL | undefined = filter === 'all' ? undefined : eq(shops.status, filter);
  const order =
    filter === 'pending'
      ? [asc(shops.appliedAt)]
      : filter === 'all'
        ? [desc(shops.appliedAt)]
        : [desc(shops.reviewedAt), desc(shops.appliedAt)];
  const rows = await db
    .select({
      shopId: shops.id,
      name: shops.name,
      category: shops.category,
      businessName: shops.businessName,
      sigungu: shops.sigungu,
      status: shops.status,
      appliedAt: shops.appliedAt,
      reviewedAt: shops.reviewedAt,
    })
    .from(shops)
    .where(where)
    .orderBy(...order)
    .limit(LIST_LIMIT);
  // DB의 check 제약이 3가지 상태만 허용한다
  return rows.map((row) => ({ ...row, status: row.status as ShopStatus }));
}

/** 승인 대기 샵 수(운영자 첫 화면) */
export async function countPendingShops(db: DbReader): Promise<number> {
  const [row] = await db.select({ n: count() }).from(shops).where(eq(shops.status, 'pending'));
  return row?.n ?? 0;
}

export type ShopReviewDetail = {
  shopId: string;
  status: ShopStatus;
  appliedAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  business: {
    businessName: string;
    representativeName: string;
    businessRegistrationNumber: string;
    openedOn: string;
  };
  owner: { name: string; phone: string };
  shop: {
    name: string;
    category: string;
    phone: string;
    roadAddress: string;
    addressDetail: string | null;
    sido: string;
    sigungu: string;
  };
  /** 은행·뒷자리 4개·예금주만. 가입 때 필수라 보통 있지만 시드 샵에는 없을 수 있다 */
  payout: {
    bankCode: string;
    accountLast4: string;
    accountHolder: string;
    pgSellerStatus: string;
  } | null;
  /** 운영자 작업 기록(승인·반려), 최근 것부터 */
  history: { action: string; memo: string | null; createdAt: Date }[];
};

/** 입점 심사 상세. 없는 샵이면 null */
export async function selectShopForReview(
  db: DbReader,
  shopId: string,
): Promise<ShopReviewDetail | null> {
  const [row] = await db
    .select({
      shopId: shops.id,
      status: shops.status,
      appliedAt: shops.appliedAt,
      reviewedAt: shops.reviewedAt,
      rejectionReason: shops.rejectionReason,
      businessName: shops.businessName,
      representativeName: shops.representativeName,
      businessRegistrationNumber: shops.businessRegistrationNumber,
      openedOn: shops.openedOn,
      ownerName: owners.name,
      ownerPhone: owners.phone,
      name: shops.name,
      category: shops.category,
      phone: shops.phone,
      roadAddress: shops.roadAddress,
      addressDetail: shops.addressDetail,
      sido: shops.sido,
      sigungu: shops.sigungu,
      bankCode: payoutAccounts.bankCode,
      accountLast4: payoutAccounts.accountLast4,
      accountHolder: payoutAccounts.accountHolder,
      pgSellerStatus: payoutAccounts.pgSellerStatus,
    })
    .from(shops)
    .innerJoin(owners, eq(owners.id, shops.ownerId))
    .leftJoin(payoutAccounts, eq(payoutAccounts.shopId, shops.id))
    .where(eq(shops.id, shopId))
    .limit(1);
  if (!row) return null;

  const history = await db
    .select({
      action: adminActions.action,
      memo: adminActions.memo,
      createdAt: adminActions.createdAt,
    })
    .from(adminActions)
    .where(and(eq(adminActions.targetType, 'shop'), eq(adminActions.targetId, shopId)))
    .orderBy(desc(adminActions.createdAt));

  return {
    shopId: row.shopId,
    status: row.status as ShopStatus,
    appliedAt: row.appliedAt,
    reviewedAt: row.reviewedAt,
    rejectionReason: row.rejectionReason,
    business: {
      businessName: row.businessName,
      representativeName: row.representativeName,
      businessRegistrationNumber: row.businessRegistrationNumber,
      openedOn: row.openedOn,
    },
    owner: { name: row.ownerName, phone: row.ownerPhone },
    shop: {
      name: row.name,
      category: row.category,
      phone: row.phone,
      roadAddress: row.roadAddress,
      addressDetail: row.addressDetail,
      sido: row.sido,
      sigungu: row.sigungu,
    },
    payout:
      row.bankCode && row.accountLast4 && row.accountHolder && row.pgSellerStatus
        ? {
            bankCode: row.bankCode,
            accountLast4: row.accountLast4,
            accountHolder: row.accountHolder,
            pgSellerStatus: row.pgSellerStatus,
          }
        : null,
    history,
  };
}
