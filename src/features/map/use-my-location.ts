'use client';

import { useState, useTransition } from 'react';

import { saveMyLocation } from './location-actions';

/** 브라우저가 위치를 주지 않을 때 기다리는 최대 시간 */
const GEOLOCATION_TIMEOUT_MS = 10_000;

export type MyLocationStatus = 'idle' | 'locating' | 'failed';

/** 브라우저 위치 API로 내 위치를 받아 서버(쿠키)에 저장한다. 거부·실패하면 status가 'failed' */
export function useMyLocation(onSaved?: () => void) {
  const [status, setStatus] = useState<MyLocationStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function failWith(text: string) {
    setStatus('failed');
    setMessage(text);
  }

  function requestLocation() {
    if (!('geolocation' in navigator)) {
      failWith('이 브라우저에서는 위치를 쓸 수 없어요. 동네를 골라 주세요');
      return;
    }
    setStatus('locating');
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        startTransition(async () => {
          const result = await saveMyLocation(point);
          if (!result.ok) {
            failWith(result.error.message);
            return;
          }
          setStatus('idle');
          onSaved?.();
        });
      },
      (error) => {
        failWith(
          error.code === error.PERMISSION_DENIED
            ? '위치 권한이 꺼져 있어요. 동네를 골라 주세요'
            : '위치를 가져오지 못했어요. 동네를 골라 주세요',
        );
      },
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 60_000 },
    );
  }

  return { status, message, requestLocation };
}
