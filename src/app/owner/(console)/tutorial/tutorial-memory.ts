// 원장님 튜토리얼(S-412)에서 이 브라우저에 남기는 기록: 체크 목록을 건너뛰었는지.
// 새 DB 없이 만들기로 해서(#618) localStorage에 샵마다 둔다. 다른 기기·브라우저에서는 처음처럼 다시 보인다.
// 내 계정의 [시작하기 목록 다시 보기]가 지운다. 화면별 안내 말풍선을 본 기록도 다음 PR에서 여기에 더한다.

export type TutorialMemory = {
  /** 대시보드 체크 목록을 [건너뛰기]로 숨겼는지 */
  checklistHidden: boolean;
};

export const EMPTY_TUTORIAL_MEMORY: TutorialMemory = { checklistHidden: false };

/** 샵마다 따로 둔다(한 브라우저에서 다른 원장님 계정으로 들어와도 섞이지 않게) */
export function tutorialMemoryKey(shopId: string): string {
  return `toori:owner-tutorial:${shopId}`;
}

/** 기억해 둔 값을 읽는다. 없거나 모양이 틀리면 처음 상태 */
export function parseTutorialMemory(raw: string | null): TutorialMemory {
  if (!raw) return EMPTY_TUTORIAL_MEMORY;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return EMPTY_TUTORIAL_MEMORY;
    const { checklistHidden } = value as Record<string, unknown>;
    return { checklistHidden: checklistHidden === true };
  } catch {
    return EMPTY_TUTORIAL_MEMORY;
  }
}

export function serializeTutorialMemory(memory: TutorialMemory): string {
  return JSON.stringify(memory);
}
