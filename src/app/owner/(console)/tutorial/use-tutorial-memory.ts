'use client';

// 원장님 튜토리얼(S-412) 브라우저 기록(tutorial-memory.ts)을 화면에서 읽고 바꾼다.
// 대시보드 체크 목록과 내 계정의 [다시 보기]가 같은 기록을 본다. 같은 탭에서 바꾸면 이 파일의 알림으로,
// 다른 탭에서 바꾸면 브라우저의 storage 알림으로 다시 그린다.
// 저장소가 막혀 있으면(사생활 보호 모드 등) 이 탭에서만 기억한다.

import { useSyncExternalStore } from 'react';

import {
  parseTutorialMemory,
  serializeTutorialMemory,
  type TutorialMemory,
  tutorialMemoryKey,
} from './tutorial-memory';

const CHANGE_EVENT = 'toori:owner-tutorial-change';

/** 저장소가 막혔을 때 이 탭에서만 쓰는 기록 */
const fallback = new Map<string, string>();

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? fallback.get(key) ?? null;
  } catch {
    return fallback.get(key) ?? null;
  }
}

function writeRaw(key: string, raw: string | null) {
  try {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
    fallback.delete(key);
  } catch {
    if (raw === null) fallback.delete(key);
    else fallback.set(key, raw);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * 이 샵의 튜토리얼 기록. 서버에서 그릴 때와 처음 그릴 때는 아직 모르므로 null이다
 * (그동안 체크 목록을 그리지 않아서, 건너뛴 원장님에게 목록이 잠깐 보였다 사라지지 않는다)
 */
export function useTutorialMemory(shopId: string): TutorialMemory | null {
  const key = tutorialMemoryKey(shopId);
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => undefined,
  );
  return raw === undefined ? null : parseTutorialMemory(raw);
}

/** 체크 목록을 건너뛴다 */
export function hideChecklist(shopId: string) {
  const key = tutorialMemoryKey(shopId);
  const memory = parseTutorialMemory(readRaw(key));
  writeRaw(key, serializeTutorialMemory({ ...memory, checklistHidden: true }));
}

/** 내 계정 [다시 보기]: 이 샵의 튜토리얼 기록을 지워 처음처럼 보이게 한다 */
export function resetTutorial(shopId: string) {
  writeRaw(tutorialMemoryKey(shopId), null);
}
