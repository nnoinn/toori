'use client';

// 카카오(다음) 우편번호 서비스로 도로명 주소를 고른다(#23 D5, #51). 키가 필요 없고 패키지 없이 공식 스크립트를 쓴다.
// 새 브라우저 창(팝업)은 차단되기 쉬워서, 화면 안 창에 검색 화면을 넣는다(embed).
// 고른 도로명 주소는 저장할 때 서버가 geocodeAddress로 좌표·지역을 만든다.

import { useEffect, useId, useRef, useState } from 'react';
import Script from 'next/script';
import { cn } from 'cn';
import { Search, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

const POSTCODE_SCRIPT_URL = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

// 우편번호 서비스에서 쓰는 부분만 적은 타입
declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: { roadAddress: string }) => void;
        width?: string;
        height?: string;
      }) => { embed: (element: HTMLElement) => void };
    };
  }
}

type AddressSearchButtonProps = {
  onSelect: (roadAddress: string) => void;
  onError: (message: string) => void;
};

export function AddressSearchButton({ onSelect, onError }: AddressSearchButtonProps) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const embeddedRef = useRef(false);
  // 검색 화면은 한 번만 넣으므로, 고른 뒤 부를 함수는 늘 최신 것을 쓰게 ref로 둔다
  const callbacksRef = useRef({ onSelect, onError });
  useEffect(() => {
    callbacksRef.current = { onSelect, onError };
  }, [onSelect, onError]);

  const layerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // 열려 있는 동안 Esc로 닫고, 창으로 포커스를 옮기고, 뒤 화면이 스크롤되지 않게 한다
  useEffect(() => {
    if (!open) return;
    layerRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // 처음 열 때 창 안 빈 칸에 검색 화면을 넣는다. 창은 닫아도 지우지 않고 숨기기만 한다.
  // 검색 화면(iframe)을 지우면 카카오 스크립트가 없어진 화면을 찾다가 오류를 낸다
  function openSearch() {
    const container = containerRef.current;
    if (!window.daum || !container) {
      onError('주소 찾기 창을 열 수 없어요. 잠시 후 다시 시도해 주세요');
      return;
    }
    if (!embeddedRef.current) {
      new window.daum.Postcode({
        width: '100%',
        height: '100%',
        oncomplete: (data) => {
          setOpen(false);
          // 지번 주소를 골라도 도로명 주소가 같이 온다. 도로명이 없는 드문 경우는 다시 고르게 한다
          if (data.roadAddress) callbacksRef.current.onSelect(data.roadAddress);
          else callbacksRef.current.onError('도로명 주소가 있는 주소를 골라 주세요');
        },
      }).embed(container);
      embeddedRef.current = true;
    }
    setOpen(true);
  }

  return (
    <>
      <Script
        src={POSTCODE_SCRIPT_URL}
        strategy="lazyOnload"
        onReady={() => setReady(true)}
        onError={() => onError('주소 찾기 창을 불러오지 못했어요. 새로고침해 주세요')}
      />
      <Button type="button" variant="outline" size="lg" onClick={openSearch} disabled={!ready}>
        <Search aria-hidden />
        주소 찾기
      </Button>
      {/* 닫아도 지우지 않고 숨기기만 한다. 공통 Dialog는 닫으면 내용을 지워서 카카오 검색 화면(iframe)이 오류를 낸다 */}
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4',
          !open && 'hidden',
        )}
        onClick={() => setOpen(false)}
      >
        <div
          ref={layerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="relative flex w-full max-w-lg flex-col gap-4 rounded-xl bg-popover p-5 text-sm text-popover-foreground shadow-lg outline-none"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex flex-col gap-1 pr-8">
            <h2 id={titleId} className="text-base font-semibold">
              주소 찾기
            </h2>
            <p className="text-sm text-muted-foreground">
              도로명, 건물 이름, 지번으로 검색하고 샵 주소를 골라 주세요
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3"
            onClick={() => setOpen(false)}
          >
            <XIcon />
            <span className="sr-only">닫기</span>
          </Button>
          <div ref={containerRef} className="h-[28rem] w-full overflow-hidden rounded-lg border" />
        </div>
      </div>
    </>
  );
}
