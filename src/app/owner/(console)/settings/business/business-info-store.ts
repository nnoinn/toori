// 매장 설정 > 사업자 정보 읽기·저장 (DB, O7 ②, S-101·S-102, #23 D19). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 사업자 정보(상호·대표자명·사업자등록번호·개업일자·등록증)는 승인 대기·반려일 때만 원장님이 고친다(기술 가이드 7장
// "승인 후 사업자 정보 수정"). 승인 뒤에는 운영자만 바꾼다(W18). 저장 문장에 상태 조건을 넣어서, 운영자가 승인하는 순간과
// 겹쳐도 승인된 정보는 바뀌지 않는다.

import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { getDb } from '@/db';
import { shops } from '@/db/schema';
import type { ShopStatus } from '@/db/schema/shops';

import type { BusinessInput } from '../../../business-fields';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'update'>;

/** 원장님이 사업자 정보를 고칠 수 있는 입점 상태 */
export const BUSINESS_EDITABLE_STATUSES = ['pending', 'rejected'] as const satisfies ShopStatus[];

export type BusinessInfo = BusinessInput & {
  status: ShopStatus;
  rejectionReason: string | null;
};

export async function selectBusinessInfo(
  db: Pick<Db, 'select'>,
  shopId: string,
): Promise<BusinessInfo | null> {
  const [row] = await db
    .select({
      businessName: shops.businessName,
      representativeName: shops.representativeName,
      businessRegistrationNumber: shops.businessRegistrationNumber,
      openedOn: shops.openedOn,
      businessDocPath: shops.businessDocPath,
      status: shops.status,
      rejectionReason: shops.rejectionReason,
    })
    .from(shops)
    .where(eq(shops.id, shopId));
  // status는 DB 제약(shops_status_check)으로 세 값만 들어간다
  return row ? { ...row, status: row.status as ShopStatus } : null;
}

/** 사업자 정보를 저장한다. 그 샵이 아니거나 승인 대기·반려가 아니면(승인됨) 바꾸지 않고 false */
export async function updateBusinessInfo(
  db: Pick<Db, 'update'>,
  shopId: string,
  values: BusinessInput,
): Promise<boolean> {
  const rows = await db
    .update(shops)
    .set(values)
    .where(and(eq(shops.id, shopId), inArray(shops.status, BUSINESS_EDITABLE_STATUSES)))
    .returning({ id: shops.id });
  return rows.length > 0;
}
