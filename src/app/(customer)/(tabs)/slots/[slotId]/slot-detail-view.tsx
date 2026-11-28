import { Clock } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Countdown } from '@/components/ui/countdown';
import { Price } from '@/components/ui/price';
import { SlotBadges } from '@/components/ui/slot-badge';
import { ShopSlotRow } from '@/features/map/slot-list/shop-group';
import type { ListItem } from '@/features/map/slot-list/types';
import { formatKst } from '@/lib/time';

import { formatDuration } from '@/lib/format';
import {
  DetailTop,
  RefundPolicyDetails,
  ShopHoursList,
  ShopLinkButtons,
  ShopLocationBlock,
  ShopPhoneLink,
} from './detail-parts';
import { type DetailTab, DetailTabs } from './detail-tabs';
import { FavoriteButton } from './favorite-button';
import { ReserveButton } from './reserve-button';
import { SlotInterestButton } from './slot-interest-button';
import type { SlotDetail } from './types';

type SlotDetailViewProps = {
  slot: SlotDetail;
  /** 서버가 준 "지금"(ISO) */
  serverNow: string;
  /** 이 샵을 찜했는지(#215). 고객으로 로그인하지 않았으면 false */
  favorite: boolean;
  /** 관심 동네·찜한 샵 새 매물 알림에 동의했는지(찜 버튼의 동의 권유) */
  interestAlertAgreed: boolean;
  /** 이 매물을 관심 매물로 두었는지(C-211). 고객으로 로그인하지 않았으면 false */
  slotInterested: boolean;
  /** 이 샵의 다른 매물(지금 매물은 빼고, 시작이 가까운 순) */
  otherItems: ListItem[];
};

/** 탭과 칸. 칸이 늘면(예: 후기) 여기에 하나 더하고 같은 id의 칸을 둔다 */
const TABS: DetailTab[] = [
  { id: 'menu-info', label: '시술 정보' },
  { id: 'shop-info', label: '샵 정보' },
  { id: 'location', label: '위치' },
  { id: 'other-slots', label: '이 샵의 다른 매물' },
];

/**
 * 매물 상세 (J7, C-301~C-305, C-308). 11/18 회의 피드백 5번 A안(지도 앱 장소 상세처럼):
 * 위에 사진 묶음 → 샵 이름 → 탭(시술 정보·샵 정보·위치·이 샵의 다른 매물)과 칸. 오른쪽(PC)은 가격·예약하기 상자.
 * 폰: 사진 → 샵 이름 → 가격·예약 상자 → 탭과 칸(회색 배경 위 흰 카드, #359 2번), 아래 고정 예약 바.
 * PC(md 이상): 가운데 최대 1024px 두 칸. 오른쪽 상자는 스크롤해도 따라온다.
 * 예약하기는 10분 홀딩을 걸고 예약 확인 화면으로 간다(reserve-button.tsx). 사진 묶음·샵 정보 조각·환불 규정은 시간대 상세(#308)와 같이 쓴다
 */
