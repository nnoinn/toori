import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/state';

// 매물 상세에서 notFound()일 때: 없는 매물, 승인되지 않은 샵, 볼 수 없는 신규 고객 전용, 게시 전 매물(page.tsx).
// 전체 404 대신 고객 메뉴 안에서 매물 목록으로 돌아가게 한다
export default function SlotNotFound() {
  return (
    <main className="flex flex-1 flex-col px-4 py-6 md:mx-auto md:w-full md:max-w-3xl">
      <h1 className="sr-only">매물 상세</h1>
      <EmptyState
        title="매물을 찾을 수 없어요"
        description="이미 끝났거나 지금은 볼 수 없는 매물이에요."
        action={
          <Link href="/home/list" className={buttonVariants({ className: 'max-md:h-10' })}>
            매물 목록 보기
          </Link>
        }
      />
    </main>
  );
}
