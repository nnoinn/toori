import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site';

// 홈 = 지도 + 목록 시트 탐색 화면. 정찬형이 1단계(J3, J4)에서 만든다.
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-bold">{SITE_NAME}</h1>
      <p className="text-muted-foreground">{SITE_DESCRIPTION}</p>
      <p className="text-sm text-muted-foreground">지금은 준비 중이에요.</p>
    </main>
  );
}
