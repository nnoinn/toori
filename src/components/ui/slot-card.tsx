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
  /** 업종 이름. 예: "미용실". list 모양에서 샵 이름 옆에 작게 보인다 */
  category?: string;
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
   * row: 왼쪽 작은 사진 + 오른쪽 글, 테두리 있는 카드(기본, 예전 모양).
   * list: 왼쪽 글 + 오른쪽 사진 하나, 테두리 없이 구분선으로 나누는 목록 줄. 지도 앱 장소 목록처럼(11/18 정찬형, 11/15 회의)
   */
  layout?: 'row' | 'list';
  className?: string;
};

/** 매물 카드(C-202): 샵명, 서비스명, 정가→할인가, 할인율, 서비스 시간, 남은 시간, 이미지 1장 */
export function SlotCard({
  href,
  imageUrl,
  shopName,
  category,
  menuName,
  startAt,
  serverNow,
  listPrice,
  salePrice,
  discountRate,
  badges = [],
  distanceText,
  layout = 'row',
  className,
}: SlotCardProps) {
  const onHold = badges.includes('onHold');
  const imminent = badges.includes('imminent');
  const countdown = (
    <Countdown
      targetAt={startAt}
      serverNow={serverNow}
      className={imminent ? 'font-semibold text-warning-foreground' : 'text-muted-foreground'}
    />
  );

  if (layout === 'list') {
    const body = (
      <div className={cn('flex gap-3 px-4 py-4', onHold && 'opacity-60')}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate font-semibold">{shopName}</span>
            {category ? (
              <span className="shrink-0 text-xs text-muted-foreground">{category}</span>
            ) : null}
          </p>
          <p className="truncate text-sm">{menuName}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span>{formatKst(new Date(startAt))}</span>
            <span aria-hidden>·</span>
            {countdown}
          </p>
          {badges.length > 0 ? <SlotBadges kinds={badges} className="mt-0.5" /> : null}
          <Price
            listPrice={listPrice}
            salePrice={salePrice}
            discountRate={discountRate}
            size="sm"
            className="mt-1"
          />
          {distanceText ? <p className="text-xs text-muted-foreground">{distanceText}</p> : null}
        </div>
        <PhotoFrame
          src={imageUrl}
          alt={`${shopName} 대표 이미지`}
          sizes="88px"
          className="size-22 shrink-0 rounded-lg"
        />
      </div>
    );
    return (
      <div className={cn('bg-card', className)}>
        {href ? (
          <Link
            href={href}
            className="block transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
    );
  }

  const body = (
    <div className={cn('flex gap-3 p-3', onHold && 'opacity-60')}>
      <PhotoFrame
        src={imageUrl}
        alt={`${shopName} 대표 이미지`}
        sizes="88px"
        className="size-22 shrink-0 rounded-lg"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate">{shopName}</span>
          {distanceText ? <span className="shrink-0">· {distanceText}</span> : null}
        </p>
        <p className="truncate font-semibold">{menuName}</p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
          <span>{formatKst(new Date(startAt))}</span>
          {countdown}
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
