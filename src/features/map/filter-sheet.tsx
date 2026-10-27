'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { PRICE_FILTER_RANGES, SHOP_CATEGORIES, TIME_FILTER_RANGES } from '@/server/policy';

import {
  applyFiltersToSearch,
  countActiveFilters,
  EMPTY_FILTERS,
  MIN_DISCOUNT_OPTIONS,
  selectCategory,
  selectMinDiscount,
  serviceTypesOf,
  togglePrice,
  toggleService,
  toggleTime,
  type HomeFilters,
} from './filters';
import { useIsDesktop } from './use-is-desktop';

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={selected ? 'default' : 'outline'}
      className="h-9 rounded-full px-4"
      aria-pressed={selected}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** 필터 선택지. PC 펼침 창과 폰 시트가 같이 쓴다 */
function FilterOptions({
  draft,
  setDraft,
}: {
  draft: HomeFilters;
  setDraft: (next: HomeFilters) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <FilterSection title="업종">
        <div className="flex flex-wrap gap-2">
          <Chip
            selected={draft.category === null}
            onClick={() => setDraft(selectCategory(draft, null))}
          >
            전체
          </Chip>
          {SHOP_CATEGORIES.map((category) => (
            <Chip
              key={category.key}
              selected={draft.category === category.key}
              onClick={() => setDraft(selectCategory(draft, category.key))}
            >
              {category.label}
            </Chip>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="서비스 종류">
        {draft.category ? (
          <div className="flex flex-wrap gap-2">
            {serviceTypesOf(draft.category).map((type) => (
              <Chip
                key={type.key}
                selected={draft.services.includes(type.key)}
                onClick={() => setDraft(toggleService(draft, type.key))}
              >
                {type.label}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            업종을 고르면 서비스 종류를 고를 수 있어요.
          </p>
        )}
      </FilterSection>

      <FilterSection title="가격대 (할인가)">
        <div className="flex flex-wrap gap-2">
          {PRICE_FILTER_RANGES.map((range) => (
            <Chip
              key={range.key}
              selected={draft.prices.includes(range.key)}
              onClick={() => setDraft(togglePrice(draft, range.key))}
            >
              {range.label}
            </Chip>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="시간대">
        <div className="flex flex-wrap gap-2">
          {TIME_FILTER_RANGES.map((range) => (
            <Chip
              key={range.key}
              selected={draft.times.includes(range.key)}
              onClick={() => setDraft(toggleTime(draft, range.key))}
            >
              {range.label}
            </Chip>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="할인율">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="최소 할인율">
          <Chip
            selected={draft.minDiscount === null}
            onClick={() => setDraft(selectMinDiscount(draft, null))}
          >
            전체
          </Chip>
          {MIN_DISCOUNT_OPTIONS.map((option) => (
            <Chip
              key={option.rate}
              selected={draft.minDiscount === option.rate}
              onClick={() => setDraft(selectMinDiscount(draft, option.rate))}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </FilterSection>
    </div>
  );
}

/**
 * 홈 위쪽 필터 버튼과 필터 창 (J5, C-206). 고른 값은 주소창에 저장한다.
 * PC(md 이상)는 버튼 아래로 펼쳐지는 창, 폰은 아래에서 올라오는 시트(10/25, #95 리뷰)
 */
export function FilterSheet({ filters }: { filters: HomeFilters }) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<HomeFilters>(filters);
  const activeCount = countActiveFilters(filters);

  function handleOpenChange(next: boolean) {
    // 열 때마다 지금 적용된 값에서 시작한다
    if (next) setDraft(filters);
    setOpen(next);
  }

  function apply() {
    const search = applyFiltersToSearch(new URLSearchParams(window.location.search), draft);
    const query = search.toString();
    // 지금 화면 주소는 그대로 두고 주소 뒤 값만 바꾼다
    const path = window.location.pathname;
    router.replace(query ? `${path}?${query}` : path, { scroll: false });
    setOpen(false);
  }

  const trigger = (
    <Button type="button" variant="ghost" size="lg" className="gap-1 px-2">
      <SlidersHorizontal aria-hidden />
      필터
      {activeCount > 0 ? (
        <span className="ml-0.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
          {activeCount}
        </span>
      ) : null}
    </Button>
  );

  const actions = (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-12 flex-1"
        onClick={() => setDraft(EMPTY_FILTERS)}
      >
        초기화
      </Button>
      <Button type="button" size="lg" className="h-12 flex-[2]" onClick={apply}>
        적용하기
      </Button>
    </>
  );

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          aria-label="필터"
          className="flex max-h-[calc(100dvh-8rem)] w-[440px] flex-col"
        >
          <div className="flex flex-col gap-1 px-5 pt-4 pb-3">
            <h2 className="font-semibold">필터</h2>
            <p className="text-sm text-muted-foreground">고른 조건의 매물만 보여 드려요.</p>
          </div>
          <div className="overflow-y-auto px-5 pb-4">
            <FilterOptions draft={draft} setDraft={setDraft} />
          </div>
          <div className="flex gap-2 border-t px-5 py-3">{actions}</div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85dvh] max-w-[480px] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle>필터</SheetTitle>
          <SheetDescription>고른 조건의 매물만 보여 드려요.</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4">
          <FilterOptions draft={draft} setDraft={setDraft} />
        </div>
        <SheetFooter className="flex-row gap-2">{actions}</SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
