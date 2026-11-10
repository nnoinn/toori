// 운영자의 승인된 샵 사업자 정보 수정: DB 읽기·저장 (#50 4장, W18). 서버에서만 부른다. 확인은 business-info.ts가 한다.

import 'server-only';

import { eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { adminActions, payoutAccounts, shops } from '@/db/schema';
import type { ShopStatus } from '@/db/schema/shops';

type Tx = Pick<ReturnType<typeof getDb>, 'select' | 'update' | 'insert'>;

/** 운영자가 고칠 수 있는 사업자 정보 칸 */
export const BUSINESS_FIELDS = [
  'businessName',
  'representativeName',
  'businessRegistrationNumber',
  'openedOn',
  'businessDocPath',
] as const;
export type BusinessField = (typeof BUSINESS_FIELDS)[number];
export type BusinessValues = Record<BusinessField, string>;

/** 작업 기록에 남기는 칸 이름 */
export const BUSINESS_FIELD_LABELS: Record<BusinessField, string> = {
  businessName: '상호',
  representativeName: '대표자명',
  businessRegistrationNumber: '사업자등록번호',
  openedOn: '개업일자',
  businessDocPath: '사업자등록증',
};

/** 실패 코드와 화면 문구 */
export const BUSINESS_UPDATE_ERRORS = {
  INVALID_STATUS:
    '승인된 샵만 운영자가 사업자 정보를 고쳐요. 승인 전에는 원장님이 직접 고쳐서 다시 신청해요',
  NO_CHANGE: '바뀐 내용이 없어요',
} as const;

/** 지금 사업자 정보와 샵 상태. 두 운영자가 같은 샵을 동시에 고치지 않게 그 줄을 잠근다(트랜잭션 안에서 부른다) */
export async function lockBusinessInfo(
  tx: Tx,
  shopId: string,
): Promise<(BusinessValues & { status: ShopStatus }) | null> {
  const [row] = await tx
    .select({
      status: shops.status,
      businessName: shops.businessName,
      representativeName: shops.representativeName,
      businessRegistrationNumber: shops.businessRegistrationNumber,
      openedOn: shops.openedOn,
      businessDocPath: shops.businessDocPath,
    })
    .from(shops)
    .where(eq(shops.id, shopId))
    .for('update');
  // DB의 check 제약이 정해진 상태만 허용한다
  return row ? { ...row, status: row.status as ShopStatus } : null;
}

/**
 * 바뀐 칸만 저장하고 운영자 작업 기록(shop.business_update)을 남긴다. 트랜잭션 안에서 부른다.
 * 기록에는 사유와 바뀐 칸 이름만 남기고 이전 값은 남기지 않는다(대표자 이름 같은 개인정보가 기록에 쌓이지 않게)
 */
export async function saveBusinessUpdate(
  tx: Tx,
  input: {
    shopId: string;
    adminId: string;
    values: Partial<BusinessValues>;
    changed: readonly BusinessField[];
    reason: string;
  },
): Promise<void> {
  await tx.update(shops).set(input.values).where(eq(shops.id, input.shopId));
  if (input.changed.includes('businessRegistrationNumber')) {
    // 지급대행 셀러는 사업자등록번호로 등록한다. 새 번호로 다시 등록하기 전까지 지급을 요청하지 않게 '등록 전'으로 돌린다(#50 4장)
    await tx
      .update(payoutAccounts)
      .set({ pgSellerStatus: 'not_registered', pgSellerCheckedAt: null })
      .where(eq(payoutAccounts.shopId, input.shopId));
  }
  const labels = input.changed.map((field) => BUSINESS_FIELD_LABELS[field]).join(', ');
  await tx.insert(adminActions).values({
    adminId: input.adminId,
    action: 'shop.business_update',
    targetType: 'shop',
    targetId: input.shopId,
    memo: `${input.reason} (바꾼 항목: ${labels})`,
  });
}
