'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { Share2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { SHARE_COPIED_MESSAGE, SHARE_FAILED_MESSAGE, slotSharePath } from './share-rules';

/** 안내 문구를 보여 두는 시간(ms) */
const NOTICE_MS = 2500;

/**
 * 매물 [공유] 버튼(C-310). 폰처럼 공유 창이 있으면 공유 창(카톡·인스타 등)을 열고, 없으면(PC 등) 링크를 복사한다.
 * 링크는 매물 상세 주소(로그인 없이 열린다)이고, 붙이면 미리보기 그림(opengraph-image.tsx)이 뜬다
 */
export function ShareButton({
  slotId,
  title,
  text,
}: {
  slotId: string;
  title: string;
  text: string;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 상세를 떠나면 Next.js가 이 화면을 숨겨 두었다가 그대로 다시 보여준다(Activity). 떠날 때 안내를 지운다
  useLayoutEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      setNotice(null);
    },
    [],
  );

  function show(message: string) {
    setNotice(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }

  async function share() {
    const url = `${window.location.origin}${slotSharePath(slotId)}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // 공유 창을 닫았으면 아무것도 하지 않는다
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      show(SHARE_COPIED_MESSAGE);
    } catch {
      show(SHARE_FAILED_MESSAGE);
    }
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1 max-md:h-10 max-md:px-3"
        onClick={share}
      >
        <Share2 className="size-4" aria-hidden />
        공유
      </Button>
      <p
        role="status"
        className={
          notice
            ? 'absolute top-full right-0 z-10 mt-1 rounded-lg bg-foreground px-2.5 py-1.5 text-xs whitespace-nowrap text-background shadow'
            : 'sr-only'
        }
      >
        {notice ?? ''}
      </p>
    </div>
  );
}
