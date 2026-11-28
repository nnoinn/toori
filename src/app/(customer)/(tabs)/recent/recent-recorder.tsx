'use client';

import { useEffect } from 'react';

import { rememberRecentEntry } from './recent-storage';
import type { RecentEntry } from './recent-rules';

/**
 * 매물·시간대 상세를 열면 이 기기의 최근 본 매물(C-212)에 남긴다. 그리는 것은 없다.
 * 볼 수 있는 매물(상세가 열린 매물)일 때만 상세 화면이 이 부품을 둔다
 */
export function RecentRecorder({ kind, id }: RecentEntry) {
  useEffect(() => {
    if (kind === 'window') rememberRecentEntry({ kind, id });
  }, [kind, id]);
  return null;
}
