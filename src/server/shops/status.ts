// 입점 상태 화면 문구 (연결 #13, Issue #50 1·2장). 화면('use client')에서도 가져다 쓴다.

import type { ShopStatus } from '@/db/schema/shops';

export type { ShopStatus } from '@/db/schema/shops';

export const SHOP_STATUS_LABELS = {
  pending: '승인 대기',
  approved: '승인',
  rejected: '반려',
} as const satisfies Record<ShopStatus, string>;
