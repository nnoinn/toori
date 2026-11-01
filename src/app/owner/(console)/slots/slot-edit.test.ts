import { describe, expect, it } from 'vitest';

import { canEditSlot, type SlotHoldInput } from '@/features/slot-status/slot-status';
import { SLOT_STATUS_CASES } from '@/features/slot-status/slot-status-cases';

import { slotEditProblem } from './slot-edit';

const noHold: SlotHoldInput = { holdCustomerId: null, holdExpiresAt: null };
const heldUntil = (now: Date, deltaMs: number): SlotHoldInput => ({
  holdCustomerId: 'c1',
  holdExpiresAt: new Date(now.getTime() + deltaMs),
});

describe('매물 수정·마감 가능 여부 (O10, S-206)', () => {
  it('O1 canEditSlot과 같은 답을 낸다(상태 경우 × 홀딩 없음·홀딩 중·만료)', () => {
    for (const { name, slot, now } of SLOT_STATUS_CASES) {
      for (const hold of [noHold, heldUntil(now, 60_000), heldUntil(now, 0)]) {
        const input = { ...slot, ...hold };
        expect(slotEditProblem(input, now) === null, name).toBe(canEditSlot(input, now));
      }
    }
  });

  it('막힌 이유를 상태별로 알려준다', () => {
    const now = new Date('2026-10-31T12:00:00+09:00');
    const base = {
      publishAt: new Date('2026-10-30T12:00:00+09:00'),
      startAt: new Date('2026-11-01T12:00:00+09:00'),
      ...noHold,
    };
    expect(slotEditProblem({ ...base, status: 'published' }, now)).toBeNull();
    expect(slotEditProblem({ ...base, status: 'published', ...heldUntil(now, 60_000) }, now)).toBe(
      'SLOT_ON_HOLD',
    );
    expect(slotEditProblem({ ...base, status: 'reserved' }, now)).toBe('SLOT_RESERVED');
    expect(slotEditProblem({ ...base, status: 'closed' }, now)).toBe('SLOT_CLOSED');
    expect(slotEditProblem({ ...base, status: 'cancelled' }, now)).toBe('SLOT_ENDED');
    expect(slotEditProblem({ ...base, status: 'completed' }, now)).toBe('SLOT_ENDED');
    // 시작이 지난 게시중 매물은 마감으로 본다
    expect(
      slotEditProblem({ ...base, status: 'published' }, new Date('2026-11-01T12:00:00+09:00')),
    ).toBe('SLOT_CLOSED');
  });
});
