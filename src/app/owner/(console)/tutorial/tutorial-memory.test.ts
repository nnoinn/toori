import { describe, expect, it } from 'vitest';

import {
  EMPTY_TUTORIAL_MEMORY,
  parseTutorialMemory,
  serializeTutorialMemory,
  tutorialMemoryKey,
} from './tutorial-memory';

// 원장님 튜토리얼(S-412)의 이 브라우저 기록(#618 DB 없음)

describe('원장님 튜토리얼 브라우저 기록 (S-412)', () => {
  it('샵마다 다른 이름으로 둔다', () => {
    expect(tutorialMemoryKey('a')).not.toBe(tutorialMemoryKey('b'));
  });

  it('건너뛴 기록을 저장했다 읽으면 그대로다', () => {
    const raw = serializeTutorialMemory({ checklistHidden: true });
    expect(parseTutorialMemory(raw)).toEqual({ checklistHidden: true });
  });

  it('없거나 모양이 틀리면 처음 상태(체크 목록을 보여준다)', () => {
    for (const raw of [null, '', 'not json', '1', 'null', '[]', '{"checklistHidden":"yes"}']) {
      expect(parseTutorialMemory(raw), String(raw)).toEqual(EMPTY_TUTORIAL_MEMORY);
    }
    expect(EMPTY_TUTORIAL_MEMORY.checklistHidden).toBe(false);
  });
});
