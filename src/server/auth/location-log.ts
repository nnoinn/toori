// 위치정보 이용 기록 (위치정보법, 연결 #2, Issue #47 7장). 서버에서만 부른다.
// 위치정보 이용 사실 확인자료를 자동으로 남긴다. 좌표는 저장하지 않고 "언제, 누가, 무엇에"만 남긴다.
// 브라우저에서 위치를 새로 받아 서버에 보낼 때 1번 부른다. 그 위치로 하는 조회마다 부르지 않고,
// 동네를 직접 고른 경우는 위치정보가 아니라서 부르지 않는다.
// 'use server' 파일이 아니라서 브라우저가 직접 부를 수 없다. 고객 위치 저장 서버 함수 안에서 부른다.

import 'server-only';

import { getDb } from '@/db';
import { type LocationUsePurpose, locationUseLogs } from '@/db/schema';

import { getCurrentAccount } from './current-account';

/**
 * 위치정보 이용 사실을 기록한다.
 * 저장에 실패하면 에러를 던진다(10/25). 기록 없이 위치를 쓰지 않도록, 부르는 쪽은 에러가 나면
 * 위치를 저장하지 말고 동네 선택으로 안내한다.
 */
export async function logLocationUse(purpose: LocationUsePurpose): Promise<void> {
  try {
    // 로그인하지 않은 고객도 위치를 쓸 수 있어서 그때는 사용자를 비운다
    const userId = (await getCurrentAccount())?.userId ?? null;
    await getDb().insert(locationUseLogs).values({ userId, purpose });
  } catch (error) {
    console.error(
      '[location-log] 위치 이용 기록 저장 실패:',
      error instanceof Error ? error.name : error,
    );
    throw new Error('위치 이용 기록을 남기지 못했어요', { cause: error });
  }
}
