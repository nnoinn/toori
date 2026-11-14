// 매물 상세(J7)와 시간대 상세(#308)가 같이 쓰는 부분: 맨 위 사진·뒤로가기, 샵 정보(원장님 프로필, C-302~C-304), 접힌 환불 규정(C-305).
// 두 화면 모두 PC(md 이상)에서 왼쪽 사진·샵 정보, 오른쪽 상자의 두 칸 배치라서 칸 위치 클래스도 여기에 둔다.

import { ChevronDown, ExternalLink, ImageOff, MapPin, Navigation, Phone } from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShopLocationMap } from '@/features/map/shop-location-map';
import { CUSTOMER_HOME } from '@/server/auth/paths';
import { NO_SHOW_PENALTY_RATE, OWNER_FAULT_COUPON_AMOUNT, REFUND_BANDS } from '@/server/policy';

import {
  formatBusinessHours,
  kakaoDirectionsLink,
  kakaoMapLink,
  refundPolicyLines,
  refundPolicyNotes,
  safeExternalUrl,
  telHref,
} from './detail-format';
import { FavoriteButton } from './favorite-button';
import { SlotPhotos } from './slot-photos';
import type { SlotDetail } from './types';

/** 상세 화면의 샵(원장님 프로필). 시간대 상세(SlotWindowShop)도 같은 모양이다 */
export type DetailShop = SlotDetail['shop'];

/** 맨 위: 사진(넘기기)과 뒤로가기. 사진이 없으면 뒤로가기와 작은 안내만(#214) */
export function DetailTop({
  imageUrls,
  shopName,
  photosKey,
}: {
  imageUrls: string[];
  shopName: string;
  /** 다른 상세로 옮겨도 첫 장부터 보이게 상세마다 새로 시작한다(매물 id·시간대 id) */
  photosKey: string;
}) {
  if (imageUrls.length > 0) {
    return (
      <div className="relative md:col-start-1 md:row-start-1 md:overflow-hidden md:rounded-2xl">
        {/* 공유한 주소로 바로 들어와 이전 화면이 없으면 고객 홈으로(#215) */}
        <BackButton
          fallbackHref={CUSTOMER_HOME}
          className="absolute top-2 left-2 z-10 bg-background/80 max-md:size-10"
        />
        <SlotPhotos key={photosKey} urls={imageUrls} shopName={shopName} />
      </div>
    );
  }
  // 사진이 없으면 큰 회색 칸 대신 뒤로가기와 작은 안내만 두어 샵 정보가 바로 위로 올라오게 한다(#214)
  return (
    <div className="flex items-center gap-2 px-2 pt-2 md:col-start-1 md:row-start-1 md:px-0 md:pt-0">
      <BackButton fallbackHref={CUSTOMER_HOME} className="max-md:size-10" />
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ImageOff className="size-4" aria-hidden />
        사진이 아직 없어요
      </span>
    </div>
  );
}

/** 환불 규정 (C-305): 접힌 한 줄만. "지금 취소하면 N% 환불"은 넣지 않는다 */
export function RefundPolicyDetails() {
  const refundNotes = refundPolicyNotes(OWNER_FAULT_COUPON_AMOUNT);
  return (
    <details className="group rounded-xl bg-muted/60 px-3 py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
        환불 규정
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {/* 결제 동의 문구(docs/legal/consent-texts.md 3장)와 같은 내용. 숫자는 정책값(#48)에서. 동의는 결제 화면(C-402)에서 받는다 */}
      <div className="flex flex-col gap-1 pt-2 text-muted-foreground">
        {refundNotes.before.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <ul className="flex flex-col gap-0.5">
          {refundPolicyLines(REFUND_BANDS, NO_SHOW_PENALTY_RATE).map((line) => (
            <li key={line}>- {line}</li>
          ))}
        </ul>
        <p>{refundNotes.after}</p>
      </div>
    </details>
  );
}

/** 샵 정보(원장님 프로필): 이름·찜, 주소·작은 지도·길찾기, 전화, 영업시간, 소개, 외부 링크 */
export function ShopInfoSection({
  shop,
  favorite,
  interestAlertAgreed,
  returnPath,
}: {
  shop: DetailShop;
  /** 이 샵을 찜했는지(#215). 고객으로 로그인하지 않았으면 false */
  favorite: boolean;
  /** 관심 동네·찜한 샵 새 매물 알림에 동의했는지(찜 버튼의 동의 권유) */
  interestAlertAgreed: boolean;
  /** 찜하다 로그인·약관 동의로 갔을 때 돌아올 주소(지금 상세) */
  returnPath: string;
}) {
  const hours = formatBusinessHours(shop.businessHours);
  const links = [
    { label: '인스타그램', href: safeExternalUrl(shop.instagramUrl) },
    { label: '네이버 플레이스', href: safeExternalUrl(shop.naverPlaceUrl) },
  ].filter((link): link is { label: string; href: string } => link.href !== null);
  const tel = telHref(shop.phone);

  return (
    // 회색 배경 위 흰 카드(#359 2번). 폰은 양옆 16px, PC는 왼쪽 칸 사진 아래
    <Card
      role="region"
      aria-label="샵 정보"
      className="mx-4 gap-3 px-4 text-base md:col-start-1 md:row-start-2 md:mx-0 md:p-5"
    >
      {/* 폰에서는 찜 동의 안내가 샵 이름 옆이 아니라 아래 줄을 다 쓰게 줄을 넘긴다(favorite-button.tsx) */}
      <div className="flex items-start justify-between gap-3 max-md:flex-wrap">
        <h2 className="font-semibold max-md:min-w-0 max-md:flex-1">{shop.name}</h2>
        <FavoriteButton
          shopId={shop.shopId}
          returnPath={returnPath}
          favorite={favorite}
          interestAlertAgreed={interestAlertAgreed}
        />
      </div>
      <p className="flex items-start gap-2 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          {shop.roadAddress}
          {shop.addressDetail ? ` ${shop.addressDetail}` : ''}
        </span>
      </p>
      <ShopLocationMap shopId={shop.shopId} name={shop.name} lat={shop.lat} lng={shop.lng} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <a
          href={kakaoDirectionsLink(shop.name, shop.lat, shop.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 font-medium max-md:min-h-10"
        >
          <Navigation className="size-4 text-muted-foreground" aria-hidden />
          카카오맵으로 길찾기
        </a>
        <a
          href={kakaoMapLink(shop.name, shop.lat, shop.lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-muted-foreground max-md:min-h-10"
        >
          카카오맵에서 크게 보기
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
      {tel ? (
        <a href={tel} className="flex items-center gap-2 text-sm max-md:min-h-10">
          <Phone className="size-4 text-muted-foreground" aria-hidden />
          {shop.phone}
        </a>
      ) : null}
      {hours ? (
        <dl className="grid grid-cols-[2rem_1fr] gap-x-2 gap-y-0.5 text-sm">
          {hours.map((row) => (
            <div key={row.weekday} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd>{row.text}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {shop.description ? (
        <p className="text-sm whitespace-pre-line text-muted-foreground">{shop.description}</p>
      ) : null}
      {links.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline', className: 'gap-1 max-md:h-10' })}
            >
              {link.label}
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
