import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ensureOwnerPage } from '@/server/auth';
import { PUBLISH_PAUSED_MESSAGE, readPublishPause } from '@/server/shops';
import { SHOP_STATUS_LABELS } from '@/server/shops/status';
import { getShopReviewStatus } from '@/server/shops/review';
import { getLastWindowSettings } from '@/server/slot-windows/actions';

import { OwnerPage } from '../../owner-page';
import { SlotForm } from '../slot-form';
import { publishPauseNoticeLine } from '../publish-pause-notice';
import { selectSlotFormData } from '../slot-form-data';
import { selectSlotPresetRows } from '../slot-preset-store';
import { pickSlotPresets } from '../slot-presets';
import { WindowForm } from '../window/window-form';
import { SlotCreateTabs } from './slot-create-tabs';

export const metadata: Metadata = { title: '매물 등록' };

const PAGE_PATH = '/owner/slots/new';

// 매물 등록 (S-201·S-204·S-209). 맨 위 탭에서 방식을 고른다(#308): 한 시술 매물(3탭 ① 서비스 ② 시간 ③ 할인율, O4·O5)
// 또는 시간대 매물(① 날짜·시간대 ② 서비스 ③ 할인율 ④ 확인, window/window-form.tsx). PC 기준.
// 한 시술 매물 맨 위에 "지난 매물로 빠르게 올리기"(S-207 매물 복제): 최근 올린 구성을 누르면 ② 시간부터 연다
export default function SlotCreatePage() {
  return (
    <OwnerPage title="매물 등록" width="narrow">
      <Suspense fallback={<LoadingCards count={2} />}>
        <SlotCreateContent />
      </Suspense>
    </OwnerPage>
  );
}

/** 입점 승인 → 게시 멈춤 → 메뉴가 있는지 차례로 보고 3탭 화면을 연다. 막히면 무엇을 먼저 해야 하는지 안내한다 */
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

  // 운영자가 새 매물 게시를 멈춘 샵(#373 ④, #472)은 한 시술·시간대 매물 모두 올릴 수 없다. 서버 함수도 따로 막는다.
  // 알림과 같은 제목, 서버 함수와 같은 문구, 그 아래에 운영자가 목록에서 고른 사유 한 줄(#499 ②). 운영자가 쓴 메모는 보여 주지 않는다
  const pause = await readPublishPause(auth.shopId);
  if (pause) {
    const notice = publishPauseNoticeLine(pause);
    return (
      <Card>
        <EmptyState
          title="새 매물 등록이 잠시 멈췄어요"
          description={PUBLISH_PAUSED_MESSAGE}
          action={
            <div className="flex flex-col items-center gap-3">
              {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
              <Button asChild variant="outline">
                <Link href="/owner">대시보드로</Link>
              </Button>
            </div>
          }
        />
      </Card>
    );
  }

  const now = await getRequestNow();
  const [data, last, presetRows] = await Promise.all([
    selectSlotFormData(getDb(), auth.shopId, now),
    // 시간대 매물을 처음 열 때 채울 지난 설정(#308). 못 읽으면 비워 두고 원장님이 고른다
    getLastWindowSettings(auth.shopId),
    selectSlotPresetRows(getDb(), auth.shopId),
  ]);
  if (!data) return <ErrorState description="샵을 찾을 수 없어요" />;
  if (data.menus.length === 0) {
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
    <SlotCreateTabs
      single={
        <SlotForm
          shopId={auth.shopId}
          nowIso={now.toISOString()}
          {...data}
          // 지금 고를 수 있는 메뉴의 구성만(숨긴 메뉴·업종 변경으로 빠진 메뉴는 뺀다)
          presets={pickSlotPresets(
            presetRows,
            data.menus.map((menu) => menu.id),
          )}
        />
      }
      windowForm={
        <WindowForm
          shopId={auth.shopId}
          nowIso={now.toISOString()}
          businessHours={data.businessHours}
          menus={data.menus}
          busy={data.busy}
          lastSettings={last.ok ? last.data : null}
        />
      }
    />
  );
}
