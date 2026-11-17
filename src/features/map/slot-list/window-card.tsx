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
  /** 업종 이름. 예: "미용실" */
  category: string;
  firstMenuName: string;
  menuCount: number;
  /** 시간대 시작·끝(ISO) */
  startAt: string;
  endAt: string;
  maxDiscountRate: number;
  minSalePrice: number;
  /** 서버가 정한 배지(임박). 신규 고객 전용은 고객 화면에 보여 주지 않는다(#459) */
  badges: SlotBadgeKind[];
  distanceText?: string;
};

/** "여성 커트", "여성 커트 외 3개" */
export function windowMenuText(firstMenuName: string, menuCount: number): string {
  return menuCount > 1 ? `${firstMenuName} 외 ${menuCount - 1}개` : firstMenuName;
}

/**
 * 시간대 매물 카드(#308). 매물 카드(공통 UI SlotCard의 list 모양: 왼쪽 글 + 오른쪽 사진)와 같은 모양에 '시간대' 배지를 단다.
 * 시작 시각 하나가 아니라 시간대 범위, 정가→할인가 대신 "최대 30% 17,500원부터"를 보여준다.
 * 서비스마다 할인율·가격이 달라 가장 큰 할인율과 가장 낮은 할인가만 보여주고, 정가는 상세에서 서비스를 고르면 보인다
 */
export function WindowCard({
  href,
  imageUrl,
  shopName,
  category,
  firstMenuName,
  menuCount,
  startAt,
  endAt,
  maxDiscountRate,
  minSalePrice,
  badges,
  distanceText,
}: WindowCardProps) {
  return (
    <div className="bg-card">
      <Link
        href={href}
        className="block transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="flex gap-3 px-4 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate font-semibold">{shopName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{category}</span>
            </p>
            <p className="truncate text-sm">{windowMenuText(firstMenuName, menuCount)}</p>
            <p className="text-xs text-muted-foreground">{windowRangeText(startAt, endAt)}</p>
            <span className="mt-0.5 flex flex-wrap gap-1">
              <Badge className="bg-primary/10 text-primary">시간대</Badge>
              <SlotBadges kinds={badges} />
            </span>
            <span className="mt-1 inline-flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-base font-bold text-sale">최대 {maxDiscountRate}%</span>
              <span className="text-base font-bold">{formatWon(minSalePrice)}부터</span>
            </span>
            {distanceText ? <p className="text-xs text-muted-foreground">{distanceText}</p> : null}
          </div>
          <PhotoFrame
            src={imageUrl}
            alt={`${shopName} 대표 이미지`}
            sizes="88px"
            className="size-22 shrink-0 rounded-lg"
          />
        </div>
      </Link>
    </div>
  );
}
