// 매물 상세 조회 (J7, C-301~C-305, C-308). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 승인 샵(#50)·신규 고객 전용(#49) 조건에 걸리는 매물은 주소로 바로 들어와도 없는 매물처럼 null(404)이다.
// 게시 전(게시예정) 매물도 고객에게 보이지 않는다. 예약됨·마감·취소·완료는 보여 주되 예약할 수 없다(closed).
// selectSlotDetail은 DB를 받아서 테스트(withRollback)에서도 같은 조회를 쓸 수 있게 했다.

import 'server-only';

import { and, asc, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { shopImages, shops, slots } from '@/db/schema';
import { isHeldByMe, isHeldByOther, slotBadges } from '@/features/map/slot-list/badges';
import { shopImageUrl } from '@/features/map/slot-list/image-url';
import { getSlotStatus, type SlotStatus } from '@/features/slot-status/slot-status';
import { newCustomerOnlyVisible } from '@/server/customers';
import { categoryLabel, serviceTypeLabel } from '@/server/policy';
import { customerVisibleShop } from '@/server/shops/visibility';

import { slotPhotoRows } from './detail-format';
import type { SlotAvailability, SlotDetail } from './types';

export type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type SlotDetailQuery = {
  slotId: string;
  /** 로그인한 고객 계정. 없으면(로그인 안 함, 원장님 모드) 신규 고객 전용도 거르지 않는다(#49 3장) */
  customerId: string | null;
  now: Date;
};

/** 대표 이미지 먼저, 그다음 스타일 이미지. 같은 종류끼리는 원장님이 정한 순서 */
const imageOrder = [
  sql`case when ${shopImages.kind} = 'main' then 0 else 1 end`,
  asc(shopImages.sortOrder),
];

export async function selectSlotDetail(
  db: DbReader,
  query: SlotDetailQuery,
): Promise<SlotDetail | null> {
  const [row] = await db
    .select({
      slotId: slots.id,
      status: slots.status,
      publishAt: slots.publishAt,
      startAt: slots.startAt,
      listPrice: slots.listPrice,
      salePrice: slots.salePrice,
      discountRate: slots.discountRate,
      newCustomerOnly: slots.newCustomerOnly,
      holdCustomerId: slots.holdCustomerId,
      holdExpiresAt: slots.holdExpiresAt,
      menuId: slots.menuId,
      menuName: slots.menuName,
      serviceType: slots.serviceType,
      menuDescription: slots.menuDescription,
      durationMinutes: slots.durationMinutes,
      shopId: shops.id,
      shopName: shops.name,
      category: shops.category,
      sigunguCode: shops.sigunguCode,
      roadAddress: shops.roadAddress,
      addressDetail: shops.addressDetail,
      phone: shops.phone,
      lat: sql<number>`ST_Y(${shops.location}::geometry)`.mapWith(Number),
      lng: sql<number>`ST_X(${shops.location}::geometry)`.mapWith(Number),
      businessHours: shops.businessHours,
      description: shops.description,
      instagramUrl: shops.instagramUrl,
      naverPlaceUrl: shops.naverPlaceUrl,
    })
    .from(slots)
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(
      and(
        eq(slots.id, query.slotId),
        customerVisibleShop(),
        newCustomerOnlyVisible(query.customerId),
      ),
    )
    .limit(1);
  if (!row) return null;

  // DB의 check 제약이 6가지 상태만 허용한다
  const status = getSlotStatus({ ...row, status: row.status as SlotStatus }, query.now);
  if (status === 'scheduled') return null;

  // 그 매물 메뉴의 시술 사진만, 없으면 샵 사진 전체(C-309 ②)
  const imageUrls = toImageUrls(slotPhotoRows(await selectShopImages(db, row.shopId), row.menuId));

  return {
    slotId: row.slotId,
    availability: availabilityOf(status, row, query),
    badges: status === 'published' ? slotBadges(row, query.customerId, query.now) : [],
    startAt: row.startAt.toISOString(),
    listPrice: row.listPrice,
    salePrice: row.salePrice,
    discountRate: row.discountRate,
    menu: {
      name: row.menuName,
      serviceType: serviceTypeLabel(row.serviceType),
      description: row.menuDescription,
      durationMinutes: row.durationMinutes,
    },
    shopCategory: categoryLabel(row.category),
    sigunguCode: row.sigunguCode,
    shop: {
      shopId: row.shopId,
      name: row.shopName,
      roadAddress: row.roadAddress,
      addressDetail: row.addressDetail,
      phone: row.phone,
      lat: row.lat,
      lng: row.lng,
      businessHours: row.businessHours,
      description: row.description,
      instagramUrl: row.instagramUrl,
      naverPlaceUrl: row.naverPlaceUrl,
    },
    imageUrls,
  };
}

/** 샵 사진 줄(저장 경로와 묶인 메뉴): 대표 사진 먼저, 그다음 스타일 사진(원장님이 정한 순서) */
async function selectShopImages(db: DbReader, shopId: string) {
  return db
    .select({ storagePath: shopImages.storagePath, menuId: shopImages.menuId })
    .from(shopImages)
    .where(eq(shopImages.shopId, shopId))
    .orderBy(...imageOrder);
}

function toImageUrls(images: readonly { storagePath: string }[]): string[] {
  return images
    .map((image) => shopImageUrl(image.storagePath))
    .filter((url): url is string => url !== null);
}

/** 샵 사진 전체의 공개 주소(대표 먼저). 샵 프로필(C-309)이 쓴다 */
export async function selectShopImageUrls(db: DbReader, shopId: string): Promise<string[]> {
  return toImageUrls(await selectShopImages(db, shopId));
}

function availabilityOf(
  status: SlotStatus,
  slot: Parameters<typeof isHeldByOther>[0],
  query: SlotDetailQuery,
): SlotAvailability {
  if (status !== 'published') return 'closed';
  if (isHeldByMe(slot, query.customerId, query.now)) return 'mine';
  if (isHeldByOther(slot, query.customerId, query.now)) return 'onHold';
  return 'available';
}
