'use client';

import { useState } from 'react';
import { cn } from 'cn';

import { PhotoFrame } from '@/components/ui/photo-frame';

import { PhotoViewer } from './photo-viewer';
import { SlotPhotos } from './slot-photos';

/** PC 사진 묶음의 칸 수: 큰 사진 1장 + 작은 사진 4장(11/18 정찬형, 회의 피드백 5번 A안) */
export const GALLERY_SLOTS = 5;

const TILE_BUTTON =
  'absolute inset-0 cursor-zoom-in focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset';

/**
 * 상세 맨 위 사진(C-303). 사진이 아직 없는 샵도 사진이 들어갈 칸을 미리 보여 준다(11/15 회의).
 * 폰은 사진을 옆으로 밀어 넘기고, 사진이 없으면 같은 크기의 빈 칸 하나다.
 * PC는 큰 사진 1장과 작은 사진 4장 칸이고, 모자라면 빈 칸, 5장보다 많으면 마지막 칸에 "+N".
 * 사진을 누르면 크게 보기(photo-viewer.tsx)가 그 사진부터 열린다. "+N" 칸을 누르면 그 칸 사진부터 나머지를 모두 넘겨 볼 수 있다
 */
export function PhotoGallery({ urls, shopName }: { urls: string[]; shopName: string }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const extra = urls.length - GALLERY_SLOTS;

  return (
    <>
      <div className="md:hidden">
        {urls.length > 0 ? (
          <SlotPhotos urls={urls} shopName={shopName} onOpen={setViewerIndex} />
        ) : (
          <PhotoFrame alt={`${shopName} 사진`} sizes="100vw" className="aspect-[4/3] w-full" />
        )}
      </div>
      <ul
        aria-label={`${shopName} 사진`}
        className="hidden h-[360px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl md:grid"
      >
        {Array.from({ length: GALLERY_SLOTS }, (_, i) => {
          const hasMore = i === GALLERY_SLOTS - 1 && extra > 0;
          return (
            <li key={i} className={cn('relative', i === 0 && 'col-span-2 row-span-2')}>
              <PhotoFrame
                src={urls[i]}
                alt={`${shopName} 사진 ${i + 1}`}
                sizes={i === 0 ? '480px' : '240px'}
                priority={i === 0}
                // 회색 바탕 위에서 빈 칸이 보이게 흰 칸으로 둔다
                className="size-full bg-card"
              />
              {hasMore ? (
                <span
                  className="absolute inset-0 flex items-center justify-center bg-foreground/50 text-lg font-semibold text-background"
                  aria-hidden
                >
                  +{extra}
                </span>
              ) : null}
              {urls[i] ? (
                <button
                  type="button"
                  className={TILE_BUTTON}
                  aria-label={
                    hasMore
                      ? `사진 ${i + 1} 크게 보기(사진 ${extra}장 더 있어요)`
                      : `사진 ${i + 1} 크게 보기`
                  }
                  onClick={() => setViewerIndex(i)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <PhotoViewer
        urls={urls}
        shopName={shopName}
        startIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </>
  );
}
