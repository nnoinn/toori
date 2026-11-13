'use client';

import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/state';

// 이의제기 화면에서 조회가 실패했을 때(세 상태 중 오류). 열람 기록을 남기지 못해도 여기로 온다
export default function AdminDisputesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex flex-1 flex-col p-6">
      <ErrorState
        description="이의제기 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
        action={<Button onClick={reset}>다시 시도</Button>}
        className="rounded-xl bg-card"
      />
    </main>
  );
}
