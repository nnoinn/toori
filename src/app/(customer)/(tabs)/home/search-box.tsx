'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from 'cn';
import { Clock, Search, X } from 'lucide-react';

import { parseSearchKeyword, SEARCH_MAX_LENGTH } from '@/features/map/search';

import {
  addRecentSearch,
  parseRecentSearches,
  RECENT_SEARCH_KEY,
  removeRecentSearch,
  searchListHref,
} from './search-rules';

/** 이 기기에 남긴 최근 검색어. 저장소를 못 쓰면(사생활 보호 창 등) 빈 목록 */
function readRecent(): string[] {
  try {
    return parseRecentSearches(localStorage.getItem(RECENT_SEARCH_KEY));
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    if (list.length > 0) localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(list));
    else localStorage.removeItem(RECENT_SEARCH_KEY);
  } catch {
    // 저장하지 못해도 검색은 된다
  }
}

/**
 * 검색 칸 (C-210). 홈 동네 바 가운데(폰은 바 아래)와 매물 목록 맨 윗줄에 둔다.
 * 엔터(또는 돋보기)를 누르면 매물 목록에서 찾는다. inList면 지금 필터·정렬을 그대로 두고 검색어만 바꾼다.
 * 칸을 누르면 이 기기의 최근 검색어가 아래에 보이고, 하나씩 또는 모두 지울 수 있다.
 * 검색어가 바뀌면 부르는 쪽이 key로 새로 그린다(떠났다 와도 남는 화면, Activity)
 */
export function SearchBox({
  defaultValue = '',
  inList = false,
  filled = false,
  className,
}: {
  /** 처음 칸에 넣어 둘 검색어(매물 목록에서 지금 검색어) */
  defaultValue?: string;
  /** 매물 목록 안이면 true: 다른 주소창 값(필터·정렬)을 지킨다 */
  inList?: boolean;
  /** 흰 바 안에 두면 true: 칸을 옅은 회색으로 채워 바와 구분한다. 회색 바탕 화면에서는 흰 칸 */
  filled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  function saveRecent(next: string[]) {
    setRecent(next);
    writeRecent(next);
  }

  function search(text: string) {
    const keyword = parseSearchKeyword(text);
    // 홈에서 빈 칸으로 누르면 아무 데도 가지 않는다. 매물 목록에서는 검색을 푼다
    if (!keyword && !inList) {
      inputRef.current?.focus();
      return;
    }
    if (keyword) saveRecent(addRecentSearch(readRecent(), keyword.text));
    setOpen(false);
    inputRef.current?.blur();
    // 홈 칸은 비워 둔다. 홈은 떠나도 화면이 남아 있어서(Activity) 돌아오면 지난 검색어가 그대로 보이기 때문이다.
    // 검색어는 매물 목록 칸과 제목에 보인다
    if (!inList) setValue('');
    router.push(searchListHref(text, inList ? new URLSearchParams(searchParams.toString()) : null));
  }

  const showRecent = open && recent.length > 0;

  return (
    <div
      className={cn('relative w-full', className)}
      // 칸 밖으로 초점이 나가면 최근 검색어를 닫는다
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <form
        role="search"
        className={cn(
          'flex h-10 items-center rounded-full border pr-1 focus-within:border-ring focus-within:bg-card focus-within:ring-3 focus-within:ring-ring/50',
          filled ? 'bg-muted/60' : 'bg-card',
        )}
        onSubmit={(event) => {
          event.preventDefault();
          search(value);
        }}
      >
        <button
          type="submit"
          aria-label="찾기"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <Search className="size-[18px]" aria-hidden />
        </button>
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          aria-label="샵·메뉴 이름으로 매물 찾기"
          placeholder="샵·메뉴 이름으로 찾기"
          autoComplete="off"
          maxLength={SEARCH_MAX_LENGTH}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => {
            setRecent(readRecent());
            setOpen(true);
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value ? (
          <button
            type="button"
            aria-label="입력한 글자 지우기"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              setValue('');
              inputRef.current?.focus();
            }}
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </form>
      {showRecent ? (
        <div
          className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl border bg-popover p-2 text-popover-foreground shadow-md"
          // 누르는 동안 칸의 초점이 빠져 목록이 먼저 닫히지 않게 한다(사파리는 버튼에 초점을 주지 않는다)
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <p className="text-xs font-semibold text-muted-foreground">최근 검색어</p>
            <button
              type="button"
              className="rounded text-xs text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => saveRecent([])}
            >
              모두 지우기
            </button>
          </div>
          <ul aria-label="최근 검색어">
            {recent.map((text) => (
              <li key={text} className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setValue(text);
                    search(text);
                  }}
                >
                  <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{text}</span>
                </button>
                <button
                  type="button"
                  aria-label={`최근 검색어 ${text} 지우기`}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => saveRecent(removeRecentSearch(recent, text))}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
