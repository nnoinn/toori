import { Suspense } from 'react';
import type { Metadata } from 'next';
import { MessageCircle } from 'lucide-react';

import { Logo } from '@/components/ui/logo';
import { Skeleton } from '@/components/ui/skeleton';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { KAKAO_CHANNEL_URL, SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';
import { siteEntryNextPath } from '@/lib/site-lock';

import { TeamEntryForm } from './team-entry-form';

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} 준비 중` },
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, SearchValue>>;

// 잠금 화면 = 누구나 보는 짧은 소개 페이지(#303). 주소: /coming-soon?next=/...
// 팀 접속 코드 잠금(SITE_LOCK_CODE)이 켜져 있으면 proxy가 입장하지 않은 화면 요청을 여기로 보낸다.
// 잠금이 꺼졌거나 이미 입장했으면 proxy가 가려던 화면으로 보내서 이 화면은 보이지 않는다.
// 고객·원장님 어느 화면에도 속하지 않아서 메뉴 없이 가운데 흰 카드 하나로 둔다(PC·폰 같은 모양).
export default function ComingSoonPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <div className="flex w-full max-w-[480px] flex-col gap-8 rounded-2xl border bg-card p-8 shadow-sm">
        <Logo className="h-8 self-start" />
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">{SITE_NAME} 준비 중</h1>
          <p>{SITE_DESCRIPTION}</p>
          <p className="text-sm text-muted-foreground">
            지금은 서비스를 준비하고 있어요. 궁금한 점은 카카오톡 채널로 물어봐 주세요.
          </p>
        </div>
        {/* 카카오 색은 globals.css의 kakao 토큰에서만 가져온다 */}
        <a
          href={KAKAO_CHANNEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-kakao px-4 font-medium text-kakao-foreground transition-opacity outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <MessageCircle className="size-5 text-kakao-symbol" aria-hidden />
          카카오톡 채널로 문의하기
        </a>
        <Suspense fallback={<Skeleton className="h-[86px] w-full" />}>
          <TeamEntry searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

// 주소 값(searchParams)은 요청 때만 알 수 있어서 <Suspense> 안에서 읽는다(Cache Components)
async function TeamEntry({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <TeamEntryForm next={siteEntryNextPath(firstParam(params.next))} />;
}
