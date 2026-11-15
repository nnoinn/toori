// 약관 버전 (연결 #5, Issue #48 6장). 동의할 때 이 값이 terms_agreements.version에 그대로 남는다.
// 약관 초안이 확정되기 전까지는 모두 임시값이다. 확정되면 nnoinn이 값만 바꾼다(#79).

import type { TermsType } from '@/db/schema/accounts';

export const TERMS_VERSIONS = {
  service: 'draft-2026-10',
  // 동의 문구 1-1에 이름을 더함(#375, 11/14)
  privacy: 'draft-2026-11',
  location: 'draft-2026-10',
  supplier: 'draft-2026-10',
  // 동의 문구 1-2장(이벤트·혜택, #266·#284 리뷰, 11/8)
  marketing: 'draft-2026-11',
  age14: 'draft-2026-10',
  // 동의 문구 7장(#266·#274, 11/8)
  interest_alert: 'draft-2026-11',
} as const satisfies Record<TermsType, string>;

/**
 * 결제 버튼 위 필수 동의 2개의 문구 버전(C-402, 동의 문구 3장·3-1장). 주문(orders)에 버전과 동의 시각을 남긴다.
 * 동의 문구가 확정되면 nnoinn이 값만 바꾼다
 */
export const CHECKOUT_CONSENT_VERSIONS = {
  refundPolicy: 'draft-2026-10',
  // 동의 문구 3-1 항목을 닉네임에서 이름으로(#375, 11/14)
  bookerInfo: 'draft-2026-11',
} as const;
