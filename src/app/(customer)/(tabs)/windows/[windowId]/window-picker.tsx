'use client';

import { useLayoutEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import { Price } from '@/components/ui/price';
import { type SlotBadgeKind, SlotBadges } from '@/components/ui/slot-badge';
import { formatKst, formatKstTime } from '@/lib/time';
import { customerJoinPath, loginPath } from '@/server/auth/paths';
import { getSlotTimeFlags } from '@/server/policy';
import type { SlotWindowDetail } from '@/server/slot-windows';
import { holdWindowSlot } from '@/server/slot-windows/actions';

import { formatDuration } from '../../slots/[slotId]/detail-format';
import { RefundPolicyDetails } from '../../slots/[slotId]/detail-parts';
import { checkoutPath } from '../../slots/[slotId]/reserve-button';
import {
  firstOpenMenuId,
  reserveHint,
  resolvePick,
  startEndText,
  windowRangeText,
} from './window-texts';

const HOLD_FAILED_MESSAGE = '예약을 시작하지 못했어요. 잠시 후 다시 시도해 주세요';

type Pick = { menuId: string | null; startAt: string | null };
type ReserveError = { message: string; heldSlotId?: string };

/**
 * 시간대 상세의 고르기·예약 (#308, C-404).
 * 서비스를 고르면 그 서비스로 지금 시작할 수 있는 시각(서버가 계산한 starts)이 나오고, 시각을 고르면 [예약하기]가 열린다.
 * [예약하기]는 holdWindowSlot으로 그 서비스·시각의 매물 한 칸을 만들어 10분 홀딩하고 지금 예약 확인 화면(/checkout/[slotId])으로 간다.
 * 다른 고객이 먼저 그 시각을 골랐으면(TIME_TAKEN) 화면을 다시 불러와 남은 시각을 보여준다.
 * PC 오른쪽 상자와 폰 아래 고정 예약 바가 같은 고른 값을 쓴다
 */
export function WindowPicker({ window }: { window: SlotWindowDetail }) {
  const router = useRouter();
  const [pick, setPick] = useState<Pick>(() => ({
    menuId: firstOpenMenuId(window.menus),
    startAt: null,
  }));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ReserveError | null>(null);
  // 상세를 떠나면 Next.js가 이 화면을 숨겨 두었다가 그대로 다시 보여준다(Activity). 지난 실패 문구는 떠날 때 지운다
  useLayoutEffect(() => () => setError(null), []);

  // [예약하기]가 실패해 다시 불러온 목록에 고른 시각이 없을 수 있어서, 고른 값은 늘 지금 목록으로 다시 확인한다
  const { menu, start } = resolvePick(window.menus, pick);
  const hint = reserveHint(menu, start);
  const timeFlags = start
    ? getSlotTimeFlags(new Date(start.startAt), new Date(window.serverNow))
    : null;
  const badges: SlotBadgeKind[] = [];
  if (timeFlags?.nonRefundable) badges.push('nonRefundable');
  if (timeFlags?.imminent) badges.push('imminent');
  if (window.newCustomerOnly) badges.push('newCustomerOnly');

  function chooseMenu(menuId: string) {
    setError(null);
    setPick({ menuId, startAt: null });
  }

  function chooseStart(startAt: string) {
    setError(null);
    setPick((current) => ({ ...current, startAt }));
  }

  function reserve() {
    if (!menu || !start) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await holdWindowSlot({
          windowId: window.windowId,
          menuId: menu.menuId,
          startAt: start.startAt,
        });
        if (result.ok) {
          router.push(checkoutPath(result.data.slotId));
          return;
        }
        const here = `/windows/${window.windowId}`;
        switch (result.error.code) {
          case 'UNAUTHENTICATED':
          case 'WRONG_MODE':
            router.push(loginPath('customer', here));
            return;
          case 'NO_CUSTOMER_ACCOUNT':
            router.push(customerJoinPath(here));
            return;
          case 'TIME_TAKEN':
            // 그 시각은 이제 없다. 고른 시각을 비우고 남은 시각을 다시 불러온다
            setPick((current) => ({ ...current, startAt: null }));
            router.refresh();
            break;
          case 'SLOT_NOT_AVAILABLE':
          case 'NEW_CUSTOMER_ONLY':
            // 시간대 상태가 바뀌었을 수 있다(마감, 시간이 지남 등). 화면을 다시 그린다(볼 수 없으면 404)
            router.refresh();
            break;
        }
        setError({ message: result.error.message, heldSlotId: result.error.heldSlotId });
      } catch (caught) {
        unstable_rethrow(caught);
        setError({ message: HOLD_FAILED_MESSAGE });
      }
    });
  }

  const reserveBlock = (
    <ReserveBlock hint={hint} pending={pending} error={error} onReserve={reserve} />
  );

  return (
    <>
      <section
        className="flex flex-col gap-4 px-4 py-4 md:sticky md:top-22 md:col-start-2 md:row-span-2 md:row-start-1 md:max-h-[calc(100dvh-6.5rem)] md:overflow-y-auto md:rounded-2xl md:border md:bg-card md:p-5"
        aria-label="서비스와 시작 시각 고르기"
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">{window.shop.name}</p>
          <h1 className="text-xl font-bold">{windowRangeText(window.startAt, window.endAt)}</h1>
          <p className="text-sm text-muted-foreground">
            할인 시간대예요. 서비스와 시작 시각을 골라 예약해요.
          </p>
          <SlotBadges kinds={badges} />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">서비스</legend>
          {window.menus.map((item) => {
            const closed = item.starts.length === 0;
            return (
              <label
                key={item.menuId}
                className={cn(
                  'flex cursor-pointer flex-col gap-1 rounded-xl border bg-background p-3 text-sm transition-colors',
                  'has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-2 has-focus-visible:ring-ring/50',
                  closed && 'cursor-not-allowed opacity-60',
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="window-menu"
                      className="size-4 accent-primary"
                      checked={pick.menuId === item.menuId}
                      disabled={closed || pending}
                      onChange={() => chooseMenu(item.menuId)}
                    />
                    {item.name}
                  </span>
                  {item.durationMinutes > 0 ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDuration(item.durationMinutes)}
                    </span>
                  ) : null}
                </span>
                <Price
                  listPrice={item.listPrice}
                  salePrice={item.salePrice}
                  discountRate={item.discountRate}
                  size="sm"
                  className="pl-6"
                />
                {closed ? (
                  <span className="pl-6 text-xs text-muted-foreground">
                    지금 고를 수 있는 시각이 없어요
                  </span>
                ) : null}
              </label>
            );
          })}
          {menu?.description ? (
            <p className="text-sm whitespace-pre-line text-muted-foreground">{menu.description}</p>
          ) : null}
        </fieldset>

        {menu && menu.starts.length > 0 ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">시작 시각</legend>
            <div className="grid grid-cols-3 gap-2">
              {menu.starts.map((item) => (
                <label
                  key={item.startAt}
                  className={cn(
                    'flex cursor-pointer flex-col items-center rounded-lg border bg-background px-2 py-2 text-center transition-colors max-md:min-h-11',
                    'has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground',
                    'has-focus-visible:ring-2 has-focus-visible:ring-ring/50',
                  )}
                >
                  <input
                    type="radio"
                    name="window-start"
                    className="sr-only"
                    checked={start?.startAt === item.startAt}
                    disabled={pending}
                    onChange={() => chooseStart(item.startAt)}
                  />
                  <span className="text-sm font-semibold tabular-nums">
                    {formatKstTime(new Date(item.startAt))}
                  </span>
                  <span className="text-xs opacity-80">{startEndText(item)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {menu && start ? (
          <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3 text-sm">
            <p className="font-medium">{menu.name}</p>
            <p className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              <span>
                {formatKst(new Date(start.startAt))}
                {menu.durationMinutes > 0 ? ` · ${formatDuration(menu.durationMinutes)}` : ''}
              </span>
            </p>
            <Countdown
              key={start.startAt}
              targetAt={start.startAt}
              serverNow={window.serverNow}
              className={
                timeFlags?.nonRefundable
                  ? 'pl-6 font-semibold text-destructive'
                  : 'pl-6 text-muted-foreground'
              }
            />
            <Price
              listPrice={menu.listPrice}
              salePrice={menu.salePrice}
              discountRate={menu.discountRate}
            />
          </div>
        ) : null}

        <RefundPolicyDetails />
        {/* PC: 서비스가 많아 상자 안을 내려야 할 때도 [예약하기]가 상자 맨 아래에 늘 보이게 붙여 둔다 */}
        <div className="hidden md:sticky md:-bottom-5 md:-mx-5 md:block md:border-t md:bg-card md:px-5 md:py-3">
          {reserveBlock}
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-[480px] border-t bg-background p-3 md:hidden">
        {reserveBlock}
      </div>
    </>
  );
}

/** [예약하기]와 실패 안내. 다 고르기 전에는 무엇을 골라야 하는지 버튼에 적고 누를 수 없다 */
function ReserveBlock({
  hint,
  pending,
  error,
  onReserve,
}: {
  hint: string | null;
  pending: boolean;
  error: ReserveError | null;
  onReserve: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="lg"
        className="h-12 w-full text-base"
        disabled={hint !== null || pending}
        onClick={onReserve}
      >
        {pending ? '예약하는 중…' : (hint ?? '예약하기')}
      </Button>
      {error ? (
        <div role="alert" className="flex flex-col gap-1 text-sm text-destructive">
          <p>{error.message}</p>
          {error.heldSlotId ? (
            <Link href={checkoutPath(error.heldSlotId)} className="font-semibold underline">
              결제 중인 매물로 가기
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
