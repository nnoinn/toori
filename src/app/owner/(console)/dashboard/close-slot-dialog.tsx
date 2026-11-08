'use client';

// 매물 마감 확인 창 (O10, S-206). 사유(다른 곳 예약 / 잘못 올림 / 기타)를 골라야 마감할 수 있다.
// 서버가 판매 전·결제 중 아님을 다시 확인하고, 막히면 이유를 이 창에 보여준다.

import { useState, useTransition } from 'react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SlotCloseReason } from '@/db/schema/slots';
import { formatKst } from '@/lib/time';

import { closeSlot } from '../slots/actions';
import { SLOT_CLOSE_REASON_LABELS, SLOT_CLOSE_REASON_OPTIONS } from '../slots/slot-edit';
import type { DashboardSlot } from './dashboard';

/** 확인 창 틀. 처리 중(pending)은 창과 안쪽 폼이 같이 써서, 처리하는 동안 바깥을 눌러도 닫히지 않는다 */
export function CloseSlotDialog({
  shopId,
  slot,
  onDone,
}: {
  shopId: string;
  /** 마감할 매물. null이면 창을 닫는다 */
  slot: DashboardSlot | null;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={slot !== null} onOpenChange={(open) => !open && !pending && onDone()}>
      {slot ? (
        // 매물이 바뀌면 고른 사유를 비운다
        <CloseSlotForm
          key={slot.id}
          shopId={shopId}
          slot={slot}
          pending={pending}
          startTransition={startTransition}
          onDone={onDone}
        />
      ) : null}
    </Dialog>
  );
}

/** 사유 고르기와 [마감하기]. 매물마다 key로 새로 그려서 다른 매물을 열면 고른 사유가 비워진다 */
function CloseSlotForm({
  shopId,
  slot,
  pending,
  startTransition,
  onDone,
}: {
  shopId: string;
  slot: DashboardSlot;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<SlotCloseReason | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  /** 서버가 판매 전·결제 중 아님을 다시 보고 마감한다. 막히면 창을 닫지 않고 이유를 보여준다 */
  function submit() {
    if (!reason) return;
    setMessage(null);
    startTransition(async () => {
      const result = await closeSlot(shopId, slot.id, reason);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      onDone();
    });
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>매물을 마감할까요?</DialogTitle>
        <DialogDescription>
          {formatKst(new Date(slot.startAt))} {slot.menuName} 매물을 마감하면 고객 화면에서
          내려가요. 같은 시간에 새 매물은 다시 올릴 수 있어요.
        </DialogDescription>
      </DialogHeader>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">마감 사유</legend>
        <div className="flex flex-wrap gap-2">
          {SLOT_CLOSE_REASON_OPTIONS.map((key) => (
            <label
              key={key}
              className={cn(
                'flex h-9 cursor-pointer items-center rounded-lg border px-3 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
                reason === key && 'border-primary bg-primary/10 font-semibold',
              )}
            >
              <input
                type="radio"
                name="closeReason"
                value={key}
                checked={reason === key}
                onChange={() => {
                  setReason(key);
                  setMessage(null);
                }}
                className="sr-only"
              />
              {SLOT_CLOSE_REASON_LABELS[key]}
            </label>
          ))}
        </div>
      </fieldset>
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="lg" disabled={pending} onClick={onDone}>
          취소
        </Button>
        <Button type="button" size="lg" disabled={!reason || pending} onClick={submit}>
          {pending ? '마감하는 중…' : '마감하기'}
        </Button>
      </div>
    </DialogContent>
  );
}
