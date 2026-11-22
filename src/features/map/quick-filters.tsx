'use client';

import { useRouter } from 'next/navigation';
import { cn } from 'cn';

import { SHOP_CATEGORIES, type ShopCategory } from '@/server/policy';

import {
  applyFiltersToSearch,
  type HomeFilters,
  QUICK_MIN_DISCOUNT,
  selectCategory,
  toggleQuickDiscount,
} from './filters';

/**
 * 매물 목록 위 빠른 고르기 칩(11/18 정찬형, 지도 앱의 "음식점·카페" 칩처럼). [필터]를 열지 않고
 * 업종(전체·미용실·네일·속눈썹)과 "30% 이상"을 바로 고른다. 고른 값은 [필터]와 같은 주소창 값이라 서로 이어진다
 */
export function QuickFilters({ filters }: { filters: HomeFilters }) {
  const router = useRouter();

  function apply(next: HomeFilters) {
    const query = applyFiltersToSearch(
      new URLSearchParams(window.location.search),
      next,
    ).toString();
    const path = window.location.pathname;
    router.replace(query ? `${path}?${query}` : path, { scroll: false });
  }

  const categories: { key: ShopCategory | null; label: string }[] = [
    { key: null, label: '전체' },
    ...SHOP_CATEGORIES.map((category) => ({ key: category.key, label: category.label })),
  ];

  return (
    // 폰에서는 한 줄로 두고 옆으로 밀어 본다
    <div
      role="group"
      aria-label="빠른 고르기"
      className="flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 md:flex-wrap md:px-0"
    >
      {categories.map((category) => (
        <Chip
          key={category.key ?? 'all'}
          selected={filters.category === category.key}
          onClick={() => apply(selectCategory(filters, category.key))}
        >
          {category.label}
        </Chip>
      ))}
      <Chip
        selected={filters.minDiscount === QUICK_MIN_DISCOUNT}
        onClick={() => apply(toggleQuickDiscount(filters))}
      >
        {QUICK_MIN_DISCOUNT}% 이상
      </Chip>
    </div>
  );
}

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
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'h-8 shrink-0 rounded-full border px-3 text-sm whitespace-nowrap transition-colors max-md:h-10',
        selected
          ? 'border-foreground bg-foreground font-semibold text-background'
          : 'bg-card text-foreground hover:bg-muted',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
