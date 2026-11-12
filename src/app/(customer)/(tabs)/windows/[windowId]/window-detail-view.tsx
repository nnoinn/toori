import type { SlotWindowDetail } from '@/server/slot-windows';

import { DetailTop, ShopInfoSection } from '../../slots/[slotId]/detail-parts';
import { WindowPicker } from './window-picker';

type WindowDetailViewProps = {
  window: SlotWindowDetail;
  /** 이 샵을 찜했는지(#215). 고객으로 로그인하지 않았으면 false */
  favorite: boolean;
  /** 관심 동네·찜한 샵 새 매물 알림에 동의했는지(찜 버튼의 동의 권유) */
  interestAlertAgreed: boolean;
};

/**
 * 시간대 상세 (#308). 원장님이 올린 시간대 안에서 손님이 서비스와 시작 시각(30분 단위)을 고르고 [예약하기]를 누른다.
 * 배치는 매물 상세와 같다. 폰: 사진 → 고르기 → 샵 정보, 아래 고정 예약 바.
 * PC(md 이상): 가운데 최대 1024px 두 칸. 왼쪽 사진·샵 정보, 오른쪽 고르기·예약하기 상자(스크롤해도 따라온다)
 */
export function WindowDetailView({ window, favorite, interestAlertAgreed }: WindowDetailViewProps) {
  return (
    <article className="flex flex-1 flex-col pb-24 md:mx-auto md:grid md:w-full md:max-w-5xl md:grid-cols-[minmax(0,1fr)_380px] md:grid-rows-[auto_1fr] md:items-start md:gap-x-8 md:px-6 md:py-6">
      <DetailTop
        imageUrls={window.imageUrls}
        shopName={window.shop.name}
        photosKey={window.windowId}
      />
      {/* 다른 시간대로 옮기면 고른 서비스·시각을 처음부터(Next.js가 떠난 화면을 숨겨 두었다가 다시 보여줘도 섞이지 않게) */}
      <WindowPicker key={window.windowId} window={window} />
      <ShopInfoSection
        shop={window.shop}
        favorite={favorite}
        interestAlertAgreed={interestAlertAgreed}
        returnPath={`/windows/${window.windowId}`}
      />
    </article>
  );
}
