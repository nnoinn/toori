import { ChevronDown } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { ShopSlotRow } from '@/features/map/slot-list/shop-group';
import { type ListItem, listItemKey } from '@/features/map/slot-list/types';
import { formatWon } from '@/lib/format';

import {
  DetailSection,
  DetailTop,
  ShopHoursList,
  ShopLinkButtons,
  ShopLocationBlock,
  ShopPhoneLink,
} from '../../slots/[slotId]/detail-parts';
import { type DetailTab, DetailTabs } from '../../slots/[slotId]/detail-tabs';
import { FavoriteButton } from '../../slots/[slotId]/favorite-button';
import { sellerInfoRows } from './shop-format';
import type { ShopProfile } from './types';

type ShopProfileViewProps = {
  profile: ShopProfile;
  /** 서버가 준 "지금"(ISO) */
  serverNow: string;
  /** 이 샵에 지금 올라온 매물(시간대 포함, 시작이 가까운 순) */
  items: ListItem[];
  /** 이 샵을 찜했는지(#215). 고객으로 로그인하지 않았으면 false */
  favorite: boolean;
  /** 관심 동네·찜한 샵 새 매물 알림에 동의했는지(찜 버튼의 동의 권유) */
  interestAlertAgreed: boolean;
  /** 찜하다 로그인·약관 동의로 갔을 때 돌아올 주소(이 프로필) */
  returnPath: string;
};

const TABS: DetailTab[] = [
  { id: 'shop-slots', label: '지금 매물' },
  { id: 'shop-menus', label: '메뉴' },
  { id: 'shop-about', label: '샵 정보' },
  { id: 'shop-location', label: '위치' },
];

/**
 * 샵 프로필 (C-309). 매물 상세와 같은 틀로 위에 사진 묶음 → 샵 이름·찜 → 탭(지금 매물·메뉴·샵 정보·위치)과 칸,
 * 맨 아래 접힌 판매자 정보. 매물을 누르면 매물(시간대) 상세로 간다.
 * PC(md 이상)는 가운데 최대 768px 한 칸이다(오른쪽 예약 상자가 없어서)
 */
export function ShopProfileView({
  profile,
  serverNow,
  items,
  favorite,
  interestAlertAgreed,
  returnPath,
}: ShopProfileViewProps) {
  const { shop } = profile;
  return (
    <article className="flex flex-1 flex-col gap-3 pb-6 md:mx-auto md:w-full md:max-w-3xl md:gap-4 md:px-6 md:py-6">
      <DetailTop imageUrls={profile.imageUrls} shopName={shop.name} photosKey={shop.shopId} />

      <div className="flex items-start justify-between gap-3 px-4 max-md:flex-wrap md:px-0">
        <h1 className="flex min-w-0 items-baseline gap-2 max-md:flex-1">
          <span className="truncate text-xl font-bold">{shop.name}</span>
          <span className="shrink-0 text-sm text-muted-foreground">{profile.category}</span>
        </h1>
        <FavoriteButton
          shopId={shop.shopId}
          returnPath={returnPath}
          favorite={favorite}
          interestAlertAgreed={interestAlertAgreed}
        />
      </div>

      <div className="flex flex-col gap-3">
        <DetailTabs tabs={TABS} />

        <DetailSection id="shop-slots" title="지금 매물">
          {items.length > 0 ? (
            <ul className="flex flex-col">
              {items.map((item) => (
                <li key={listItemKey(item)}>
                  <ShopSlotRow item={item} serverNow={serverNow} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">지금 이 샵에 올라온 매물이 없어요.</p>
          )}
        </DetailSection>

        <DetailSection id="shop-menus" title="메뉴">
          {profile.menus.length > 0 ? (
            <ul className="flex flex-col divide-y text-sm">
              {profile.menus.map((menu) => (
                <li key={menu.menuId} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0">{menu.name}</span>
                  <span className="shrink-0 tabular-nums">{formatWon(menu.listPrice)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">원장님이 아직 메뉴를 올리지 않았어요.</p>
          )}
        </DetailSection>

        <DetailSection id="shop-about" title="샵 정보">
          {shop.description ? (
            <p className="text-sm whitespace-pre-line">{shop.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">샵 소개가 아직 없어요.</p>
          )}
          <ShopHoursList businessHours={shop.businessHours} />
          <ShopPhoneLink phone={shop.phone} />
          <ShopLinkButtons shop={shop} />
        </DetailSection>

        <DetailSection id="shop-location" title="위치">
          <ShopLocationBlock shop={shop} />
        </DetailSection>

        <SellerInfoDetails profile={profile} />
      </div>
    </article>
  );
}

/** 판매자 정보(C-309): 맨 아래에 접어 둔다. 값은 원장님이 입점 때 낸 사업자 정보 */
function SellerInfoDetails({ profile }: { profile: ShopProfile }) {
  return (
    <Card className="mx-4 px-4 py-3 text-sm md:mx-0 md:px-5">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-muted-foreground max-md:min-h-10">
          판매자 정보
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 pt-3">
          {sellerInfoRows(profile.seller).map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="break-keep">{row.value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Card>
  );
}
