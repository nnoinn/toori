'use client';

import { useSyncExternalStore } from 'react';

// PC 버전 기준(md, 768px). 기술 가이드 "화면 크기: PC 먼저"
const DESKTOP_QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** PC 폭인지. 서버에서 그릴 때는 폰으로 본다(처음 그린 뒤 브라우저 폭으로 바뀐다) */
export function useIsDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}
