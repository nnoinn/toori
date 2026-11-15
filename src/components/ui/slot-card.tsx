import Link from 'next/link';
import { cn } from 'cn';

import { Countdown } from '@/components/ui/countdown';
import { PhotoFrame } from '@/components/ui/photo-frame';
import { Price } from '@/components/ui/price';
import { SlotBadges, type SlotBadgeKind } from '@/components/ui/slot-badge';
import { formatKst } from '@/lib/time';

export type SlotCardProps = {
  /** 누르면 갈 주소(매물 상세). 없으면 링크가 아닌 카드 */
  href?: string;
  /** 대표 이미지 주소(Supabase Storage 공개 주소). 없으면 빈 사진 칸 */
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
  /**
   * row: 왼쪽 작은 사진 + 오른쪽 글(기본, 예전 모양).
   * tile: 위에 사진 + 아래 글(사진은 폰 정사각형, PC 4:3). 여러 칸으로 늘어놓는 목록에 쓴다(11/15 회의, 거래 사이트의 상품 카드처럼)
   */
  layout?: 'row' | 'tile';
  /** tile 사진의 next/image sizes. 몇 칸으로 놓는지에 맞춘다 */
  imageSizes?: string;
  className?: string;
};

const TILE_IMAGE_SIZES = '(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw';

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
  layout = 'row',
  imageSizes = TILE_IMAGE_SIZES,
  className,
}: SlotCardProps) {
  const onHold = badges.includes('onHold');
  const imminent = badges.includes('imminent');
  const tile = layout === 'tile';

  const text = (
    <div className={cn('flex min-w-0 flex-1 flex-col gap-1', tile && 'p-3')}>
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
  );

  const body = tile ? (
    <div className={cn('flex h-full flex-col', onHold && 'opacity-60')}>
      <PhotoFrame
        src={imageUrl}
        alt={`${shopName} 대표 이미지`}
        sizes={imageSizes}
        className="aspect-square w-full rounded-t-xl md:aspect-[4/3]"
      />
      {text}
    </div>
  ) : (
    <div className={cn('flex gap-3 p-3', onHold && 'opacity-60')}>
      <PhotoFrame
        src={imageUrl}
        alt={`${shopName} 대표 이미지`}
        sizes="88px"
        className="size-22 shrink-0 rounded-lg"
      />
      {text}
    </div>
  );

  return (
    <div
      className={cn('rounded-xl bg-card ring-1 ring-foreground/10', tile && 'h-full', className)}
    >
      {href ? (
        <Link
          href={href}
          className={cn(
            'block rounded-xl focus-visible:ring-2 focus-visible:ring-ring',
            tile && 'h-full',
          )}
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}
