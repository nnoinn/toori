'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';
import {
  forceCloseSlot,
  forceCloseWindow,
  pauseShopPublishing,
  resumeShopPublishing,
} from '@/server/slots/admin';

export type SlotControlTarget =
  | { kind: 'pause'; shopId: string }
  | { kind: 'resume'; shopId: string }
  | { kind: 'close_slot'; slotId: string }
  | { kind: 'close_window'; windowId: string };

const TEXT: Record<
  SlotControlTarget['kind'],
  {
    button: string;
    title: string;
    description: string;
    label: string;
    placeholder: string;
    submit: string;
    destructive: boolean;
  }
> = {
  pause: {
    button: '게시 멈추기',
    title: '이 샵의 새 매물 게시를 멈출까요?',
    description:
      '다시 열 때까지 이 샵은 새 매물·시간대 매물을 올릴 수 없어요. 이미 올린 매물과 예약은 그대로예요. 원장님에게 알림이 가고, 사유는 원장님에게 보이지 않아요.',
    label: '사유',
    placeholder: '예: 실제와 다른 매물 신고 확인 중',
    submit: '게시 멈추기',
    destructive: true,
  },
  resume: {
    button: '다시 열기',
    title: '새 매물 게시를 다시 열까요?',
    description: '원장님이 바로 새 매물을 올릴 수 있어요. 원장님에게 알림이 가요.',
    label: '메모',
    placeholder: '예: 확인 끝, 문제 없음',
    submit: '다시 열기',
    destructive: false,
  },
  close_slot: {
    button: '강제 마감',
    title: '이 매물을 운영자 마감으로 닫을까요?',
    description:
      '고객 목록에서 바로 사라지고 되돌릴 수 없어요. 손님이 결제 중이면 마감되지 않아요. 원장님에게 알림이 가고, 사유는 원장님에게 보이지 않아요.',
    label: '사유',
    placeholder: '예: 실제와 다른 가격으로 올림',
    submit: '강제 마감',
    destructive: true,
  },
  close_window: {
    button: '강제 마감',
    title: '이 시간대 매물을 운영자 마감으로 닫을까요?',
    description:
      '남은 시간이 고객 목록에서 바로 사라지고 되돌릴 수 없어요. 결제가 끝난 예약은 그대로이고, 손님이 결제 중인 칸은 결제가 끝날 때까지 남아요. 원장님에게 알림이 가고, 사유는 원장님에게 보이지 않아요.',
    label: '사유',
    placeholder: '예: 영업하지 않는 시간에 올림',
    submit: '강제 마감',
    destructive: true,
  },
};

// 운영자 매물 관리 버튼(#373 ④). 사유(다시 열 때는 메모, 필수)를 받고 확인 창에서 한 번 더 확인한다.
// 성공하면 창을 닫고 화면을 새로 읽어 바뀐 상태를 보여 준다
export function SlotControlAction({
  target,
  size,
}: {
  target: SlotControlTarget;
  size?: 'sm' | 'default';
}) {
  const router = useRouter();
  const reasonId = useId();
  const text = TEXT[target.kind];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    switch (target.kind) {
      case 'pause':
        return pauseShopPublishing({ shopId: target.shopId, reason });
      case 'resume':
        return resumeShopPublishing({ shopId: target.shopId, memo: reason });
      case 'close_slot':
        return forceCloseSlot({ slotId: target.slotId, reason });
      case 'close_window':
        return forceCloseWindow({ windowId: target.windowId, reason });
    }
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await run();
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        setOpen(false);
        setReason('');
        router.refresh();
      } catch {
        setError('처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  return (
    <>
      <Button variant="outline" size={size} onClick={() => setOpen(true)}>
        {text.button}
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text.title}</DialogTitle>
            <DialogDescription>{text.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={reasonId}>{text.label}</Label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={ADMIN_REASON_LIMIT}
              rows={3}
              placeholder={text.placeholder}
            />
            <p className="text-xs text-muted-foreground">
              운영자 처리 기록에 남아요. 손님·원장님에게는 보이지 않아요.
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={close} disabled={pending}>
              취소
            </Button>
            <Button
              variant={text.destructive ? 'destructive' : 'default'}
              onClick={submit}
              disabled={pending || reason.trim() === ''}
            >
              {text.submit}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
