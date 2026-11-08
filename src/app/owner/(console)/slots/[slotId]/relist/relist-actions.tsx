'use client';

// 재등록 화면의 [예, 다시 올리기]·[아니요] (O13, S-408). 성공하면 서버 함수가 대시보드로 보낸다.
// 그사이 같은 시간에 다른 매물을 올렸거나 이미 재등록했으면 이유를 보여준다.

import { useState, useTransition } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

import { relistSlot } from '../../actions';

export function RelistActions({ shopId, slotId }: { shopId: string; slotId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** [예, 다시 올리기]. 성공하면 서버 함수가 대시보드로 보내므로 여기서는 실패 문구만 다룬다 */
  function relist() {
    setMessage(null);
    startTransition(async () => {
      const result = await relistSlot(shopId, slotId);
      if (!result.ok) setMessage(result.error.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button asChild variant="outline" size="lg">
          <Link href="/owner">아니요</Link>
        </Button>
        <Button type="button" size="lg" disabled={pending} onClick={relist}>
          {pending ? '올리는 중…' : '예, 다시 올리기'}
        </Button>
      </div>
    </div>
  );
}
