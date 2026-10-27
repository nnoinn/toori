// 약관 버전 (연결 #5, Issue #48 6장). 동의할 때 이 값이 terms_agreements.version에 그대로 남는다.
// 약관 초안이 확정되기 전까지는 모두 임시값이다. 확정되면 nnoinn이 값만 바꾼다(#79).

import type { TermsType } from '@/db/schema/accounts';

export const TERMS_VERSIONS = {
  service: 'draft-2026-10',
  privacy: 'draft-2026-10',
  location: 'draft-2026-10',
  supplier: 'draft-2026-10',
  marketing: 'draft-2026-10',
  age14: 'draft-2026-10',
} as const satisfies Record<TermsType, string>;
