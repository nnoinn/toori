import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown, Clock, ExternalLink, ImageOff, MapPin, Phone } from 'lucide-react';

import { BackButton } from '@/components/ui/back-button';
import { buttonVariants } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import { Price } from '@/components/ui/price';
import { SlotBadges } from '@/components/ui/slot-badge';
import { formatKst } from '@/lib/time';
import { REFUND_BANDS } from '@/server/policy';

import {
  formatBusinessHours,
  formatDuration,
  refundPolicyLines,
  safeExternalUrl,
  telHref,
} from './detail-format';
import type { SlotAvailability, SlotDetail } from './types';

const ACTION_LABEL: Record<SlotAvailability, string> = {
  available: '예약하기',
  onHold: '다른 고객이 결제 중이에요',
  mine: '결제 이어서 하기',
  closed: '예약할 수 없는 매물이에요',
};

/** 예약하기 버튼. 폰은 아래 고정 바, PC는 오른쪽 상자 안에 같은 버튼을 둔다 */
function ReserveAction({ availability, href }: { availability: SlotAvailability; href: string }) {
  const className = buttonVariants({ size: 'lg', className: 'h-12 w-full text-base' });
  if (availability === 'available' || availability === 'mine') {
    return (
      <Link href={href} className={className}>
        {ACTION_LABEL[availability]}
      </Link>
    );
  }
  return (
    <button type="button" disabled className={className}>
      {ACTION_LABEL[availability]}
    </button>
  );
}

type SlotDetailViewProps = {
  slot: SlotDetail;
  /** 서버가 준 "지금"(ISO) */
  serverNow: string;
};

/**
 * 매물 상세 (J7, C-301~C-305, C-308).
 * 폰: 사진 → 정보 → 샵 정보 한 줄, 아래 고정 예약 바.
 * PC(md 이상): 가운데 최대 1024px 두 칸. 왼쪽 사진·샵 정보, 오른쪽 정보·가격·예약하기 상자(스크롤해도 따라온다)
 */
export function SlotDetailView({ slot, serverNow }: SlotDetailViewProps) {
  const { menu, shop } = slot;
  const hours = formatBusinessHours(shop.businessHours);
  const links = [
    { label: '인스타그램', href: safeExternalUrl(shop.instagramUrl) },
    { label: '네이버 플레이스', href: safeExternalUrl(shop.naverPlaceUrl) },
  ].filter((link): link is { label: string; href: string } => link.href !== null);
  const tel = telHref(shop.phone);
  const nonRefundable = slot.badges.includes('nonRefundable');
  // TODO(J8·J10): 로그인 확인(#47)과 10분 홀딩(강규민 W10)이 들어오면 예약 확인 화면으로 연결한다.
  // 지금은 로그인 화면으로 보내고, 로그인 뒤 이 매물로 돌아온다(D1).
  const reserveHref = `/login?next=${encodeURIComponent(`/slots/${slot.slotId}`)}`;

  return (
    <article className="flex flex-1 flex-col pb-24 md:mx-auto md:grid md:w-full md:max-w-5xl md:grid-cols-[minmax(0,1fr)_380px] md:items-start md:gap-x-8 md:px-6 md:py-6">
      <div className="relative md:col-start-1 md:row-start-1 md:overflow-hidden md:rounded-2xl">
        <BackButton className="absolute top-2 left-2 z-10 bg-background/80" />
        {slot.imageUrls.length > 0 ? (
          <ul className="flex snap-x snap-mandatory overflow-x-auto" aria-label="스타일 이미지">
            {slot.imageUrls.map((url, index) => (
              <li key={url} className="relative aspect-[4/3] w-full shrink-0 snap-center">
                <Image
                  src={url}
                  alt={`${shop.name} 이미지 ${index + 1}`}
                  fill
                  sizes="(max-width: 768px) 100vw, 60vw"
                  className="object-cover"
                  priority={index === 0}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-muted-foreground">
            <ImageOff className="size-8" aria-hidden />
          </div>
        )}
      </div>

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
          {/* 정책값 REFUND_BANDS(#48)로 만든 3구간. 전체 규정과 동의는 결제 화면(C-402)에서 */}
          <ul className="flex flex-col gap-0.5 pt-2 text-muted-foreground">
            {refundPolicyLines(REFUND_BANDS).map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>결제 직후에도 무료 취소는 없어요.</li>
          </ul>
        </details>
        <div className="hidden md:block">
          <ReserveAction availability={slot.availability} href={reserveHref} />
        </div>
      </section>

      <section
        className="flex flex-col gap-3 border-t px-4 py-4 md:col-start-1 md:row-start-2 md:mt-6 md:px-0"
        aria-label="샵 정보"
      >
        <h2 className="font-semibold">{shop.name}</h2>
        <p className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            {shop.roadAddress}
            {shop.addressDetail ? ` ${shop.addressDetail}` : ''}
          </span>
        </p>
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
        <ReserveAction availability={slot.availability} href={reserveHref} />
      </div>
    </article>
  );
}
