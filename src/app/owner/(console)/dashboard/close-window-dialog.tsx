'use client';

// 시간대 매물 마감 확인 창 (#308, S-206과 같은 사유). 사유(다른 곳 예약 / 잘못 올림 / 기타)를 골라야 마감할 수 있다.
// 강규민 closeSlotWindow가 내 샵의 열린 시간대인지 다시 확인하고 사유·시각을 남긴다. 막히면 이유를 이 창에 보여준다.
// 시간대 안에서 이미 결제가 끝난 예약은 그대로이고 남은 빈 시간만 닫힌다.
// 손님이 결제 중인 칸은 남는다(11/13 nnoinn, #385). 결과에 남긴 칸이 있으면 창을 닫지 않고 "시간대를 마감했어요"와
// 남긴 칸 안내(keptSlotsNotice)를 보여주고, [확인]을 눌러야 닫힌다(WINDOW-06). 남긴 칸이 없으면 지금처럼 바로 닫힌다.
// 창을 닫은 뒤에도 결제가 끝날 때까지 그 시간대 줄에 같은 안내가 남는다(dashboard-rows.tsx WindowRow).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SlotCloseReason } from '@/db/schema/slots';
import { formatEndTime, formatKst } from '@/lib/time';
import { closeSlotWindow } from '@/server/slot-windows/actions';

import { ChoiceChips } from '../choice-chips';
import { REASON_CHIPS } from './close-slot-dialog';
import { type DashboardWindow, keptSlotsNotice } from './dashboard';

/** 확인 창 틀. 처리 중(pending)은 창과 안쪽 폼이 같이 써서, 처리하는 동안 바깥을 눌러도 닫히지 않는다 */
export function CloseWindowDialog({
  shopId,
  window,
  onDone,
}: {
  shopId: string;
  /** 마감할 시간대. null이면 창을 닫는다 */
  window: DashboardWindow | null;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={window !== null} onOpenChange={(open) => !open && !pending && onDone()}>
      {window ? (
        // 시간대가 바뀌면 고른 사유를 비운다
        <CloseWindowForm
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

/**
 * 사유 고르기와 [마감하기]. 마감하면 대시보드를 다시 읽어 그 줄을 마감으로 바꾼다.
 * 손님이 결제 중이라 남긴 칸이 있으면 닫지 않고 마감 결과(ClosedWindowNotice)로 바꾼다
 */
function CloseWindowForm({
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
  const router = useRouter();
  const [reason, setReason] = useState<SlotCloseReason | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // 마감했는데 손님이 결제 중이라 남긴 칸이 있으면 그 안내
  const [keptNotice, setKeptNotice] = useState<string | null>(null);

  function submit() {
    if (!reason) return;
    setMessage(null);
    startTransition(async () => {
      const result = await closeSlotWindow(shopId, { windowId: window.id, reason });
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      router.refresh();
      const notice = keptSlotsNotice(result.data.keptSlots);
      if (notice) {
        setKeptNotice(notice);
        return;
      }
      onDone();
    });
  }

  if (keptNotice) {
    return <ClosedWindowNotice window={window} notice={keptNotice} onDone={onDone} />;
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>시간대를 마감할까요?</DialogTitle>
        <DialogDescription>
          {windowRange(window)} 시간대를 마감하면 고객 화면에서 내려가요. 이미 예약된 손님은
          그대로이고, 남은 빈 시간만 닫혀요.
        </DialogDescription>
      </DialogHeader>
      <ChoiceChips
        legend="마감 사유"
        name="windowCloseReason"
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

/** 마감한 뒤 손님이 결제 중이라 남긴 칸이 있을 때의 결과(WINDOW-06). [확인]을 눌러야 닫힌다 */
function ClosedWindowNotice({
  window,
  notice,
  onDone,
}: {
  window: DashboardWindow;
  notice: string;
  onDone: () => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>시간대를 마감했어요</DialogTitle>
        <DialogDescription>
          {windowRange(window)} 시간대가 고객 화면에서 내려갔어요.
        </DialogDescription>
      </DialogHeader>
      <p role="status">{notice}</p>
      <div className="flex justify-end">
        <Button type="button" size="lg" onClick={onDone}>
          확인
        </Button>
      </div>
    </DialogContent>
  );
}

/** 창에 쓰는 시간대 범위. 예: "11/14(토) 13:00 ~ 18:00", 다음 날 끝나면 "~ 02:00(익일)" */
function windowRange(window: DashboardWindow): string {
  return `${formatKst(new Date(window.startAt))} ~ ${formatEndTime(window.startAt, window.endAt)}`;
}
