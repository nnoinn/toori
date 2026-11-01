// 원장님 프로필(샵 정보) 읽기·저장 (DB, O2, S-103). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 화면이 부르는 'use server' 함수(actions.ts)가 권한·입력을 확인한 뒤 이 함수들을 부른다.
// db를 받아서 테스트(withRollback)에서도 같은 코드를 쓴다.

import 'server-only';

import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { shops } from '@/db/schema';
import type { BusinessHours } from '@/db/schema/shops';
import type { GeocodeResult } from '@/features/map/geocode';
import type { ShopCategory } from '@/server/policy/catalog';

import type { ShopProfileValues } from './shop-profile';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'update'>;

/** 화면에 채워 넣을 지금 값 */
export type ShopProfile = {
  name: string;
  category: ShopCategory;
  phone: string;
  roadAddress: string;
  addressDetail: string | null;
  description: string | null;
  businessHours: BusinessHours;
};

/** 샵의 지금 프로필. 샵이 없으면 null */
export async function selectShopProfile(
  db: Pick<Db, 'select'>,
  shopId: string,
): Promise<ShopProfile | null> {
  const [row] = await db
    .select({
      name: shops.name,
      category: shops.category,
      phone: shops.phone,
      roadAddress: shops.roadAddress,
      addressDetail: shops.addressDetail,
      description: shops.description,
      businessHours: shops.businessHours,
    })
    .from(shops)
    .where(eq(shops.id, shopId));
  return row ? { ...row, category: row.category as ShopCategory } : null;
}

/**
 * 프로필을 저장한다. 주소가 바뀌었으면 location에 주소→좌표 변환 결과를 넘겨서 좌표·지역도 같이 바꾼다.
 * 도로명 주소는 변환 결과의 것으로 저장한다(#51). 샵이 없으면 false
 */
export async function updateShopProfile(
  db: Pick<Db, 'update'>,
  shopId: string,
  values: ShopProfileValues,
  location: GeocodeResult | null,
): Promise<boolean> {
  const updated = await db
    .update(shops)
    .set({
      name: values.name,
      category: values.category,
      phone: values.phone,
      addressDetail: values.addressDetail,
      description: values.description,
      businessHours: values.businessHours,
      ...(location && {
        roadAddress: location.roadAddress,
        jibunAddress: location.jibunAddress,
        sido: location.region.sido,
        sigungu: location.region.sigungu,
        sigunguCode: location.region.sigunguCode,
        location: { lat: location.lat, lng: location.lng },
      }),
    })
    .where(eq(shops.id, shopId))
    .returning({ id: shops.id });
  return updated.length > 0;
}
