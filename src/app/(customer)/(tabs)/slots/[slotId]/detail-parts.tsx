// 매물 상세(J7)와 시간대 상세(#308)가 같이 쓰는 부분: 맨 위 사진·뒤로가기, 샵 정보(원장님 프로필, C-302~C-304), 접힌 환불 규정(C-305).
// 두 화면 모두 PC(md 이상)에서 왼쪽 사진·샵 정보, 오른쪽 상자의 두 칸 배치라서 칸 위치 클래스도 여기에 둔다.

import { cn } from 'cn';
import { ChevronDown, ExternalLink, MapPin, Navigation, Phone } from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PhotoFrame } from '@/components/ui/photo-frame';
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

/** PC 사진 묶음의 칸 수: 큰 사진 1장 + 작은 사진 4장(11/18 정찬형, 회의 피드백 5번 A안) */
export const GALLERY_SLOTS = 5;

/**
 * 맨 위: 사진 묶음과 뒤로가기. 사진이 아직 없는 샵도 사진이 들어갈 칸을 미리 보여 준다(11/15 회의).
 * 폰은 사진을 옆으로 밀어 넘기고, 사진이 없으면 같은 크기의 빈 칸 하나다.
 * PC는 큰 사진 1장과 작은 사진 4장 칸이고, 모자라면 빈 칸, 5장보다 많으면 마지막 칸에 "+N"
 */
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
  const extra = imageUrls.length - GALLERY_SLOTS;
  return (
    <div className="relative md:col-start-1 md:row-start-1">
      {/* 공유한 주소로 바로 들어와 이전 화면이 없으면 고객 홈으로(#215) */}
      <BackButton
        fallbackHref={CUSTOMER_HOME}
        className="absolute top-2 left-2 z-10 bg-background/80 max-md:size-10"
      />
      <div className="md:hidden">
        {imageUrls.length > 0 ? (
          <SlotPhotos key={photosKey} urls={imageUrls} shopName={shopName} />
        ) : (
          <PhotoFrame alt={`${shopName} 사진`} sizes="100vw" className="aspect-[4/3] w-full" />
        )}
      </div>
      <ul
        aria-label={`${shopName} 사진`}
        className="hidden h-[360px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl md:grid"
      >
        {Array.from({ length: GALLERY_SLOTS }, (_, i) => (
          <li key={i} className={cn('relative', i === 0 && 'col-span-2 row-span-2')}>
            <PhotoFrame
              src={imageUrls[i]}
              alt={`${shopName} 사진 ${i + 1}`}
              sizes={i === 0 ? '480px' : '240px'}
              priority={i === 0}
              // 회색 바탕 위에서 빈 칸이 보이게 흰 칸으로 둔다
              className="size-full bg-card"
            />
            {i === GALLERY_SLOTS - 1 && extra > 0 ? (
              <span className="absolute inset-0 flex items-center justify-center bg-foreground/50 text-lg font-semibold text-background">
                +{extra}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
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

/** 주소·작은 지도·길찾기(카카오맵) */
export function ShopLocationBlock({ shop }: { shop: DetailShop }) {
  return (
    <>
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
    </>
  );
}

/** 전화(누르면 걸기) */
export function ShopPhoneLink({ phone }: { phone: string }) {
  const tel = telHref(phone);
  if (!tel) return null;
  return (
    <a href={tel} className="flex items-center gap-2 text-sm max-md:min-h-10">
      <Phone className="size-4 text-muted-foreground" aria-hidden />
      {phone}
    </a>
  );
}

/** 영업시간(일~토 7줄). 원장님이 넣지 않았으면 그리지 않는다 */
export function ShopHoursList({ businessHours }: { businessHours: unknown }) {
  const hours = formatBusinessHours(businessHours);
  if (!hours) return null;
  return (
    <dl className="grid grid-cols-[2rem_1fr] gap-x-2 gap-y-0.5 text-sm">
      {hours.map((row) => (
        <div key={row.weekday} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd>{row.text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 인스타그램·네이버 플레이스 링크 버튼. 둘 다 없으면 그리지 않는다 */
export function ShopLinkButtons({ shop }: { shop: DetailShop }) {
  const links = [
    { label: '인스타그램', href: safeExternalUrl(shop.instagramUrl) },
    { label: '네이버 플레이스', href: safeExternalUrl(shop.naverPlaceUrl) },
  ].filter((link): link is { label: string; href: string } => link.href !== null);
  if (links.length === 0) return null;
  return (
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
  );
}

/** 샵 정보(원장님 프로필): 이름·찜, 주소·작은 지도·길찾기, 전화, 영업시간, 소개, 외부 링크. 시간대 상세가 쓴다 */
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
      <ShopLocationBlock shop={shop} />
      <ShopPhoneLink phone={shop.phone} />
      <ShopHoursList businessHours={shop.businessHours} />
      {shop.description ? (
        <p className="text-sm whitespace-pre-line text-muted-foreground">{shop.description}</p>
      ) : null}
      <ShopLinkButtons shop={shop} />
    </Card>
  );
}
