// 매물 공유(C-310) 문구. [공유] 버튼(share-button.tsx), 링크 미리보기 그림(opengraph-image.tsx), 미리보기 설명(page.tsx)이 같이 쓴다.
// 미리보기에는 할인율·시간·샵 이름이 보여야 한다(docs/stage3-spec.md C-310). 금액·할인율은 서버가 준 값 그대로다.

import { formatWon } from '@/lib/format';
import { SITE_NAME } from '@/lib/site';
import { formatKst } from '@/lib/time';

import type { SlotDetail } from './types';

type ShareSlot = Pick<
  SlotDetail,
  'slotId' | 'startAt' | 'listPrice' | 'salePrice' | 'discountRate'
> & {
  menu: Pick<SlotDetail['menu'], 'name'>;
  shop: Pick<SlotDetail['shop'], 'name'>;
};

/** 매물 상세 주소(공유 링크). 로그인 없이 열린다(둘러보기와 같다) */
export function slotSharePath(slotId: string): string {
  return `/slot/${slotId}`;
}

/** 공유 제목: "여성 커트 · 샘플 헤어 중앙역점"(탭 제목과 같다) */
export function slotShareTitle(slot: ShareSlot): string {
  return `${slot.menu.name} · ${slot.shop.name}`;
}

/** 공유 글·미리보기 설명: "30% 할인 12,500원 · 11/28(토) 11:00 시작 · 투리" */
export function slotShareText(slot: ShareSlot): string {
  return `${slot.discountRate}% 할인 ${formatWon(slot.salePrice)} · ${formatKst(new Date(slot.startAt))} 시작 · ${SITE_NAME}`;
}

/** 미리보기 그림에 넣는 글자 */
export function slotShareCard(slot: ShareSlot) {
  return {
    shopName: slot.shop.name,
    menuName: slot.menu.name,
    discount: `${slot.discountRate}%`,
    salePrice: formatWon(slot.salePrice),
    listPrice: formatWon(slot.listPrice),
    startAt: `${formatKst(new Date(slot.startAt))} 시작`,
  };
}

/** 링크를 복사했을 때(공유 창이 없는 PC 등) 잠깐 보여 주는 안내 */
export const SHARE_COPIED_MESSAGE = '링크를 복사했어요';
export const SHARE_FAILED_MESSAGE = '링크를 복사하지 못했어요. 주소창의 주소를 복사해 주세요';
