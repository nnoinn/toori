import { describe, expect, it } from 'vitest';

import { canEditSlot, getSlotStatus, isSlotOnHold, SLOT_STATUS_LABELS } from './slot-status';
import { SLOT_STATUS_CASES } from './slot-status-cases';

const at = (iso: string) => new Date(`${iso}+09:00`);

describe('SLOT_STATUS_LABELS', () => {
  it('6개 상태를 화면 이름으로 보여준다', () => {
    expect(SLOT_STATUS_LABELS).toEqual({
      scheduled: '예약대기',
      published: '게시중',
      reserved: '예약됨',
      closed: '마감',
      cancelled: '취소',
      completed: '완료',
    });
  });
});

describe('getSlotStatus', () => {
  it.each(SLOT_STATUS_CASES)('$name', ({ slot, now, expected }) => {
    expect(getSlotStatus(slot, now)).toBe(expected);
  });
});

describe('isSlotOnHold', () => {
  const expiresAt = at('2026-11-01T10:10:00');

  it('홀딩한 고객이 없으면 홀딩 중이 아니다', () => {
    expect(
      isSlotOnHold({ holdCustomerId: null, holdExpiresAt: null }, at('2026-11-01T10:00:00')),
    ).toBe(false);
  });

  it('만료 시각 전이면 홀딩 중이다', () => {
    const slot = { holdCustomerId: 'customer-1', holdExpiresAt: expiresAt };
    expect(isSlotOnHold(slot, at('2026-11-01T10:09:59.999'))).toBe(true);
  });

  it('만료 시각과 같거나 지나면 홀딩이 풀린다', () => {
    const slot = { holdCustomerId: 'customer-1', holdExpiresAt: expiresAt };
    expect(isSlotOnHold(slot, expiresAt)).toBe(false);
    expect(isSlotOnHold(slot, at('2026-11-01T10:10:00.001'))).toBe(false);
  });

  it('고객은 있는데 만료 시각이 없으면 홀딩 중이 아니다', () => {
    expect(
      isSlotOnHold(
        { holdCustomerId: 'customer-1', holdExpiresAt: null },
        at('2026-11-01T10:00:00'),
      ),
    ).toBe(false);
  });
});

describe('canEditSlot', () => {
  const base = {
    publishAt: at('2026-10-30T12:00:00'),
    startAt: at('2026-11-01T12:00:00'),
    holdCustomerId: null,
    holdExpiresAt: null,
  };
  const now = at('2026-10-31T12:00:00');

  it('예약대기·게시중이면 수정·마감할 수 있다', () => {
    expect(
      canEditSlot({ ...base, status: 'scheduled', publishAt: at('2026-11-01T00:00:00') }, now),
    ).toBe(true);
    expect(canEditSlot({ ...base, status: 'published' }, now)).toBe(true);
  });

  it('게시중이어도 다른 고객이 홀딩 중이면 수정·마감할 수 없다', () => {
    const held = { holdCustomerId: 'customer-1', holdExpiresAt: at('2026-10-31T12:05:00') };
    expect(canEditSlot({ ...base, ...held, status: 'published' }, now)).toBe(false);
  });

  it('홀딩이 만료됐으면 다시 수정·마감할 수 있다', () => {
    const expired = { holdCustomerId: 'customer-1', holdExpiresAt: at('2026-10-31T11:59:00') };
    expect(canEditSlot({ ...base, ...expired, status: 'published' }, now)).toBe(true);
  });

  it('시작 시각이 지나 마감으로 계산되면 수정할 수 없다', () => {
    expect(canEditSlot({ ...base, status: 'published' }, at('2026-11-01T12:00:00'))).toBe(false);
  });

  it.each(['reserved', 'closed', 'cancelled', 'completed'] as const)(
    '%s 매물은 수정·마감할 수 없다',
    (status) => {
      expect(canEditSlot({ ...base, status }, now)).toBe(false);
    },
  );
});
