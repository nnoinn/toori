'use client';

import { useLayoutEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow, useRouter } from 'next/navigation';

import { Button, buttonVariants } from '@/components/ui/button';
import { customerJoinPath, loginPath } from '@/server/auth/paths';
import { holdSlot } from '@/server/payments/checkout';

import type { SlotAvailability } from './types';

const ACTION_LABEL: Record<SlotAvailability, string> = {
  available: '예약하기',
  onHold: '다른 고객이 결제 중이에요',
  mine: '결제 이어서 하기',
  closed: '예약할 수 없는 매물이에요',
};

const HOLD_FAILED_MESSAGE = '예약을 시작하지 못했어요. 잠시 후 다시 시도해 주세요';

export function checkoutPath(slotId: string): string {
  return `/checkout/${slotId}`;
}

/**
 * 예약하기 (C-404, J10). 누르는 순간 10분 홀딩(holdSlot, #121)을 걸고 예약 확인 화면으로 간다.
 * 로그인 안 함·원장님 모드면 로그인 화면으로, 고객 계정이 없으면 약관 동의로 보내고 이 매물로 돌아온다(D1).
 * 이미 내가 홀딩한 매물이면 남은 시간 그대로 예약 확인 화면으로 간다
 */
export function ReserveButton({
  slotId,
  availability,
}: {
  slotId: string;
  availability: SlotAvailability;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; heldSlotId?: string } | null>(null);
  // 상세를 떠나면 Next.js가 이 화면을 숨겨 두었다가 그대로 다시 보여준다(Activity). 지난 실패 문구는 떠날 때 지운다
  useLayoutEffect(() => () => setError(null), []);
  const className = 'h-12 w-full text-base';

  if (availability === 'mine') {
    return (
      <Link href={checkoutPath(slotId)} className={buttonVariants({ size: 'lg', className })}>
        {ACTION_LABEL.mine}
      </Link>
    );
  }
  if (availability !== 'available') {
    return (
      <Button type="button" size="lg" className={className} disabled>
        {ACTION_LABEL[availability]}
      </Button>
    );
  }

  function reserve() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await holdSlot(slotId);
        if (result.ok) {
          router.push(checkoutPath(slotId));
          return;
        }
        const here = `/slots/${slotId}`;
        switch (result.error.code) {
          case 'UNAUTHENTICATED':
          case 'WRONG_MODE':
            router.push(loginPath('customer', here));
            return;
          case 'NO_CUSTOMER_ACCOUNT':
            router.push(customerJoinPath(here));
            return;
          case 'HELD_BY_OTHER':
          case 'SLOT_NOT_AVAILABLE':
            // 매물 상태가 바뀌었으니 화면을 다시 그린다(버튼이 "결제 중"·"예약할 수 없는"으로 바뀐다)
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

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="lg" className={className} disabled={pending} onClick={reserve}>
        {pending ? '예약하는 중…' : ACTION_LABEL.available}
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
