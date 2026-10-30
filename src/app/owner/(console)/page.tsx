import type { Metadata } from 'next';

import { JoinedNotice } from '../join/joined-notice';

export const metadata: Metadata = { title: '원장님' };

// 원장님 대시보드(S-401). 정민석이 만든다. 입점 신청 직후에는 "입점 신청을 마쳤어요" 안내 상자가 잠깐 뜬다(O7 ①)
export default function OwnerHomePage() {
  return (
    <main className="flex flex-1 flex-col gap-2 p-6">
      <h1 className="text-xl font-bold">원장님 화면</h1>
      <p className="text-muted-foreground">지금은 준비 중이에요.</p>
      <JoinedNotice />
    </main>
  );
}
