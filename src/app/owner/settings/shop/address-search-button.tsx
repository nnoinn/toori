'use client';

// 카카오(다음) 우편번호 서비스로 도로명 주소를 고른다(#23 D5, #51). 키가 필요 없고 패키지 없이 공식 스크립트를 쓴다.
// 새 브라우저 창(팝업)은 차단되기 쉬워서, 화면 안 창(Dialog)에 검색 화면을 넣는다(embed).
// 고른 도로명 주소는 저장할 때 서버가 geocodeAddress로 좌표·지역을 만든다.

import { useCallback, useState } from 'react';
import Script from 'next/script';
import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

  // 창 안의 빈 칸이 화면에 붙는 순간 검색 화면을 넣는다
  const embedSearch = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      if (!window.daum) {
        setOpen(false);
        onError('주소 찾기 창을 열 수 없어요. 잠시 후 다시 시도해 주세요');
        return;
      }
      // 다시 그려질 때 검색 화면이 두 개 쌓이지 않게 비운다
      element.replaceChildren();
      new window.daum.Postcode({
        width: '100%',
        height: '100%',
        oncomplete: (data) => {
          setOpen(false);
          // 지번 주소를 골라도 도로명 주소가 같이 온다. 도로명이 없는 드문 경우는 다시 고르게 한다
          if (data.roadAddress) onSelect(data.roadAddress);
          else onError('도로명 주소가 있는 주소를 골라 주세요');
        },
      }).embed(element);
    },
    [onSelect, onError],
  );

  return (
    <>
      <Script
        src={POSTCODE_SCRIPT_URL}
        strategy="lazyOnload"
        onReady={() => setReady(true)}
        onError={() => onError('주소 찾기 창을 불러오지 못했어요. 새로고침해 주세요')}
      />
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => setOpen(true)}
        disabled={!ready}
      >
        <Search aria-hidden />
        주소 찾기
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>주소 찾기</DialogTitle>
            <DialogDescription>
              도로명, 건물 이름, 지번으로 검색하고 샵 주소를 골라 주세요
            </DialogDescription>
          </DialogHeader>
          <div ref={embedSearch} className="h-[28rem] w-full overflow-hidden rounded-lg border" />
        </DialogContent>
      </Dialog>
    </>
  );
}
