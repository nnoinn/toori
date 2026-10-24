'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { SHOP_CATEGORIES } from '@/server/policy';

import {
  applyFiltersToSearch,
  countActiveFilters,
  EMPTY_FILTERS,
  selectCategory,
  serviceTypesOf,
  toggleService,
  type HomeFilters,
} from './filters';

/** 가격대·시간대·할인율은 정책값(강규민 W4, #48)이 들어오면 연결한다 */
const PENDING_SECTIONS = ['가격대', '시간대', '할인율'];

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

/** 홈 위쪽 필터 버튼과 필터 시트 (J5, C-206). 고른 값은 주소창에 저장한다 */
export function FilterSheet({ filters }: { filters: HomeFilters }) {
  const router = useRouter();
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

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="lg" className="gap-1 px-2">
          <SlidersHorizontal aria-hidden />
          필터
          {activeCount > 0 ? (
            <span className="ml-0.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85dvh] max-w-[480px] rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle>필터</SheetTitle>
          <SheetDescription>고른 조건의 매물만 보여 드려요.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 overflow-y-auto px-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">업종</h3>
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
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">서비스 종류</h3>
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
          </section>

          {PENDING_SECTIONS.map((title) => (
            <section key={title} className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">준비 중이에요.</p>
            </section>
          ))}
        </div>

        <SheetFooter className="flex-row gap-2">
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
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
