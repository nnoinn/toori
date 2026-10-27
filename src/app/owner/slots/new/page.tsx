import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { addMinutes } from '@/lib/time';
import { ensureOwnerPage } from '@/server/auth';
import { SHOP_STATUS_LABELS } from '@/server/shops/status';
import { getShopReviewStatus } from '@/server/shops/review';

import { isServiceTypeOf, MENU_DURATION } from '../../settings/menu/menu';
import { selectMenus, selectShopCategory } from '../../settings/menu/menu-store';
import { SlotCreateForm } from './slot-create-form';
import { selectBusyRanges } from './slot-draft-store';
import { latestStart } from './slot-time';

export const metadata: Metadata = { title: '매물 등록' };

const PAGE_PATH = '/owner/slots/new';

// 매물 3탭 등록 ① 서비스 ② 시간 (O4, S-201·S-204·S-209). ③ 할인율·저장은 O5. PC 기준
export default function SlotCreatePage() {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">매물 등록</h1>
      <Suspense fallback={<LoadingCards count={2} />}>
        <SlotCreateContent />
      </Suspense>
    </main>
  );
}

async function SlotCreateContent() {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  const review = await getShopReviewStatus(auth.shopId);
  if (!review.ok) return <ErrorState description={review.error.message} />;

  // 입점 승인 전에는 매물을 올릴 수 없다(S-102). 서버 함수도 따로 막는다
  if (review.data.status !== 'approved') {
    return (
      <Card>
        <EmptyState
          title="입점 승인 후에 매물을 올릴 수 있어요"
          description={
            review.data.status === 'rejected'
              ? `입점 신청이 반려됐어요. 사유: ${review.data.rejectionReason ?? '-'}`
              : `지금은 ${SHOP_STATUS_LABELS[review.data.status]} 상태예요. 기다리는 동안 샵 정보와 메뉴를 먼저 등록해 주세요.`
          }
          action={
            <Button asChild variant="outline">
              <Link href="/owner/settings">매장 설정으로</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const db = getDb();
  const now = await getRequestNow();
  const [category, menus, busy] = await Promise.all([
    selectShopCategory(db, auth.shopId),
    selectMenus(db, auth.shopId),
    // 고를 수 있는 마지막 시작 시각 + 가장 긴 소요 시간까지 본다
    selectBusyRanges(db, auth.shopId, now, addMinutes(latestStart(now), MENU_DURATION.max)),
  ]);
  if (!category) return <ErrorState description="샵을 찾을 수 없어요" />;

  const usable = menus.filter(
    (menu) => !menu.hidden && isServiceTypeOf(category, menu.serviceType),
  );
  if (usable.length === 0) {
    return (
      <Card>
        <EmptyState
          title="메뉴를 먼저 등록해 주세요"
          description="매물은 등록한 메뉴 중에서 골라 올려요"
          action={
            <Button asChild>
              <Link href="/owner/settings/menu">메뉴 등록하기</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <SlotCreateForm
      shopId={auth.shopId}
      nowIso={now.toISOString()}
      menus={usable.map((menu) => ({
        id: menu.id,
        serviceType: menu.serviceType,
        name: menu.name,
        listPrice: menu.listPrice,
        durationMinutes: menu.durationMinutes,
      }))}
      busy={busy.map((range) => ({
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      }))}
    />
  );
}
