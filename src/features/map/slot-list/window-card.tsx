import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { PhotoFrame } from '@/components/ui/photo-frame';
import { type SlotBadgeKind, SlotBadges } from '@/components/ui/slot-badge';
import { formatWon } from '@/lib/format';

import { windowRangeText } from './window-range';

type WindowCardProps = {
  /** 시간대 상세 주소 */
  href: string;
  imageUrl: string | null;
  shopName: string;
  firstMenuName: string;
  menuCount: number;
  /** 시간대 시작·끝(ISO) */
  startAt: string;
  endAt: string;
  maxDiscountRate: number;
  minSalePrice: number;
  /** 서버가 정한 배지(임박, 신규 고객 전용) */
  badges: SlotBadgeKind[];
  distanceText?: string;
  /** 사진의 next/image sizes. 몇 칸으로 놓는지에 맞춘다 */
  imageSizes?: string;
};

/** "여성 커트", "여성 커트 외 3개" */
export function windowMenuText(firstMenuName: string, menuCount: number): string {
  return menuCount > 1 ? `${firstMenuName} 외 ${menuCount - 1}개` : firstMenuName;
}

/**
 * 시간대 매물 카드(#308). 매물 카드(공통 UI SlotCard)와 같은 모양에 '시간대' 배지를 단다.
 * 시작 시각 하나가 아니라 시간대 범위, 정가→할인가 대신 "최대 30% 17,500원부터"를 보여준다.
 * 서비스마다 할인율·가격이 달라 가장 큰 할인율과 가장 낮은 할인가만 보여주고, 정가는 상세에서 서비스를 고르면 보인다.
 * 매물 카드의 tile 모양(위에 정사각형 사진, 11/15 회의)과 같이 놓인다
 */
export function WindowCard({
  href,
  imageUrl,
  shopName,
  firstMenuName,
  menuCount,
  startAt,
  endAt,
  maxDiscountRate,
  minSalePrice,
  badges,
  distanceText,
  imageSizes = '50vw',
}: WindowCardProps) {
  return (
    <div className="h-full rounded-xl bg-card ring-1 ring-foreground/10">
      <Link
        href={href}
        className="block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex h-full flex-col">
          <PhotoFrame
            src={imageUrl}
            alt={`${shopName} 대표 이미지`}
            sizes={imageSizes}
            className="aspect-square w-full rounded-t-xl"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate">{shopName}</span>
              {distanceText ? <span className="shrink-0">· {distanceText}</span> : null}
            </p>
            <p className="truncate font-semibold">{windowMenuText(firstMenuName, menuCount)}</p>
            <p className="text-xs">{windowRangeText(startAt, endAt)}</p>
            <span className="flex flex-wrap gap-1">
              <Badge className="bg-primary/10 text-primary">시간대</Badge>
              <SlotBadges kinds={badges} />
            </span>
            <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-base font-bold text-sale">최대 {maxDiscountRate}%</span>
              <span className="text-base font-bold">{formatWon(minSalePrice)}부터</span>
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
