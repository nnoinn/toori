'use client';

// 저장을 마친 매물 등록·수정 폼을 떠났다가 돌아오면 처음 상태로 연다(#534, 11/22 nnoinn이 찾음).
// Cache Components에서는 떠난 화면을 지우지 않고 숨겨 두었다가(React Activity) 상태 그대로 다시 보여 줘서,
// 저장 완료 카드가 남아 메뉴의 [매물 등록]을 다시 눌러도 완료 화면이 나왔다(기술 가이드 2장 "떠났다 돌아온 화면").
// Next.js 문서(preserving-ui-state.md "Resetting stale status messages")대로 화면이 숨겨질 때(useLayoutEffect 정리) 되돌린다.
// - 저장하지 않고 떠나면 고르던 값은 그대로 둔다(문서와 같다). 완료 카드에서 [하나 더 올리기]를 눌러 다시 고르는 중이어도 그렇다
// - 되돌릴 때는 폼의 key(generation)를 바꿔 새로 만든다. 저장할 때 서버가 화면 값을 새로 받아 두어서(refresh),
//   이미 올린 시간·지난 설정·수정한 매물 값이 저장한 뒤의 값으로 다시 시작한다

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export function useFreshAfterLeave(): {
  /** 폼의 key. 저장을 마친 뒤 화면을 떠나면 1 늘어서 돌아왔을 때 새 폼이 열린다 */
  generation: number;
  /** 저장을 마쳤으면 true, 완료 카드에서 다시 고르기 시작하면 false */
  markSaved: (saved: boolean) => void;
} {
  const [generation, setGeneration] = useState(0);
  const saved = useRef(false);
  useLayoutEffect(
    () => () => {
      if (!saved.current) return;
      saved.current = false;
      setGeneration((value) => value + 1);
    },
    [],
  );
  const markSaved = useCallback((value: boolean) => {
    saved.current = value;
  }, []);
  return { generation, markSaved };
}
