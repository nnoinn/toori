import {
  ChevronDown,
  Clock,
  ExternalLink,
  ImageOff,
  MapPin,
  Navigation,
  Phone,
} from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';
import { buttonVariants } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import { Price } from '@/components/ui/price';
import { SlotBadges } from '@/components/ui/slot-badge';
import { ShopLocationMap } from '@/features/map/shop-location-map';
import { formatKst } from '@/lib/time';
import { CUSTOMER_HOME } from '@/server/auth/paths';
import { NO_SHOW_PENALTY_RATE, OWNER_FAULT_COUPON_AMOUNT, REFUND_BANDS } from '@/server/policy';

import {
  formatBusinessHours,
  formatDuration,
  kakaoDirectionsLink,
  kakaoMapLink,
  refundPolicyLines,
  refundPolicyNotes,
  safeExternalUrl,
  telHref,
} from './detail-format';
import { FavoriteButton } from './favorite-button';
import { SlotPhotos } from './slot-photos';
import { ReserveButton } from './reserve-button';
import type { SlotDetail } from './types';

type SlotDetailViewProps = {
  slot: SlotDetail;
  /** 서버가 준 "지금"(ISO) */
  serverNow: string;
  /** 이 샵을 찜했는지(#215). 고객으로 로그인하지 않았으면 false */
  favorite: boolean;
};

/**
 * 매물 상세 (J7, C-301~C-305, C-308).
 * 폰: 사진 → 정보 → 샵 정보 한 줄, 아래 고정 예약 바. 예약하기는 10분 홀딩을 걸고 예약 확인 화면으로 간다(reserve-button.tsx).
 * PC(md 이상): 가운데 최대 1024px 두 칸. 왼쪽 사진·샵 정보, 오른쪽 정보·가격·예약하기 상자(스크롤해도 따라온다)
 */
export function SlotDetailView({ slot, serverNow, favorite }: SlotDetailViewProps) {
  const { menu, shop } = slot;
  const hours = formatBusinessHours(shop.businessHours);
  const links = [
    { label: '인스타그램', href: safeExternalUrl(shop.instagramUrl) },
    { label: '네이버 플레이스', href: safeExternalUrl(shop.naverPlaceUrl) },
  ].filter((link): link is { label: string; href: string } => link.href !== null);
  const tel = telHref(shop.phone);
  const nonRefundable = slot.badges.includes('nonRefundable');
  const refundNotes = refundPolicyNotes(OWNER_FAULT_COUPON_AMOUNT);

  return (
    // PC: 오른쪽 카드가 두 줄에 걸쳐 있다. 둘째 줄(샵 정보)을 1fr로 두어 카드 높이가 첫 줄(사진·안내)을 늘리지 않게 한다
    <article className="flex flex-1 flex-col pb-24 md:mx-auto md:grid md:w-full md:max-w-5xl md:grid-cols-[minmax(0,1fr)_380px] md:grid-rows-[auto_1fr] md:items-start md:gap-x-8 md:px-6 md:py-6">
      {slot.imageUrls.length > 0 ? (
        <div className="relative md:col-start-1 md:row-start-1 md:overflow-hidden md:rounded-2xl">
          {/* 공유한 주소로 바로 들어와 이전 화면이 없으면 고객 홈으로(#215) */}
          <BackButton
            fallbackHref={CUSTOMER_HOME}
            className="absolute top-2 left-2 z-10 bg-background/80"
          />
          {/* 다른 매물로 옮겨도 첫 장부터 보이게 매물마다 새로 시작한다 */}
          <SlotPhotos key={slot.slotId} urls={slot.imageUrls} shopName={shop.name} />
        </div>
      ) : (
        // 사진이 없으면 큰 회색 칸 대신 뒤로가기와 작은 안내만 두어 샵 정보가 바로 위로 올라오게 한다(#214)
        <div className="flex items-center gap-2 px-2 pt-2 md:col-start-1 md:row-start-1 md:px-0 md:pt-0">
          <BackButton fallbackHref={CUSTOMER_HOME} />
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ImageOff className="size-4" aria-hidden />
            사진이 아직 없어요
          </span>
        </div>
      )}

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
        {/* 환불 규정 (C-305): 접힌 한 줄만. "지금 취소하면 N% 환불"은 넣지 않는다 */}
        <details className="group rounded-xl border px-3 py-2 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
            환불 규정
            <ChevronDown
              className="size-4 transition-transform group-open:rotate-180"
              aria-hidden
            />
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
        <div className="hidden md:block">
          <ReserveButton slotId={slot.slotId} availability={slot.availability} />
        </div>
      </section>

      <section
        className="flex flex-col gap-3 border-t px-4 py-4 md:col-start-1 md:row-start-2 md:mt-6 md:px-0"
        aria-label="샵 정보"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold">{shop.name}</h2>
          <FavoriteButton shopId={shop.shopId} slotId={slot.slotId} favorite={favorite} />
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
            className="flex items-center gap-1 font-medium"
          >
            <Navigation className="size-4 text-muted-foreground" aria-hidden />
            카카오맵으로 길찾기
          </a>
          <a
            href={kakaoMapLink(shop.name, shop.lat, shop.lng)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-muted-foreground"
          >
            카카오맵에서 크게 보기
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
        {tel ? (
          <a href={tel} className="flex items-center gap-2 text-sm">
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
                className={buttonVariants({ variant: 'outline', className: 'gap-1' })}
              >
                {link.label}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ))}
          </div>
        ) : null}
      </section>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-[480px] border-t bg-background p-3 md:hidden">
        <ReserveButton slotId={slot.slotId} availability={slot.availability} />
      </div>
    </article>
  );
}
