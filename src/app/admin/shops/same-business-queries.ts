// 운영자 입점 심사(샵 상세)의 '같은 사업자등록번호의 다른 샵' 칸(#154, 기술 가이드 7장 "재가입과 악용 막기"). 서버에서만 부른다.
// 원장님이 탈퇴하고 30일 뒤 같은 사업자로 다시 입점 신청하면, 운영자가 예전 샵의 원장님 사정 취소 기록을 볼 수 있게 한다.
// 사업자등록번호는 탈퇴 30일 뒤 개인정보를 지울 때도 남기는 값이라(5년, #154 본문 4장) 지운 샵도 찾는다. 읽기만 한다.

import 'server-only';

import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { ownerPenalties, owners, reservations, shops, slots } from '@/db/schema';
import type { ShopStatus } from '@/db/schema/shops';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 한 번에 보여 주는 다른 샵 수(같은 사업자로 이만큼 넘게 다시 신청하는 일은 없다) */
export const SAME_BUSINESS_SHOP_LIMIT = 20;

export type SameBusinessShop = {
  shopId: string;
  name: string;
  status: ShopStatus;
  /** 입점 신청(다시 신청 포함) 시각 */
  appliedAt: Date;
  /** 그 샵 원장님 계정이 탈퇴한 시각. 탈퇴하지 않았으면 null */
  ownerWithdrawnAt: Date | null;
  /** 원장님 사정 취소(X-207) 건수(전체 기간) */
  ownerFaultCount: number;
  /** 아직 걷지 못한 원장님 사정 취소 패널티 합계(원) */
  unpaidPenalty: number;
};

/**
 * 이 샵과 사업자등록번호가 같은 다른 샵(상태와 상관없이, 신청이 늦은 것부터). 번호는 숫자만 비교한다
 * (지금 저장은 숫자 10자리, 시드처럼 하이픈을 넣어 저장된 번호도 같은 번호로 본다). 번호가 비었으면 빈 목록
 */
export async function selectSameBusinessShops(
  db: DbReader,
  input: { shopId: string; businessRegistrationNumber: string },
): Promise<SameBusinessShop[]> {
  const digits = input.businessRegistrationNumber.replace(/\D/g, '');
  if (!digits) return [];
  const rows = await db
    .select({
      shopId: shops.id,
      name: shops.name,
      status: shops.status,
      appliedAt: shops.appliedAt,
      ownerWithdrawnAt: owners.withdrawnAt,
      ownerFaultCount: sql<number>`(
        select count(*) from ${reservations}
        inner join ${slots} on ${slots.id} = ${reservations.slotId}
        where ${slots.shopId} = ${shops.id} and ${reservations.cancelActor} = 'owner_fault'
      )`.mapWith(Number),
      unpaidPenalty: sql<number>`(
        select coalesce(sum(${ownerPenalties.amount} - ${ownerPenalties.collectedAmount}), 0)
        from ${ownerPenalties}
        where ${and(eq(ownerPenalties.shopId, shops.id), isNull(ownerPenalties.fullyCollectedAt))}
      )`.mapWith(Number),
    })
    .from(shops)
    .innerJoin(owners, eq(owners.id, shops.ownerId))
    .where(
      and(
        ne(shops.id, '00000000-0000-0000-0000-000000000000'),
        sql`regexp_replace(${shops.businessRegistrationNumber}, '[^0-9]', '', 'g') = ${digits}`,
      ),
    )
    .orderBy(desc(shops.appliedAt), desc(shops.id))
    .limit(SAME_BUSINESS_SHOP_LIMIT);
  // status는 DB 제약(shops_status_check)으로 정해진 값만 들어간다
  return rows.map((row) => ({ ...row, status: row.status as ShopStatus }));
}
