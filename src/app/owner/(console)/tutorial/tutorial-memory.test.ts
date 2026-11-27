import { describe, expect, it } from 'vitest';

import {
  EMPTY_TUTORIAL_MEMORY,
  hasHiddenGuide,
  parseTutorialMemory,
  serializeTutorialMemory,
  tutorialMemoryKey,
  withTourSeen,
} from './tutorial-memory';

// 원장님 튜토리얼(S-412)의 이 브라우저 기록(#618 DB 없음): 체크 목록 건너뛰기, 본 화면별 말풍선

describe('원장님 튜토리얼 브라우저 기록 (S-412)', () => {
  it('샵마다 다른 이름으로 둔다', () => {
    expect(tutorialMemoryKey('a')).not.toBe(tutorialMemoryKey('b'));
  });

  it('건너뛴 기록과 본 말풍선을 저장했다 읽으면 그대로다', () => {
    const memory = { checklistHidden: true, seenTours: ['slot_single' as const] };
    expect(parseTutorialMemory(serializeTutorialMemory(memory))).toEqual(memory);
  });

  it('없거나 모양이 틀리면 처음 상태(체크 목록과 말풍선을 보여준다)', () => {
    for (const raw of [null, '', 'not json', '1', 'null', '[]', '{"checklistHidden":"yes"}']) {
      expect(parseTutorialMemory(raw), String(raw)).toEqual(EMPTY_TUTORIAL_MEMORY);
    }
    expect(EMPTY_TUTORIAL_MEMORY).toEqual({ checklistHidden: false, seenTours: [] });
  });

  it('본 말풍선 중 모르는 이름은 버리고, 같은 이름은 한 번만', () => {
    const raw = JSON.stringify({
      seenTours: ['slot_window', 'partial_close', 3, 'slot_window', 'reservation_detail'],
    });
    expect(parseTutorialMemory(raw).seenTours).toEqual(['slot_window', 'reservation_detail']);
    expect(parseTutorialMemory('{"seenTours":"slot_window"}').seenTours).toEqual([]);
  });

  it('말풍선을 본 것으로 남기면 그 화면만 더한다(이미 있으면 그대로)', () => {
    const once = withTourSeen(EMPTY_TUTORIAL_MEMORY, 'slot_single');
    expect(once).toEqual({ checklistHidden: false, seenTours: ['slot_single'] });
    expect(withTourSeen(once, 'slot_single')).toBe(once);
    expect(withTourSeen(once, 'reservation_detail').seenTours).toEqual([
      'slot_single',
      'reservation_detail',
    ]);
  });

  it('다시 켤 것: 체크 목록을 건너뛰었거나 본 말풍선이 있을 때', () => {
    expect(hasHiddenGuide(EMPTY_TUTORIAL_MEMORY)).toBe(false);
    expect(hasHiddenGuide({ checklistHidden: true, seenTours: [] })).toBe(true);
    expect(hasHiddenGuide({ checklistHidden: false, seenTours: ['slot_window'] })).toBe(true);
  });
});
