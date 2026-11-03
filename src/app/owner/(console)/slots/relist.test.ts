import { describe, expect, it } from 'vitest';

import { canRelist, relistDraftMessage, relistProblem } from './relist';

const startAt = new Date('2026-11-01T14:00:00+09:00');
const before = new Date('2026-11-01T13:59:00+09:00');
const cancelled = { status: 'cancelled', startAt, relistedSlotId: null } as const;

describe('취소 시간대 재등록 (O13, S-408)', () => {
  it('취소됐고 시작 전이고 아직 재등록하지 않은 매물만 재등록할 수 있다', () => {
    expect(relistProblem(cancelled, before)).toBeNull();
    expect(canRelist(cancelled, before)).toBe(true);
  });

  it('취소가 아니면, 이미 재등록했으면, 시작 시각이 되었으면 막는다', () => {
    expect(relistProblem({ ...cancelled, status: 'published' }, before)).toBe('NOT_CANCELLED');
    expect(relistProblem({ ...cancelled, status: 'closed' }, before)).toBe('NOT_CANCELLED');
    expect(relistProblem({ ...cancelled, relistedSlotId: 'slot-2' }, before)).toBe(
      'ALREADY_RELISTED',
    );
    // 시작 시각과 같으면 지난 것으로 본다(등록과 같은 기준)
    expect(relistProblem(cancelled, startAt)).toBe('START_PASSED');
    expect(canRelist(cancelled, startAt)).toBe(false);
  });

  it('메뉴를 숨겨 등록 확인이 막으면 새로 올리라고 안내하고, 다른 이유는 그 문구 그대로', () => {
    expect(relistDraftMessage('MENU_NOT_FOUND', '메뉴를 다시 골라 주세요')).toContain(
      '매물 등록에서 새로 올려 주세요',
    );
    expect(relistDraftMessage('SLOT_OVERLAP', '같은 시간에 이미 올린 매물이 있어요')).toBe(
      '같은 시간에 이미 올린 매물이 있어요',
    );
  });
});
