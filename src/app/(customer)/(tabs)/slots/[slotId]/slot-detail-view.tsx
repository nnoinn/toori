import { Clock } from 'lucide-react';

import { Countdown } from '@/components/ui/countdown';
import { Price } from '@/components/ui/price';
import { SlotBadges } from '@/components/ui/slot-badge';
import { formatKst } from '@/lib/time';

import { formatDuration } from './detail-format';
import { DetailTop, RefundPolicyDetails, ShopInfoSection } from './detail-parts';
import { ReserveButton } from './reserve-button';
import type { SlotDetail } from './types';

type SlotDetailViewProps = {
  slot: SlotDetail;
  /** 서버가 준 "지금"(ISO) */
  serverNow: string;
  /** 이 샵을 찜했는지(#215). 고객으로 로그인하지 않았으면 false */
  favorite: boolean;
  /** 관심 동네·찜한 샵 새 매물 알림에 동의했는지(찜 버튼의 동의 권유) */
  interestAlertAgreed: boolean;
};

/**
 * 매물 상세 (J7, C-301~C-305, C-308).
 * 폰: 사진 → 정보 → 샵 정보 한 줄, 아래 고정 예약 바. 예약하기는 10분 홀딩을 걸고 예약 확인 화면으로 간다(reserve-button.tsx).
 * PC(md 이상): 가운데 최대 1024px 두 칸. 왼쪽 사진·샵 정보, 오른쪽 정보·가격·예약하기 상자(스크롤해도 따라온다).
 * 사진·샵 정보·환불 규정은 시간대 상세(#308)와 같이 쓴다(detail-parts.tsx)
 */
export function SlotDetailView({
  slot,
  serverNow,
  favorite,
  interestAlertAgreed,
}: SlotDetailViewProps) {
  const { menu, shop } = slot;
  const nonRefundable = slot.badges.includes('nonRefundable');

  return (
    // PC: 오른쪽 카드가 두 줄에 걸쳐 있다. 둘째 줄(샵 정보)을 1fr로 두어 카드 높이가 첫 줄(사진·안내)을 늘리지 않게 한다
    <article className="flex flex-1 flex-col pb-24 md:mx-auto md:grid md:w-full md:max-w-5xl md:grid-cols-[minmax(0,1fr)_380px] md:grid-rows-[auto_1fr] md:items-start md:gap-x-8 md:px-6 md:py-6">
      <DetailTop imageUrls={slot.imageUrls} shopName={shop.name} photosKey={slot.slotId} />

      <section className="flex flex-col gap-3 px-4 py-4 md:sticky md:top-22 md:col-start-2 md:row-span-2 md:row-start-1 md:rounded-2xl md:border md:bg-card md:p-5">
        <p className="text-sm text-muted-foreground">{shop.name}</p>
        <h1 className="text-xl font-bold">{menu.name}</h1>
        <SlotBadges kinds={slot.badges} />
        <Price
          listPrice={slot.listPrice}
          salePrice={slot.salePrice}
          discountRate={slot.discountRate}
        />
        <div className="flex flex-col gap-1 rounded-xl bg-muted/60 p-3 text-sm">
          <p className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" aria-hidden />
            <span>
              {formatKst(new Date(slot.startAt))}
              {menu.durationMinutes > 0 ? ` · ${formatDuration(menu.durationMinutes)}` : ''}
            </span>
          </p>
          <Countdown
            targetAt={slot.startAt}
            serverNow={serverNow}
            className={
              nonRefundable ? 'pl-6 font-semibold text-destructive' : 'pl-6 text-muted-foreground'
            }
          />
        </div>
        {menu.description ? (
          <p className="text-sm whitespace-pre-line">{menu.description}</p>
        ) : null}
        <RefundPolicyDetails />
        <div className="hidden md:block">
          <ReserveButton slotId={slot.slotId} availability={slot.availability} />
        </div>
      </section>

      <ShopInfoSection
        shop={shop}
        favorite={favorite}
        interestAlertAgreed={interestAlertAgreed}
        returnPath={`/slots/${slot.slotId}`}
      />

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-[480px] border-t bg-background p-3 md:hidden">
        <ReserveButton slotId={slot.slotId} availability={slot.availability} />
      </div>
    </article>
  );
}