export function SlotDetailView({
  slot,
  serverNow,
  favorite,
  interestAlertAgreed,
  slotInterested,
  otherItems,
}: SlotDetailViewProps) {
  const { menu, shop } = slot;
  const nonRefundable = slot.badges.includes('nonRefundable');
  const duration = formatDuration(menu.durationMinutes);

  return (
    // PC: 오른쪽 상자가 네 줄(사진·샵 이름·탭과 칸)에 걸쳐 있다. 마지막 줄을 1fr로 두어 상자 높이가 위 줄을 늘리지 않게 한다
    <article className="flex flex-1 flex-col gap-3 pb-24 md:mx-auto md:grid md:w-full md:max-w-5xl md:grid-cols-[minmax(0,1fr)_380px] md:grid-rows-[auto_auto_1fr] md:items-start md:gap-x-8 md:gap-y-4 md:px-6 md:py-6">
      <DetailTop imageUrls={slot.imageUrls} shopName={shop.name} photosKey={slot.slotId} />

      <div className="flex items-start justify-between gap-3 px-4 max-md:flex-wrap md:col-start-1 md:row-start-2 md:px-0">
        <h1 className="flex min-w-0 items-baseline gap-2 max-md:flex-1">
          <span className="truncate text-xl font-bold">{shop.name}</span>
          <span className="shrink-0 text-sm text-muted-foreground">{slot.shopCategory}</span>
        </h1>
        <FavoriteButton
          shopId={shop.shopId}
          returnPath={`/slots/${slot.slotId}`}
          favorite={favorite}
          interestAlertAgreed={interestAlertAgreed}
        />
      </div>

      <Card className="mx-4 gap-3 px-4 text-base md:sticky md:top-22 md:col-start-2 md:row-span-3 md:row-start-1 md:mx-0 md:p-5">
        {/* 오른쪽 위 [관심 매물](C-211): 관심 화면 [매물 보기]에 모은다 */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm text-muted-foreground">{shop.name}</p>
            <h2 className="text-xl font-bold">{menu.name}</h2>
          </div>
          <SlotInterestButton slotId={slot.slotId} interested={slotInterested} />
        </div>
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
              {duration ? ` · ${duration}` : ''}
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
        <RefundPolicyDetails />
        <div className="hidden md:block">
          <ReserveButton slotId={slot.slotId} availability={slot.availability} />
        </div>
      </Card>

      {/* 탭은 이 묶음 안에서 위쪽에 붙어 따라온다(칸이 끝나면 멈춘다) */}
      <div className="flex flex-col gap-3 md:col-start-1 md:row-start-3">
        <DetailTabs tabs={TABS} />

        <DetailSection id="menu-info" title="시술 정보">
          <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">시술</dt>
            <dd>{menu.name}</dd>
            <dt className="text-muted-foreground">서비스 종류</dt>
            <dd>{menu.serviceType}</dd>
            <dt className="text-muted-foreground">걸리는 시간</dt>
            <dd>{duration || '정보 없음'}</dd>
            <dt className="text-muted-foreground">가격</dt>
            <dd>
              <Price
                listPrice={slot.listPrice}
                salePrice={slot.salePrice}
                discountRate={slot.discountRate}
                size="sm"
              />
            </dd>
          </dl>
          {menu.description ? (
            <p className="text-sm whitespace-pre-line">{menu.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              원장님이 아직 시술 설명을 쓰지 않았어요.
            </p>
          )}
        </DetailSection>

        <DetailSection id="shop-info" title="샵 정보">
          {shop.description ? (
            <p className="text-sm whitespace-pre-line">{shop.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">샵 소개가 아직 없어요.</p>
          )}
          <ShopHoursList businessHours={shop.businessHours} />
          <ShopPhoneLink phone={shop.phone} />
          <ShopLinkButtons shop={shop} />
        </DetailSection>

        <DetailSection id="location" title="위치">
          <ShopLocationBlock shop={shop} />
        </DetailSection>

        <DetailSection id="other-slots" title="이 샵의 다른 매물">
          {otherItems.length > 0 ? (
            <ul className="flex flex-col">
              {otherItems.map((item) => (
                <li key={item.kind === 'slot' ? item.slotId : item.windowId}>
                  <ShopSlotRow item={item} serverNow={serverNow} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">지금 이 샵에 다른 매물이 없어요.</p>
          )}
        </DetailSection>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-[480px] border-t bg-background p-3 md:hidden">
        <ReserveButton slotId={slot.slotId} availability={slot.availability} />
      </div>
    </article>
  );
}

/** 탭 하나가 가리키는 칸(회색 배경 위 흰 카드). 탭을 눌러 내려왔을 때 탭 줄에 가리지 않게 위 여백을 둔다 */
function DetailSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      id={id}
      role="region"
      aria-labelledby={`${id}-title`}
      className="mx-4 scroll-mt-14 gap-3 px-4 text-base md:mx-0 md:scroll-mt-32 md:p-5"
    >
      <h2 id={`${id}-title`} className="font-semibold">
        {title}
      </h2>
      {children}
    </Card>
  );
}
