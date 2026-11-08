import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/state';

// 예약 상세에서 notFound()일 때: 없는 예약이거나 다른 고객의 예약(있는지도 알려 주지 않는다, X-102).
// 전체 404 대신 고객 메뉴 안에서 내 예약으로 돌아가게 한다
export default function ReservationNotFound() {
  return (
    <main className="flex flex-1 flex-col px-4 py-6 md:mx-auto md:w-full md:max-w-3xl">
      <h1 className="sr-only">예약 상세</h1>
      <EmptyState
        title="예약을 찾을 수 없어요"
        description="주소를 다시 확인하거나 내 예약에서 찾아 주세요."
        action={
          <Link href="/reservations" className={buttonVariants()}>
            내 예약으로
          </Link>
        }
      />
    </main>
  );
}
