import Link from 'next/link';
import {
  CalendarCheck,
  ChevronRight,
  Heart,
  List,
  type LucideIcon,
  Map as MapIcon,
  MapPin,
  Scissors,
  Sparkles,
} from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { LocationSwitcher } from '@/features/map/location-switcher';
import { ListItemRow } from '@/features/map/slot-list/slot-list';
import { type ListItem, listItemKey } from '@/features/map/slot-list/types';

import { LOBBY_TILES, type LobbyTileKey, PHONE_ROW_COUNT } from './lobby-rules';

// 고객 홈(로비) 조각 (11/15 회의 6번, 11/20 정찬형 A안). 흰 카드는 모두 같은 모양(둥근 모서리·테두리)이다.
// 오른쪽 상자(지도·찜한 샵)는 관심 동네 상자(AreaAlert variant="side")와 같은 모양으로 맞춘다

const CARD = 'rounded-2xl border bg-card';
const BOX = `${CARD} flex flex-col gap-3 p-4 text-sm`;
const BOX_TITLE = 'text-xs font-semibold text-muted-foreground';

const TILE_ICONS: Record<LobbyTileKey, LucideIcon> = {
  list: List,
  map: MapIcon,
  favorites: Heart,
  reservations: CalendarCheck,
  hair: Scissors,
  nail_lash: Sparkles,
};

/** 동네 줄: 지금 동네(누르면 동네 고르기)와 지금 예약할 수 있는 할인 매물 수 */
export function LobbyAreaBar({
  label,
  selectedCode,
  total,
}: {
  label: string;
  selectedCode: string | null;
  /** 동네 안 매물 수(시간대는 1개로). 동네를 찾지 못했으면 null */
  total: number | null;
}) {
  return (
    <div
      className={`${CARD} flex items-center justify-between gap-2 py-1 pr-4 pl-3 md:rounded-full`}
    >
      <div className="flex min-w-0 items-center">
        <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <LocationSwitcher label={label} selectedCode={selectedCode} />
      </div>
      {total === null ? null : (
        <p className="shrink-0 text-sm text-muted-foreground">
          <span className="max-md:hidden">지금 예약할 수 있는 </span>할인{' '}
          <b className="text-foreground">{total}개</b>
        </p>
      )}
    </div>
  );
}

/**
 * 바로가기 칸 6개(3칸 2줄, C-213). PC는 흰 칸에 아이콘과 이름, 폰은 흰 아이콘 칸 아래 이름(앱 아이콘처럼).
 * 폰에서 누르는 곳은 아이콘과 이름을 합친 칸 전체라 40px보다 크다
 */
export function LobbyTiles() {
  return (
    <nav aria-label="바로가기">
      <ul className="grid grid-cols-3 gap-x-2 gap-y-3 md:gap-2.5">
        {LOBBY_TILES.map(({ key, label, href }) => {
          const Icon = TILE_ICONS[key];
          return (
            <li key={key}>
              <Link
                href={href}
                className="flex flex-col items-center gap-1.5 text-center text-xs font-medium md:h-full md:items-start md:gap-3 md:rounded-2xl md:border md:bg-card md:p-4 md:text-left md:text-sm md:font-semibold md:transition-colors md:hover:bg-muted/60"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl border bg-card md:size-auto md:rounded-none md:border-0 md:bg-transparent">
                  <Icon className="size-5 text-foreground/70" aria-hidden />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * 매물 칸(곧 시작하는 매물·많이 할인하는 매물). 한 줄은 매물 목록과 같은 모양이고, 아래 [더 보기]는 그 정렬의 매물 목록이다.
 * 폰은 PHONE_ROW_COUNT줄까지만 보인다
 */
export function LobbySection({
  id,
  title,
  note,
  moreHref,
  items,
  serverNow,
}: {
  id: string;
  title: string;
  /** 제목 오른쪽 작은 글. 예: 시작이 가까운 순 */
  note: string;
  moreHref: string;
  items: readonly ListItem[];
  serverNow: string;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className={`${CARD} overflow-hidden`}>
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 pb-1">
        <h2 id={`${id}-title`} className="font-bold">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
      <ul className="[&>li]:border-b">
        {items.map((item, index) => (
          <li
            key={listItemKey(item)}
            className={index >= PHONE_ROW_COUNT ? 'max-md:hidden' : undefined}
          >
            <ListItemRow item={item} serverNow={serverNow} />
          </li>
        ))}
      </ul>
      <Link
        href={moreHref}
        className="flex h-11 items-center justify-center gap-0.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60"
      >
        더 보기
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

/** 오른쪽 지도 상자(PC). 지도 그림 대신 아이콘과 버튼만 둔다(진짜 작은 지도는 화면이 무거워져서, 11/20 정찬형) */
export function LobbyMapBox() {
  return (
    <div className={BOX}>
      <p className={BOX_TITLE}>지도</p>
      <p className="flex items-center gap-2 font-medium">
        <MapIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        가까운 샵과 매물을 지도에서 찾아요
      </p>
      <Link
        href="/home/map"
        className={buttonVariants({ variant: 'outline', className: 'w-full' })}
      >
        지도에서 가까운 샵 보기
      </Link>
    </div>
  );
}

/** 오른쪽 찜한 샵 상자(PC). summary가 null이면 로그인하지 않았다(누르면 로그인 뒤 찜한 샵 매물로 간다) */
export function LobbyFavoritesBox({ summary }: { summary: string | null }) {
  return (
    <div className={BOX}>
      <p className={BOX_TITLE}>찜한 샵</p>
      <p className="flex items-center gap-2 font-medium">
        <Heart className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        {summary ?? '로그인하면 찜한 샵의 매물을 모아 볼 수 있어요'}
      </p>
      <Link
        href="/home/favorites"
        className={buttonVariants({ variant: 'outline', className: 'w-full' })}
      >
        찜한 샵 매물 보기
      </Link>
    </div>
  );
}

/** 흰 카드 틀(빈 화면·동네를 찾지 못함 안내를 감싼다) */
export function LobbyCard({ children }: { children: React.ReactNode }) {
  return <div className={CARD}>{children}</div>;
}
