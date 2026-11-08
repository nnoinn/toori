'use client';

// 매물 마감 확인 창 (O10, S-206). 사유(다른 곳 예약 / 잘못 올림 / 기타)를 골라야 마감할 수 있다.
// 서버가 판매 전·결제 중 아님을 다시 확인하고, 막히면 이유를 이 창에 보여준다.

import { useState, useTransition } from 'react';

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

import { ChoiceChips } from '../choice-chips';
import { closeSlot } from '../slots/actions';
import { SLOT_CLOSE_REASON_LABELS, SLOT_CLOSE_REASON_OPTIONS } from '../slots/slot-edit';
import type { DashboardSlot } from './dashboard';

/** 마감 사유 칩(다른 곳 예약 / 잘못 올림 / 기타) */
const REASON_CHIPS = SLOT_CLOSE_REASON_OPTIONS.map((key) => ({
  key,
  label: SLOT_CLOSE_REASON_LABELS[key],
}));

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
      <ChoiceChips
        legend="마감 사유"
        name="closeReason"
        options={REASON_CHIPS}
        value={reason}
        onChange={(key) => {
          setReason(key);
          setMessage(null);
        }}
      />
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
