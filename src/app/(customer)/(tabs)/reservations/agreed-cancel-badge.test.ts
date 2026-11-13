// 기댓값 출처: 합의 후 취소 규칙(CLAUDE.md "합의 후 취소", S-410·C-506·X-208): 손님이 24시간 안에 답하지 않으면 예약은 그대로,
// 거절하면 예약은 그대로, 요청은 예정 예약(방문·노쇼 처리 전)에만. #359 3번: 답을 기다리는 요청이 있으면 목록 카드에 뱃지

import { describe, expect, it } from 'vitest';

import { hasPendingAgreedCancel } from './agreed-cancel-badge';

const NOW = new Date('2026-11-13T12:00:00+09:00');
const LATER = new Date('2026-11-14T10:00:00+09:00');
const confirmed = { status: 'confirmed', visitResult: null } as const;

describe('합의 후 취소 요청 뱃지', () => {
  it('답 기한 전이고 예정 예약이면 뱃지', () => {
    expect(hasPendingAgreedCancel({ status: 'requested', expiresAt: LATER }, confirmed, NOW)).toBe(
      true,
    );
  });

  it('요청이 없거나, 거절·동의했거나, 답 기한(24시간)이 지났으면 없음', () => {
    expect(hasPendingAgreedCancel(null, confirmed, NOW)).toBe(false);
    expect(hasPendingAgreedCancel({ status: 'declined', expiresAt: LATER }, confirmed, NOW)).toBe(
      false,
    );
    expect(hasPendingAgreedCancel({ status: 'agreed', expiresAt: LATER }, confirmed, NOW)).toBe(
      false,
    );
    // 기한 시각이 되면 만료(상태를 아직 바꾸지 않았어도)
    expect(hasPendingAgreedCancel({ status: 'requested', expiresAt: NOW }, confirmed, NOW)).toBe(
      false,
    );
  });

  it('예약이 취소됐거나 방문·노쇼 처리됐으면 없음', () => {
    const pending = { status: 'requested', expiresAt: LATER } as const;
    expect(hasPendingAgreedCancel(pending, { status: 'cancelled', visitResult: null }, NOW)).toBe(
      false,
    );
    expect(
      hasPendingAgreedCancel(pending, { status: 'confirmed', visitResult: 'no_show' }, NOW),
    ).toBe(false);
  });
});
