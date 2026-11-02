import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Price } from '@/components/ui/price';
import { SlotBadges } from '@/components/ui/slot-badge';
import { EmptyState, LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { formatDuration } from '@/lib/format';
import { getRequestNow } from '@/lib/request-time';
import { formatKst, formatKstTime } from '@/lib/time';
import { ensureOwnerPage } from '@/server/auth';
import { calcSalePrice } from '@/server/policy';
import { readShopReviewStatus } from '@/server/shops/review-store';

import { serviceTypeLabel } from '../../../settings/menu/menu';
import { validateSlotDraft } from '../../new/slot-draft-store';
import { RELIST_MESSAGES, relistDraftMessage, relistProblem } from '../../relist';
import { relistInput, selectSlotForRelist } from '../../relist-store';
import { RelistActions } from './relist-actions';

export const metadata: Metadata = { title: '매물 재등록' };

type Params = Promise<{ slotId: string }>;

// 취소 시간대 재등록 (O13, S-408·S-208). 주소: /owner/slots/[slotId]/relist
// 대시보드의 '취소' 매물 [재등록]과, 고객 취소 알림(강규민 W16, 연결 #14·#132)에서 들어온다.
// 원래 매물과 같은 조건으로 새 매물을 바로 게시한다. 누르기 전에 등록과 같은 확인을 미리 하고,
// 지금 메뉴 값으로 계산한 가격을 보여준다(저장할 때 다시 확인한다). PC 기준
export default function SlotRelistPage({ params }: { params: Params }) {
  return (
    <main className="flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">매물 재등록</h1>
      <Suspense fallback={<LoadingCards count={1} />}>
        <RelistContent params={params} />
      </Suspense>
    </main>
  );
}

async function RelistContent({ params }: { params: Params }) {
  const { slotId } = await params;
  const validId = z.uuid().safeParse(slotId).success;
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(validId ? `/owner/slots/${slotId}/relist` : '/owner');
  const db = getDb();

  const review = await readShopReviewStatus(db, auth.shopId);
  if (review && review.status !== 'approved') {
    return <CannotRelist message="입점 승인 후에 재등록할 수 있어요" />;
  }

  const now = await getRequestNow();
  const slot = await selectSlotForRelist(db, auth.shopId, slotId);
  if (!slot) return <CannotRelist message={RELIST_MESSAGES.SLOT_NOT_FOUND} />;
  const problem = relistProblem(slot, now);
  if (problem) return <CannotRelist message={RELIST_MESSAGES[problem]} />;

  // 메뉴·영업시간·시간 겹침을 미리 확인해서 누르기 전에 알려 준다
  const draft = await validateSlotDraft(db, auth.shopId, relistInput(slot), now);
  if (!draft.ok) {
    return (
      <CannotRelist message={relistDraftMessage(draft.error.code, draft.error.message)} newSlot />
    );
  }
  const { menu, start, end } = draft.data;
  const salePrice = calcSalePrice(menu.listPrice, slot.discountRate);

  return (
    <Card>
      <CardHeader>
        <CardTitle>예약이 취소됐어요. 같은 매물을 다시 올릴까요?</CardTitle>
        <p className="text-sm text-muted-foreground">
          취소된 매물과 같은 조건으로 새 매물을 바로 게시해요. 취소된 매물은 기록으로 남아요.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-[6rem_1fr] items-center gap-y-3 text-sm">
          <dt className="text-muted-foreground">시간</dt>
          <dd className="font-medium">
            {formatKst(start)} ~ {formatKstTime(end)}
          </dd>
          <dt className="text-muted-foreground">서비스</dt>
          <dd>
            {serviceTypeLabel(menu.serviceType)} · {formatDuration(menu.durationMinutes)} ·{' '}
            {menu.name}
          </dd>
          <dt className="text-muted-foreground">가격</dt>
          <dd>
            <Price
              listPrice={menu.listPrice}
              salePrice={salePrice}
              discountRate={slot.discountRate}
              size="sm"
            />
          </dd>
          {slot.newCustomerOnly ? (
            <>
              <dt className="text-muted-foreground">조건</dt>
              <dd>
                <SlotBadges kinds={['newCustomerOnly']} />
              </dd>
            </>
          ) : null}
        </dl>
        {menu.listPrice !== slot.listPrice ? (
          <p className="rounded-lg bg-muted p-3 text-sm">
            메뉴 정가가 바뀌어서 지금 정가로 계산했어요. 할인율은 취소된 매물과 같아요.
          </p>
        ) : null}
        <RelistActions shopId={auth.shopId} slotId={slot.id} />
      </CardContent>
    </Card>
  );
}

/** 재등록할 수 없을 때. 메뉴·시간 문제면 매물 등록으로 새로 올릴 수 있게 버튼을 같이 둔다 */
function CannotRelist({ message, newSlot = false }: { message: string; newSlot?: boolean }) {
  return (
    <Card>
      <EmptyState
        title="재등록할 수 없어요"
        description={message}
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/owner">대시보드로</Link>
            </Button>
            {newSlot ? (
              <Button asChild>
                <Link href="/owner/slots/new">매물 등록하기</Link>
              </Button>
            ) : null}
          </div>
        }
      />
    </Card>
  );
}
