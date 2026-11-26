'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';

import { movedPhotoIndex, photoIndexAt, photoStepForKey } from './detail-format';

/** 화살표·닫기·번호는 흰 사진 위에서도 보이게 어두운 반투명 바탕에 흰 글자 */
const CONTROL_CLASS = 'bg-black/55 text-white hover:bg-black/75 hover:text-white';
const ARROW_CLASS = `absolute top-1/2 hidden -translate-y-1/2 md:inline-flex ${CONTROL_CLASS}`;

/**
 * 사진 크게 보기(11/26 정찬형). 상세 맨 위 사진을 누르면 화면 가득 검은 바탕에 사진 전체를 보여 준다.
 * 폰은 옆으로 밀어 넘기고, PC는 좌우 화살표나 키보드 ←·→로 넘긴다. Esc·닫기 버튼·뒤 배경으로 닫는다.
 * startIndex가 null이면 닫혀 있다. 매물 상세·시간대 상세·샵 프로필이 같이 쓴다(photo-gallery.tsx)
 */
export function PhotoViewer({
  urls,
  shopName,
  startIndex,
  onClose,
}: {
  urls: string[];
  shopName: string;
  /** 처음 보여 줄 사진 번호(0부터). null이면 닫힘 */
  startIndex: number | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={startIndex !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="top-0 left-0 h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none bg-black p-0 text-white shadow-none data-open:zoom-in-100 data-closed:zoom-out-100"
      >
        <DialogTitle className="sr-only">{shopName} 사진 크게 보기</DialogTitle>
        {/* 열 때마다 누른 사진부터 다시 시작한다 */}
        {startIndex !== null ? (
          <ViewerSlides key={startIndex} urls={urls} shopName={shopName} startIndex={startIndex} />
        ) : null}
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon-lg"
            className={`absolute top-3 right-3 z-10 ${CONTROL_CLASS}`}
          >
            <XIcon className="size-6" />
            <span className="sr-only">닫기</span>
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}

function ViewerSlides({
  urls,
  shopName,
  startIndex,
}: {
  urls: string[];
  shopName: string;
  startIndex: number;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(startIndex);
  const last = urls.length - 1;

  // 누른 사진이 바로 보이게, 그리기 전에 그 칸으로 옮겨 둔다(넘기는 움직임 없이)
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list) list.scrollLeft = startIndex * list.clientWidth;
  }, [startIndex]);

  /** 지금 보이는 사진(스크롤 위치)에서 step만큼 옮긴다 */
  function go(step: number) {
    const list = listRef.current;
    if (!list) return;
    const current = photoIndexAt(list.scrollLeft, list.clientWidth, urls.length);
    const next = movedPhotoIndex(current, step, urls.length);
    list.scrollTo({ left: next * list.clientWidth, behavior: 'smooth' });
  }

  // 키보드 ←·→. 창 안 어디에 초점이 있든(닫기 버튼 등) 넘긴다. 창이 열려 있는 동안만 붙어 있다
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const step = photoStepForKey(e.key);
      if (step === null) return;
      e.preventDefault();
      go(step);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  });

  return (
    <div className="relative flex size-full flex-col">
      <ul
        ref={listRef}
        aria-label={`${shopName} 사진`}
        className="flex flex-1 snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto"
        onScroll={(e) =>
          setIndex(
            photoIndexAt(e.currentTarget.scrollLeft, e.currentTarget.clientWidth, urls.length),
          )
        }
      >
        {urls.map((url, i) => (
          <li key={url} className="relative h-full w-full shrink-0 snap-center">
            <Image
              src={url}
              alt={`${shopName} 사진 ${i + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
              priority={i === startIndex}
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
              className={`${ARROW_CLASS} left-4`}
              aria-label="이전 사진"
              onClick={() => go(-1)}
            >
              <ChevronLeft className="size-7" />
            </Button>
          ) : null}
          {index < last ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className={`${ARROW_CLASS} right-4`}
              aria-label="다음 사진"
              onClick={() => go(1)}
            >
              <ChevronRight className="size-7" />
            </Button>
          ) : null}
          <p className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-sm text-white tabular-nums">
            <span className="sr-only">사진 </span>
            {index + 1} / {urls.length}
          </p>
        </>
      ) : null}
    </div>
  );
}
