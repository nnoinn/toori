// 매물 3탭 화면에 넘길 값 (O4·O10). 등록(/owner/slots/new)과 수정(/owner/slots/[slotId]/edit)이 같이 쓴다. 서버에서만 부른다.
// 두 화면이 한쪽만 고쳐지는 일이 없게 샵·메뉴·겹치는 시간을 여기서 한 번에 읽는다(#169 리뷰).

import 'server-only';

import { getDb } from '@/db';
import type { BusinessHours } from '@/db/schema/shops';
import { addMinutes } from '@/lib/time';

import { isServiceTypeOf, MENU_DURATION } from '../settings/menu/menu';
import { selectMenus } from '../settings/menu/menu-store';
import type { SlotMenuOption } from './slot-form';
import { type DraftOptions, selectBusyRanges, selectSlotShop } from './slot-draft-store';
import { latestStart } from './slot-time';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

/** SlotForm에 넘길 값(시각은 ISO 문자열) */
export type SlotFormData = {
  businessHours: BusinessHours;
  /** 고를 수 있는 메뉴: 숨기지 않았고 지금 업종의 서비스 종류. 비어 있으면 화면이 메뉴 등록을 안내한다 */
  menus: SlotMenuOption[];
  /** 같은 샵의 예약대기·게시중·예약됨 매물 시간. 수정이면 고치는 매물은 뺀다(excludeSlotId) */
  busy: { start: string; end: string }[];
};

/** 샵이 없으면 null */
export async function selectSlotFormData(
  db: Db,
  shopId: string,
  now: Date,
  options: DraftOptions = {},
): Promise<SlotFormData | null> {
  const [shop, menus, busy] = await Promise.all([
    selectSlotShop(db, shopId),
    selectMenus(db, shopId),
    // 고를 수 있는 마지막 시작 시각 + 가장 긴 소요 시간까지 본다
    selectBusyRanges(db, shopId, now, addMinutes(latestStart(now), MENU_DURATION.max), options),
  ]);
  if (!shop) return null;
  return {
    businessHours: shop.businessHours,
    menus: menus
      .filter((menu) => !menu.hidden && isServiceTypeOf(shop.category, menu.serviceType))
      .map((menu) => ({
        id: menu.id,
        serviceType: menu.serviceType,
        name: menu.name,
        listPrice: menu.listPrice,
        durationMinutes: menu.durationMinutes,
      })),
    busy: busy.map((range) => ({
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    })),
  };
}
