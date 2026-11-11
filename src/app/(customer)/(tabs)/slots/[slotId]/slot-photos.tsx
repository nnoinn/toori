'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { photoIndexAt } from './detail-format';

const ARROW_CLASS = 'absolute top-1/2 hidden -translate-y-1/2 bg-background/80 md:inline-flex';

/**
 * 매물 상세의 사진 줄(C-303). 폰은 옆으로 밀어 넘기고, PC는 마우스로 밀 수 없어서 좌우 화살표로 넘긴다.
 * 2장 이상이면 지금 몇 번째인지 보여 준다. 위치 기준(relative)은 감싸는 쪽에 있다.
 */
export function SlotPhotos({ urls, shopName }: { urls: string[]; shopName: string }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const last = urls.length - 1;

  function go(next: number) {
    const list = listRef.current;
    list?.scrollTo({ left: next * list.clientWidth, behavior: 'smooth' });
  }

  return (
    <>
      <ul
        ref={listRef}
        // PC는 화살표로 넘겨서 사진 아래 가로 스크롤 막대를 숨긴다
        className="flex snap-x snap-mandatory overflow-x-auto md:[scrollbar-width:none]"
        aria-label="스타일 이미지"
        onScroll={(e) =>
          setIndex(
            photoIndexAt(e.currentTarget.scrollLeft, e.currentTarget.clientWidth, urls.length),
          )
        }
      >
        {urls.map((url, i) => (
          <li key={url} className="relative aspect-[4/3] w-full shrink-0 snap-center">
            <Image
              src={url}
              alt={`${shopName} 이미지 ${i + 1}`}
              fill
              sizes="(max-width: 768px) 100vw, 60vw"
              className="object-cover"
              preload={i === 0}
            />
          </li>
        ))}
      </ul>
      {last > 0 ? (
        <>
          {index > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className={`${ARROW_CLASS} left-2`}
              aria-label="이전 사진"
              onClick={() => go(index - 1)}
            >
              <ChevronLeft className="size-6" />
            </Button>
          ) : null}
          {index < last ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className={`${ARROW_CLASS} right-2`}
              aria-label="다음 사진"
              onClick={() => go(index + 1)}
            >
              <ChevronRight className="size-6" />
            </Button>
          ) : null}
          <p className="absolute right-2 bottom-2 rounded-full bg-foreground/60 px-2 py-0.5 text-xs text-background tabular-nums">
            <span className="sr-only">사진 </span>
            {index + 1} / {urls.length}
          </p>
        </>
      ) : null}
    </>
  );
}
