import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/state';

// 시간대 상세에서 notFound()일 때: 없는 시간대, 승인되지 않은 샵, 볼 수 없는 신규 고객 전용, 게시 전·마감, 시작할 수 있는 시각 없음(page.tsx).
// 전체 404 대신 고객 메뉴 안에서 매물 목록으로 돌아가게 한다(매물 상세와 같다)
export default function WindowNotFound() {
  return (
    <main className="flex flex-1 flex-col px-4 py-6 md:mx-auto md:w-full md:max-w-3xl">
      <h1 className="sr-only">시간대 상세</h1>
      <EmptyState
        title="시간대를 찾을 수 없어요"
        description="이미 끝났거나 지금은 예약할 수 있는 시각이 없는 시간대예요."
        action={
          <Link href="/home/list" className={buttonVariants({ className: 'max-md:h-10' })}>
            매물 목록 보기
          </Link>
        }
      />
    </main>
  );
}
