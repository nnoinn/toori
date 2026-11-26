import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/state';

// 샵 프로필에서 notFound()일 때: 없는 샵, 승인되지 않은 샵(승인 대기·반려·탈퇴)(page.tsx).
// 전체 404 대신 고객 메뉴 안에서 매물 목록으로 돌아가게 한다(매물 상세와 같다)
export default function ShopNotFound() {
  return (
    <main className="flex flex-1 flex-col px-4 py-6 md:mx-auto md:w-full md:max-w-3xl">
      <h1 className="sr-only">샵 프로필</h1>
      <EmptyState
        title="샵을 찾을 수 없어요"
        description="지금은 볼 수 없는 샵이에요."
        action={
          <Link href="/home/list" className={buttonVariants({ className: 'max-md:h-10' })}>
            매물 목록 보기
          </Link>
        }
      />
    </main>
  );
}
