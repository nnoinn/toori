// 쪽 번호(목록 아래, 11/15 nnoinn 계정 이력). 링크로 쪽을 넘겨서 서버 화면에서 그대로 쓴다.
// 처음·끝 쪽과 지금 쪽 앞뒤 2쪽을 보여주고, 건너뛴 자리는 "…"로 줄인다. 쪽이 하나면 아무것도 그리지 않는다.
// 쓰는 법: <Pagination page={2} pageCount={9} href={(page) => `/admin/...?page=${page}`} />

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

import { buttonVariants } from './button';

/** 보여줄 쪽 번호. 사이를 건너뛰면 'gap'. 예: (6, 20) → [1, 'gap', 4, 5, 6, 7, 8, 'gap', 20] */
export function pageItems(page: number, pageCount: number, around = 2): (number | 'gap')[] {
  const pages = new Set<number>([1, pageCount]);
  for (let p = page - around; p <= page + around; p += 1) {
    if (p >= 1 && p <= pageCount) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? ['gap' as const, p] : [p]));
}

export function Pagination({
  page,
  pageCount,
  href,
  className,
}: {
  /** 지금 쪽(1부터) */
  page: number;
  pageCount: number;
  /** 그 쪽을 여는 주소 */
  href: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  const arrow = buttonVariants({ variant: 'ghost', size: 'icon' });
  return (
    <nav aria-label="쪽 번호" className={cn('flex items-center justify-center gap-1', className)}>
      {page > 1 ? (
        <Link href={href(page - 1)} aria-label="이전 쪽" className={arrow}>
          <ChevronLeft />
        </Link>
      ) : (
        <span aria-hidden className={cn(arrow, 'opacity-30')}>
          <ChevronLeft />
        </span>
      )}
      {pageItems(page, pageCount).map((item, i) =>
        item === 'gap' ? (
          <span key={`gap-${i}`} aria-hidden className="px-1 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={href(item)}
            aria-label={`${item}쪽`}
            aria-current={item === page ? 'page' : undefined}
            className={buttonVariants({
              variant: item === page ? 'default' : 'ghost',
              size: 'icon',
              className: 'w-auto min-w-8 px-2 tabular-nums',
            })}
          >
            {item}
          </Link>
        ),
      )}
      {page < pageCount ? (
        <Link href={href(page + 1)} aria-label="다음 쪽" className={arrow}>
          <ChevronRight />
        </Link>
      ) : (
        <span aria-hidden className={cn(arrow, 'opacity-30')}>
          <ChevronRight />
        </span>
      )}
    </nav>
  );
}
