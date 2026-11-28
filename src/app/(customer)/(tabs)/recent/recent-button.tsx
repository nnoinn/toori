'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from 'cn';
import { History, LoaderCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { loadRecentItems } from './actions';
import { clearRecentEntries, readRecentEntries } from './recent-storage';
import {
  inViewedOrder,
  RECENT_SLOT_LIMIT,
  RECENT_SLOTS_EVENT,
  RECENT_SLOTS_KEY,
  type RecentEntry,
  recentIds,
  recentItemHref,
  recentItemTexts,
  showsRecentButton,
} from './recent-rules';
import type { RecentItem } from './types';

type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; items: RecentItem[] }
  | { state: 'error'; message: string };

/** 이 기기의 최근 본 매물 기록. 다른 탭에서 바뀌거나(storage) 이 화면에서 남기면(RECENT_SLOTS_EVENT) 다시 읽는다 */
function useRecentEntries(): RecentEntry[] {
  const [entries, setEntries] = useState<RecentEntry[]>([]);
  useEffect(() => {
    const sync = () => setEntries(readRecentEntries());
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === RECENT_SLOTS_KEY) sync();
    };
    window.addEventListener(RECENT_SLOTS_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(RECENT_SLOTS_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  return entries;
}

/**
 * [최근 본 매물](C-212). 화면 오른쪽 아래의 모서리가 둥근 사각형 버튼이고, 폰에서는 아래 메뉴 위에 둔다.
 * 누르면 이 기기에서 본 매물(최근 20개)을 지금 값으로 다시 읽어 보여 준다. 시작이 지난 매물은 빠지고 마감된 매물은 흐리다.
 * 본 매물이 없으면 버튼을 두지 않는다. 매물·시간대 상세와 지도에서는 두지 않는다(showsRecentButton).
 * 지금 주소(usePathname)를 읽으므로 고객 틀에서 <Suspense> 안에 둔다(Cache Components)
 */
export function RecentButton() {
  const pathname = usePathname();
  const entries = useRecentEntries();
  const [open, setOpen] = useState(false);

  if (!showsRecentButton(pathname) || entries.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`최근 본 매물 ${entries.length}개`}
          className="fixed right-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] z-30 flex size-12 items-center justify-center rounded-2xl border bg-card text-foreground shadow-md hover:bg-muted md:right-6 md:bottom-6"
        >
          <History className="size-5" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="flex max-h-[min(32rem,70dvh)] w-[min(22rem,calc(100vw-2rem))] flex-col p-0"
      >
        {open ? <RecentPanel entries={entries} onNavigate={() => setOpen(false)} /> : null}
      </PopoverContent>
    </Popover>
  );
}

/** 열 때마다 지금 값으로 다시 읽는다 */
function RecentPanel({ entries, onNavigate }: { entries: RecentEntry[]; onNavigate: () => void }) {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const key = JSON.stringify(entries);

  useEffect(() => {
    let current = true;
    const list: RecentEntry[] = JSON.parse(key);
    loadRecentItems(recentIds(list))
      .then((result) => {
        if (!current) return;
        setLoaded(
          result.ok
            ? { state: 'ready', items: inViewedOrder(list, result.data.items) }
            : { state: 'error', message: result.error.message },
        );
      })
      .catch(() => {
        if (current) setLoaded({ state: 'error', message: '최근 본 매물을 불러오지 못했어요' });
      });
    return () => {
      current = false;
    };
  }, [key]);

  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="text-sm font-semibold">최근 본 매물</p>
        <button
          type="button"
          className="rounded text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={clearRecentEntries}
        >
          모두 지우기
        </button>
      </div>
      <div className="overflow-y-auto">
        {loaded.state === 'loading' ? (
          <p
            role="status"
            className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"
          >
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            불러오는 중…
          </p>
        ) : loaded.state === 'error' ? (
          <p role="alert" className="px-4 py-6 text-sm text-destructive">
            {loaded.message}
          </p>
        ) : loaded.items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            지금 예약할 수 있는 최근 본 매물이 없어요. 시작 시각이 지난 매물은 보여 주지 않아요.
          </p>
        ) : (
          <ul aria-label="최근 본 매물" className="flex flex-col py-1">
            {loaded.items.map((item) => (
              <li key={`${item.kind}:${item.id}`}>
                <RecentRow item={item} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        이 기기에서 본 매물을 {RECENT_SLOT_LIMIT}개까지 남겨요.
      </p>
    </>
  );
}

function RecentRow({ item, onNavigate }: { item: RecentItem; onNavigate: () => void }) {
  const texts = recentItemTexts(item);
  return (
    <Link
      href={recentItemHref(item)}
      onClick={onNavigate}
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/60',
        item.closed && 'opacity-50',
      )}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-xs text-muted-foreground">{item.shopName}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          {item.kind === 'window' ? (
            <Badge className="shrink-0 bg-primary/10 text-primary">시간대</Badge>
          ) : null}
          {item.closed ? <Badge variant="muted">마감</Badge> : null}
          <span className="truncate text-sm font-medium">{texts.title}</span>
        </span>
        <span className="text-xs text-muted-foreground">{texts.time}</span>
      </span>
      <span className="shrink-0 text-sm font-bold">{texts.price}</span>
    </Link>
  );
}
