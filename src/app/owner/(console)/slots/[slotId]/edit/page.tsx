import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ensureOwnerPage } from '@/server/auth';
import { readShopReviewStatus } from '@/server/shops/review-store';

import { SlotCreateForm } from '../../new/slot-create-form';
import { selectSlotFormData } from '../../new/slot-form-data';
import { SLOT_EDIT_MESSAGES, slotEditProblem } from '../../slot-edit';
import { selectSlotForEdit } from '../../slot-edit-store';

export const metadata: Metadata = { title: '매물 수정' };

type Params = Promise<{ slotId: string }>;

// 매물 수정 (O10, S-206). 주소: /owner/slots/[slotId]/edit
// 등록 3탭 화면을 지금 값으로 채워서 연다. 판매 전이고 결제 중이 아닌 매물만 고칠 수 있다. PC 기준
export default function SlotEditPage({ params }: { params: Params }) {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">매물 수정</h1>
      <Suspense fallback={<LoadingCards count={2} />}>
        <SlotEditContent params={params} />
      </Suspense>
    </main>
  );
}

async function SlotEditContent({ params }: { params: Params }) {
  const { slotId } = await params;
  const validId = z.uuid().safeParse(slotId).success;
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(validId ? `/owner/slots/${slotId}/edit` : '/owner');
  const db = getDb();

  const review = await readShopReviewStatus(db, auth.shopId);
  if (review && review.status !== 'approved') {
    return <CannotEdit message="입점 승인 후에 매물을 고칠 수 있어요" />;
  }

  const now = await getRequestNow();
  const slot = validId ? await selectSlotForEdit(db, auth.shopId, slotId) : null;
  if (!slot) return <CannotEdit message={SLOT_EDIT_MESSAGES.SLOT_NOT_FOUND} />;
  const problem = slotEditProblem(slot, now);
  if (problem) {
    return (
      <CannotEdit
        message={SLOT_EDIT_MESSAGES[problem]}
        description="예약대기·게시중이고 고객이 결제 중이 아닌 매물만 고칠 수 있어요"
      />
    );
  }

  // 등록 화면과 같은 값. 고치는 매물 자신은 겹치는 시간으로 보지 않는다
  const data = await selectSlotFormData(db, auth.shopId, now, { excludeSlotId: slot.id });
  if (!data) return <ErrorState description="샵을 찾을 수 없어요" />;
  if (data.menus.length === 0) {
    return <CannotEdit message="고를 수 있는 메뉴가 없어요. 메뉴를 먼저 등록해 주세요" />;
  }

  return (
    <SlotCreateForm
      shopId={auth.shopId}
      nowIso={now.toISOString()}
      {...data}
      edit={{
        slotId: slot.id,
        // 매물 메뉴를 숨겼거나 업종을 바꿨으면 메뉴부터 다시 고른다
        menuId: data.menus.some((menu) => menu.id === slot.menuId) ? slot.menuId : null,
        startAt: slot.startAt.toISOString(),
        discountRate: slot.discountRate,
        newCustomerOnly: slot.newCustomerOnly,
      }}
    />
  );
}

function CannotEdit({ message, description }: { message: string; description?: string }) {
  return (
    <Card>
      <EmptyState
        title={message}
        description={description}
        action={
          <Button asChild variant="outline">
            <Link href="/owner">대시보드로</Link>
          </Button>
        }
      />
    </Card>
  );
}
