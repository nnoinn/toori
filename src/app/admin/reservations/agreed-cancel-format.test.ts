// 운영자 예약 상세 '합의 후 취소 요청' 칸의 표시 모양(X-208)

import { describe, expect, it } from 'vitest';

import { agreedCancelTimeText, agreedCancelViews } from './agreed-cancel-format';
import type { ReservationAgreedCancelRow } from './agreed-cancel-queries';

const at = (iso: string) => new Date(`${iso}+09:00`);
const REQUESTED_AT = at('2026-11-11T10:00:00');
const EXPIRES_AT = at('2026-11-12T10:00:00');
const RESPONDED_AT = at('2026-11-11T15:30:00');

function row(extra: Partial<ReservationAgreedCancelRow> = {}): ReservationAgreedCancelRow {
  return {
    requestId: 'request-1',
    reason: 'style_mismatch',
    reasonText: null,
    status: 'requested',
    requestedAt: REQUESTED_AT,
    expiresAt: EXPIRES_AT,
    respondedAt: null,
    ...extra,
  };
}

const confirmed = { status: 'confirmed', visitResult: null } as const;

describe('상태에 맞는 시각 한 줄', () => {
  const times = { expiresAt: EXPIRES_AT, respondedAt: RESPONDED_AT };

  it('답을 기다리면 답할 수 있는 마지막 시각, 만료면 답 기한', () => {
    expect(agreedCancelTimeText('requested', times)).toBe(
      '2026-11-12 10:00까지 손님이 답할 수 있어요',
    );
    expect(agreedCancelTimeText('expired', { ...times, respondedAt: null })).toBe(
      '2026-11-12 10:00까지 답이 없었어요',
    );
  });

  it('동의·거절은 손님이 답한 시각, 끝남은 기록한 시각', () => {
    expect(agreedCancelTimeText('agreed', times)).toBe('2026-11-11 15:30 손님이 답함');
    expect(agreedCancelTimeText('declined', times)).toBe('2026-11-11 15:30 손님이 답함');
    expect(agreedCancelTimeText('closed', times)).toBe('2026-11-11 15:30 끝남');
  });

  it('기록한 시각이 아직 없으면 보여 주지 않는다', () => {
    const notYet = { expiresAt: EXPIRES_AT, respondedAt: null };
    expect(agreedCancelTimeText('agreed', notYet)).toBeNull();
    expect(agreedCancelTimeText('declined', notYet)).toBeNull();
    expect(agreedCancelTimeText('closed', notYet)).toBeNull();
  });
});

describe('요청을 지금 상태로', () => {
  it('답 기한 전이고 예약이 예정이면 답을 기다림 그대로', () => {
    const [view] = agreedCancelViews([row()], confirmed, at('2026-11-12T09:59:00'));
    expect(view).toEqual({
      requestId: 'request-1',
      status: 'requested',
      reason: 'style_mismatch',
      reasonText: null,
      requestedAt: REQUESTED_AT,
      timeText: '2026-11-12 10:00까지 손님이 답할 수 있어요',
    });
  });

  it('정리 작업이 바꾸기 전이라도 답 기한이 지났으면 만료로 보인다(기한과 같은 시각부터)', () => {
    const [view] = agreedCancelViews([row()], confirmed, EXPIRES_AT);
    expect(view.status).toBe('expired');
    expect(view.timeText).toBe('2026-11-12 10:00까지 답이 없었어요');
  });

  it('답하기 전에 예약이 취소되거나 방문 처리됐으면 끝남으로 보이고, 기록 전이면 시각은 없다', () => {
    const before = at('2026-11-11T12:00:00');
    const [cancelled] = agreedCancelViews(
      [row()],
      { status: 'cancelled', visitResult: null },
      before,
    );
    expect(cancelled).toMatchObject({ status: 'closed', timeText: null });
    const [visited] = agreedCancelViews(
      [row()],
      { status: 'completed', visitResult: 'visited' },
      before,
    );
    expect(visited.status).toBe('closed');
  });

  it('이미 답한 요청은 저장된 상태 그대로, 순서도 받은 그대로', () => {
    const views = agreedCancelViews(
      [
        row({ requestId: 'newer', status: 'declined', respondedAt: RESPONDED_AT }),
        row({ requestId: 'older', status: 'agreed', respondedAt: RESPONDED_AT, reason: 'other' }),
      ],
      { status: 'cancelled', visitResult: null },
      at('2026-11-13T00:00:00'),
    );
    expect(views.map((view) => [view.requestId, view.status])).toEqual([
      ['newer', 'declined'],
      ['older', 'agreed'],
    ]);
  });
});
