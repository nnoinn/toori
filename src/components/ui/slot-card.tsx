import Image from 'next/image';
import Link from 'next/link';
import { cn } from 'cn';
import { ImageOff } from 'lucide-react';

import { Countdown } from '@/components/ui/countdown';
import { Price } from '@/components/ui/price';
import { SlotBadges, type SlotBadgeKind } from '@/components/ui/slot-badge';
import { formatKst } from '@/lib/time';

export type SlotCardProps = {
  /** 누르면 갈 주소(매물 상세). 없으면 링크가 아닌 카드 */
  href?: string;
  /** 대표 이미지 주소(Supabase Storage 공개 주소). 없으면 빈 그림 */
  imageUrl?: string | null;
  shopName: string;
  menuName: string;
  /** 서비스 시작 시각(ISO) */
  startAt: string;
  /** 서버가 준 "지금"(ISO). getRequestNow()로 만든다 */
  serverNow: string;
  listPrice: number;
  salePrice: number;
  discountRate: number;
  /** 서버가 정책 설정값으로 판단한 배지 */
  badges?: SlotBadgeKind[];
  /** 거리 표시. 예: "350m", "1.2km" */
  distanceText?: string;
  className?: string;
};

/** 매물 카드(C-202): 샵명, 서비스명, 정가→할인가, 할인율, 서비스 시간, 남은 시간, 이미지 1장 */
export function SlotCard({
  href,
  imageUrl,
  shopName,
  menuName,
  startAt,
  serverNow,
  listPrice,
  salePrice,
  discountRate,
  badges = [],
  distanceText,
  className,
}: SlotCardProps) {
  const onHold = badges.includes('onHold');
  const imminent = badges.includes('imminent');

  const body = (
    <div className={cn('flex gap-3 p-3', onHold && 'opacity-60')}>
      <div className="relative size-22 shrink-0 overflow-hidden rounded-lg bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={`${shopName} 대표 이미지`}
            fill
            sizes="88px"
            className="object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-6" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate">{shopName}</span>
          {distanceText ? <span className="shrink-0">· {distanceText}</span> : null}
        </p>
        <p className="truncate font-semibold">{menuName}</p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
          <span>{formatKst(new Date(startAt))}</span>
          <Countdown
            targetAt={startAt}
            serverNow={serverNow}
            className={imminent ? 'font-semibold text-warning-foreground' : 'text-muted-foreground'}
          />
        </p>
        <SlotBadges kinds={badges} />
        <Price listPrice={listPrice} salePrice={salePrice} discountRate={discountRate} size="sm" />
      </div>
    </div>
  );

  return (
    <div className={cn('rounded-xl bg-card ring-1 ring-foreground/10', className)}>
      {href ? (
        <Link href={href} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}
