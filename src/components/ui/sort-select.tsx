'use client';

// 목록 오른쪽 위의 정렬 고르기(#360 1번, 11/12 점검 8-1). 지금 무슨 기준으로 정렬했는지 칸에 보이고, 다른 기준을 고르면
// 그 정렬의 목록 주소로 간다. 주소는 화면(서버)이 만들어서 넘긴다: 검색어·거르기 같은 다른 값은 화면이 지켜서 넣는다.
// 쓰는 법:
//   <SortSelect value={sort} options={SORTS.map((value) => ({ value, label: LABELS[value], href: listHref({ ...now, sort: value }) }))} />

import { useId, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { cn } from '@/lib/utils';

import { NATIVE_SELECT_CLASS } from './native-select';

export type SortOption = {
  value: string;
  label: string;
  /** 이 정렬로 바꾼 목록 주소(화면이 만든 안쪽 주소) */
  href: string;
};

export function SortSelect({
  value,
  options,
  label = '정렬',
  className,
}: {
  /** 지금 정렬 */
  value: string;
  options: readonly SortOption[];
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();

  return (
    <div className={cn('flex shrink-0 items-center gap-2 text-sm', className)}>
      <label htmlFor={id} className="text-muted-foreground">
        {label}
      </label>
      {/* 브라우저 기본 꺽쇠는 칸 테두리에 붙고 여백으로도 옮겨지지 않아서 숨기고, 테두리에서 띄운 꺽쇠를 그린다(11/19 피드백) */}
      <span className="relative inline-flex">
        {/* 고르자마자 칸에 보이도록 기본값만 주고(key로 다시 그림), 새 목록이 오면 그 정렬로 다시 맞춘다 */}
        <select
          key={value}
          id={id}
          defaultValue={value}
          aria-busy={pending || undefined}
          className={cn(NATIVE_SELECT_CLASS, 'appearance-none pr-9')}
          onChange={(event) => {
            const next = options.find((option) => option.value === event.target.value);
            if (next) startTransition(() => router.push(next.href));
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </span>
    </div>
  );
}
