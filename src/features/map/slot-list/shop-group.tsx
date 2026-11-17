import Link from 'next/link';
import { cn } from 'cn';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Countdown } from '@/components/ui/countdown';
import { PhotoFrame } from '@/components/ui/photo-frame';
import { Price } from '@/components/ui/price';
import { SlotBadges } from '@/components/ui/slot-badge';
import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';

import { formatDistance } from './distance';
import { groupPreview, groupSummaryText, type ShopGroup } from './shop-groups';
import type { ListItem } from './types';
import { windowMenuText } from './window-card';
import { windowRangeText } from './window-range';

/**
 * 거리순 목록의 샵 하나(11/18 정찬형). 머리 줄(샵 사진·이름·업종·거리, 매물 수·최대 할인율) 아래에
 * 그 샵 매물을 짧은 줄로 놓는다. 3개가 넘으면 접어 두고 [매물 N개 더 보기]로 편다
 */
export function ShopGroupBlock({
  group,
  serverNow,
  expanded,
  onToggle,
}: {
  group: ShopGroup;
  serverNow: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const first = group.items[0];
  const distance = formatDistance(first.distanceMeters);
  const { visible, hiddenCount } = groupPreview(group, expanded);
  const foldable = group.items.length > visible.length || expanded;

  return (
    <section aria-label={first.shopName} className="flex flex-col gap-1 px-4 py-4">
      <div className="flex items-center gap-3">
        <PhotoFrame
          src={first.imageUrl}
          alt={`${first.shopName} 대표 이미지`}
          sizes="56px"
          className="size-14 shrink-0 rounded-lg"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate font-semibold">{first.shopName}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {first.category}
              {distance ? ` · ${distance}` : ''}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{groupSummaryText(group)}</p>
        </div>
      </div>
      {/* 매물 줄은 샵 이름 글자와 같은 줄에서 시작한다(사진 56px + 간격 12px) */}
      <ul className="flex flex-col pl-[68px]">
        {visible.map((item) => (
          <li key={item.kind === 'slot' ? item.slotId : item.windowId}>
            <GroupRow item={item} serverNow={serverNow} />
          </li>
        ))}
      </ul>
      {foldable ? (
        <button
          type="button"
          className="ml-[68px] flex items-center gap-1 self-start py-1 text-xs text-muted-foreground hover:text-foreground max-md:min-h-10"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? (
            <>
              접기
              <ChevronUp className="size-3.5" aria-hidden />
            </>
          ) : (
            <>
              매물 {hiddenCount}개 더 보기
              <ChevronDown className="size-3.5" aria-hidden />
            </>
          )}
        </button>
      ) : null}
    </section>
  );
}

/** 묶음 안 매물 한 줄: 왼쪽 시술·시각, 오른쪽 가격. 누르면 매물(시간대) 상세 */
function GroupRow({ item, serverNow }: { item: ListItem; serverNow: string }) {
  const rowClass =
    '-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

  if (item.kind === 'window') {
    return (
      <Link href={`/windows/${item.windowId}`} className={rowClass}>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <Badge className="shrink-0 bg-primary/10 text-primary">시간대</Badge>
            <span className="truncate text-sm">
              {windowMenuText(item.firstMenuName, item.menuCount)}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            {windowRangeText(item.startAt, item.endAt)}
          </span>
          <SlotBadges kinds={item.badges} />
        </span>
        <span className="flex shrink-0 flex-col items-end text-sm">
          <span className="font-bold text-sale">최대 {item.maxDiscountRate}%</span>
          <span className="font-bold">{formatWon(item.minSalePrice)}부터</span>
        </span>
      </Link>
    );
  }

  const onHold = item.badges.includes('onHold');
  const imminent = item.badges.includes('imminent');
  return (
    <Link href={`/slots/${item.slotId}`} className={cn(rowClass, onHold && 'opacity-60')}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm">{item.menuName}</span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span>{formatKst(new Date(item.startAt))}</span>
          <span aria-hidden>·</span>
          <Countdown
            targetAt={item.startAt}
            serverNow={serverNow}
            className={imminent ? 'font-semibold text-warning-foreground' : undefined}
          />
        </span>
        <SlotBadges kinds={item.badges} />
      </span>
      <Price
        listPrice={item.listPrice}
        salePrice={item.salePrice}
        discountRate={item.discountRate}
        size="sm"
        className="shrink-0 justify-end text-right"
      />
    </Link>
  );
}
