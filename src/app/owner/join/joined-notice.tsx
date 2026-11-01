'use client';

// 입점 신청 직후 원장님 화면(/owner)에 잠깐 뜨는 작은 안내 상자 (O7 ①).
// 가입 저장(createOwnerAccount)이 쿠키를 바꾸면 Next.js가 가입 화면을 다시 그리고, 그때 "이미 원장님 계정이 있으면 /owner로"
// 규칙으로 바로 넘어가서 가입 화면에서는 완료 안내를 보여줄 수 없다. 그래서 신청 직전에 표시를 남기고(markJoinPending),
// /owner가 그 표시를 읽고 지우면서 안내를 띄운다. 실패하면 가입 화면이 표시를 지운다(clearJoinPending).
// 이 브라우저 탭에만 남기면 되므로 sessionStorage를 쓴다(막혀 있으면 안내만 건너뛴다).

import { useEffect, useState } from 'react';
import { CircleCheck, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

const JOIN_PENDING_KEY = 'toori:owner-join-pending';
const SHOW_MS = 8000;

export function markJoinPending() {
  try {
    sessionStorage.setItem(JOIN_PENDING_KEY, '1');
  } catch {
    // 저장소를 못 쓰면 안내만 건너뛴다
  }
}

export function clearJoinPending() {
  try {
    sessionStorage.removeItem(JOIN_PENDING_KEY);
  } catch {
    // 위와 같다
  }
}

/** 표시가 있으면 한 번만 읽고 지운다 */
function takeJoinPending(): boolean {
  try {
    const pending = sessionStorage.getItem(JOIN_PENDING_KEY) === '1';
    sessionStorage.removeItem(JOIN_PENDING_KEY);
    return pending;
  } catch {
    return false;
  }
}

/** 입점 신청 직후에만 오른쪽 아래에 잠깐(8초) 뜬다. X로 바로 닫을 수 있다 */
export function JoinedNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!takeJoinPending()) return;
    // 브라우저 저장소는 화면을 그린 뒤에만 읽을 수 있어서 effect 안에서 연다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
    const timer = setTimeout(() => setOpen(false), SHOW_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!open) return null;
  return (
    <div
      role="status"
      className="fixed right-6 bottom-6 z-50 flex w-80 items-start gap-3 rounded-xl border bg-card p-4 shadow-lg"
    >
      <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="flex flex-1 flex-col gap-1">
        <p className="font-semibold">입점 신청을 마쳤어요</p>
        <p className="text-sm text-muted-foreground">
          운영팀이 확인한 뒤 승인하면 매물을 올릴 수 있어요. 기다리는 동안 매장 설정에서
          영업시간·메뉴·사진을 입력해 두세요.
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="안내 닫기"
        onClick={() => setOpen(false)}
      >
        <X />
      </Button>
    </div>
  );
}
