'use client';

// 시간대 매물 할인율 수정 창 (11/16 정민석). 대시보드 시간대 줄의 [수정]을 누르면 뜬다.
// 서비스마다 할인율(10~50%)만 바꾼다. 시간은 바꿀 수 없어서 맨 위에 "마감하고 새로 등록"을 안내한다.
// 할인율 칩은 등록 화면(slots/window/window-steps.tsx RateChips)과 같고, 할인가는 등록과 같은 계산(calcSalePrice)이다.
// 이미 예약됐거나 손님이 결제 중인 칸은 그 가격 그대로라고 알려 준다. 저장하면 대시보드를 다시 읽고 창을 닫는다

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Price } from '@/components/ui/price';
import { formatWon } from '@/lib/format';
import { calcSalePrice, type DiscountRate } from '@/server/policy';

import { updateWindowRates } from '../slots/window/actions';
import { WINDOW_TIME_LOCKED_NOTICE } from '../slots/window/window-rates';
import { RateChips } from '../slots/window/window-steps';
import { windowRange } from './close-window-dialog';
import type { DashboardWindow } from './dashboard';

export function EditWindowDialog({
  shopId,
  window,
  onDone,
}: {
  shopId: string;
  /** 고칠 시간대. null이면 창을 닫는다 */
  window: DashboardWindow | null;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={window !== null} onOpenChange={(open) => !open && !pending && onDone()}>
      {window ? (
        // 시간대가 바뀌면 고른 할인율을 그 시간대 값으로 다시 채운다
        <EditWindowForm
          key={window.id}
          shopId={shopId}
          window={window}
          pending={pending}
          startTransition={startTransition}
          onDone={onDone}
        />
      ) : null}
    </Dialog>
  );
}

function EditWindowForm({
  shopId,
  window,
  pending,
  startTransition,
  onDone,
}: {
  shopId: string;
  window: DashboardWindow;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  onDone: () => void;
}) {
  const [rates, setRates] = useState<Record<string, number>>(() =>
    Object.fromEntries(window.menus.map((menu) => [menu.menuId, menu.discountRate])),
  );
  const [message, setMessage] = useState<string | null>(null);
  const changed = window.menus.some((menu) => rates[menu.menuId] !== menu.discountRate);

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateWindowRates(shopId, {
        windowId: window.id,
        rates: window.menus.map((menu) => ({
          menuId: menu.menuId,
          discountRate: rates[menu.menuId],
        })),
      });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      onDone();
    });
  }

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>시간대 매물 할인율 수정</DialogTitle>
        <DialogDescription>
          {windowRange(window)} · {WINDOW_TIME_LOCKED_NOTICE}
        </DialogDescription>
      </DialogHeader>
      <ul className="flex flex-col divide-y rounded-lg border" aria-label="서비스별 할인율">
        {window.menus.map((menu) => {
          const rate = rates[menu.menuId] as DiscountRate;
          return (
            <li key={menu.menuId} className="flex items-center gap-4 p-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{menu.name}</span>
                <span className="text-xs text-muted-foreground">
                  정가 {formatWon(menu.listPrice)}
                </span>
              </div>
              <RateChips
                label={`${menu.name} 할인율`}
                value={rate}
                size="default"
                onChoose={(value) => {
                  setRates((prev) => ({ ...prev, [menu.menuId]: value }));
                  setMessage(null);
                }}
              />
              <div className="flex w-36 justify-end">
                <Price
                  listPrice={menu.listPrice}
                  salePrice={calcSalePrice(menu.listPrice, rate)}
                  discountRate={rate}
                  size="sm"
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-muted-foreground">
        이미 예약됐거나 손님이 결제 중인 칸은 그때 가격 그대로예요. 바꾼 할인율은 다음 예약부터
        적용돼요.
      </p>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onDone}>
          취소
        </Button>
        <Button type="button" size="lg" disabled={!changed || pending} onClick={submit}>
          {pending ? '저장하는 중…' : '저장'}
        </Button>
      </div>
    </DialogContent>
  );
}
